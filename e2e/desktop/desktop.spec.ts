import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { fakeClaude } from '../fake-claude/config.ts';
import { setUpHome } from '../set-up.ts';
import { FakeReleases } from './fake-releases.ts';

// The packed app (spec 027), not the source: only the packed app holds the hub with its own node_modules.
const release = join(import.meta.dirname, '..', '..', 'apps', 'desktop', 'release');
const executable =
  process.platform === 'darwin'
    ? join(release, 'mac-arm64', 'Orynx.app', 'Contents', 'MacOS', 'Orynx')
    : join(release, 'linux-unpacked', 'orynx');
const fakeGh = join(import.meta.dirname, '..', 'fake-gh');

test.beforeAll(() => {
  if (!existsSync(executable)) {
    throw new Error(`No packed app at ${executable}. Pack it first: pnpm --filter @devhub/desktop package --dir`);
  }
});

let home: string;
let releases: FakeReleases;
let opened: ElectronApplication | null;

test.beforeEach(async () => {
  home = setUpHome(await mkdtemp(join(tmpdir(), 'devhub-e2e-desktop-')));
  releases = await FakeReleases.start();
  opened = null;
});

test.afterEach(async () => {
  await opened?.close().catch(() => undefined);
  await releases.close();
  await rm(home, { recursive: true, force: true });
});

/** AC-40: a home of its own, the memory keychain and the e2e fakes: never the real ~/.devhub, keychain or GitHub. */
function environment(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return {
    ...env,
    DEVHUB_HOME: home,
    DEVHUB_KEYCHAIN: 'memory',
    DEVHUB_TOKENS_FROM_ENV: 'false',
    DEVHUB_CLAUDE_CODE: fakeClaude,
    DEVHUB_SANDBOX: 'assume',
    DEVHUB_UPDATES_URL: releases.url,
    LOG_LEVEL: 'info',
    PATH: `${fakeGh}${delimiter}${env['PATH'] ?? ''}`,
  };
}

interface Recorded {
  opened: string[];
  shown: string[];
}

/** Opens the packed app, and swaps the OS's browser and message boxes for recorders: outside services. */
async function launch(answer = 'Later'): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ executablePath: executable, env: environment() });
  opened = app;
  await app.evaluate(({ dialog, shell }, pressed) => {
    const recorded: Recorded = { opened: [], shown: [] };
    Object.assign(globalThis, { recorded });
    shell.openExternal = (url: string) => {
      recorded.opened.push(url);
      return Promise.resolve();
    };
    Object.assign(dialog, {
      showMessageBox: (options: { message: string; buttons: string[] }) => {
        recorded.shown.push(options.message);
        return Promise.resolve({ response: Math.max(0, options.buttons.indexOf(pressed)), checkboxChecked: false });
      },
    });
  }, answer);
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'What should we ship today?' })).toBeVisible();
  return { app, page };
}

function recorded(app: ElectronApplication): Promise<Recorded> {
  return app.evaluate(() => (globalThis as unknown as { recorded: Recorded }).recorded);
}

async function runtime(): Promise<{ port: number; pid: number }> {
  return JSON.parse(await readFile(join(home, 'runtime.json'), 'utf8')) as { port: number; pid: number };
}

async function log(): Promise<string> {
  return readFile(join(home, 'logs', 'orynx.log'), 'utf8');
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((done) => {
    if (child.exitCode !== null) done(child.exitCode);
    else child.once('exit', done);
  });
}

test('AC-3, AC-7, AC-41: opens Home in one 1280 × 800 window on a port the OS picked, with no Node in the page', async () => {
  // Hold 4317 when it's free, as another program might: Orynx doesn't need it.
  const holder: Server = createServer();
  await new Promise<void>((done) =>
    holder
      .once('error', () => {
        done();
      })
      .listen(4317, '127.0.0.1', done),
  );
  try {
    const { app, page } = await launch();

    const { port } = await runtime();
    expect(port).not.toBe(4317);
    expect(page.url()).toBe(`http://127.0.0.1:${String(port)}/`);
    await expect(page).toHaveTitle('Orynx');
    expect(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => window.getSize())),
    ).toEqual([[1280, 800]]);
    expect(
      await page.evaluate(() => [
        typeof (globalThis as { process?: unknown }).process,
        typeof (globalThis as { require?: unknown }).require,
      ]),
    ).toEqual(['undefined', 'undefined']);
  } finally {
    await new Promise((done) => holder.close(done));
  }
});

test('AC-13, AC-14, AC-15: Jira and GitHub links go to the browser, Open in goes to the editor, nothing else leaves', async () => {
  const { app, page } = await launch();
  const hub = page.url();

  await page.evaluate(() => window.open('https://github.com/acme/web/pull/7', '_blank', 'noopener,noreferrer'));
  await page.evaluate(() => window.open('http://example.com/', '_blank'));
  await page.evaluate(() => {
    window.location.href = 'vscode://file/tmp/devhub-e2e/worktree';
  });
  await page.evaluate(() => {
    window.location.href = 'https://example.com/';
  });

  await expect
    .poll(async () => (await recorded(app)).opened)
    .toEqual(['https://github.com/acme/web/pull/7', 'vscode://file/tmp/devhub-e2e/worktree']);
  expect(page.url()).toBe(hub);
  expect(app.windows()).toHaveLength(1);
});

test('AC-21, AC-22: the log holds this launch, and the hub reports the version About Orynx shows', async () => {
  const { app, page } = await launch();

  const version = await page.evaluate(async () => {
    const token = document.querySelector<HTMLMetaElement>('meta[name="devhub-token"]')?.content ?? '';
    const response = await fetch('/api/status', { headers: { 'x-devhub-token': token } });
    return ((await response.json()) as { version: string }).version;
  });
  expect(version).toBe(await app.evaluate(({ app: electronApp }) => electronApp.getVersion()));
  await expect.poll(log).toContain(`The window opens ${new URL(page.url()).origin}.`);
});

test('AC-23, AC-29: a private repo answers 404, and Orynx only logs it, asking with no token', async () => {
  const { app } = await launch();

  await expect.poll(log).toContain("Orynx couldn't check for updates (404).");
  expect((await recorded(app)).shown).toEqual([]);
  expect(releases.requests.length).toBeGreaterThan(0);
  for (const { headers } of releases.requests) expect(headers.authorization).toBeUndefined();
});

test('AC-24: on a Mac, a newer release shows the notice once, and Download opens the release page', async () => {
  test.skip(process.platform !== 'darwin', 'Linux downloads updates instead (unit-tested in updates.test.ts)');
  releases.offer('9.9.9');
  const { app } = await launch('Download');

  await expect.poll(async () => (await recorded(app)).shown, { timeout: 15_000 }).toEqual(['Orynx 9.9.9 is out']);
  await expect
    .poll(async () => (await recorded(app)).opened)
    .toEqual(['https://github.com/masterghost2002/dev-hub/releases/latest']);
});

test('AC-5: opening Orynx again starts no second copy', async () => {
  const { app } = await launch();
  const { pid } = await runtime();

  const again = spawn(executable, [], { env: environment(), stdio: 'ignore' });
  expect(await exited(again)).toBe(0);

  expect(app.windows()).toHaveLength(1);
  expect((await runtime()).pid).toBe(pid);
});

test('AC-8: another Orynx on this home, such as pnpm start, stops the app before it starts a hub', async () => {
  const other: Server = createServer((_request, response) => response.writeHead(200).end());
  await new Promise<void>((done) => other.listen(0, '127.0.0.1', done));
  const port = (other.address() as AddressInfo).port;
  const theirs = `${JSON.stringify({ port, token: 'theirs', pid: process.pid })}\n`;
  await writeFile(join(home, 'runtime.json'), theirs);
  const app = spawn(executable, [], { env: environment(), stdio: 'ignore' });
  try {
    await expect
      .poll(() => log().catch(() => ''))
      .toContain('Another Orynx hub is running on this home, so the app starts none.');
    expect(await log()).not.toContain('Orynx is running at');
    expect(await readFile(join(home, 'runtime.json'), 'utf8')).toBe(theirs);
  } finally {
    // SIGKILL: with its message box open, Electron doesn't act on SIGTERM.
    app.kill('SIGKILL');
    await exited(app);
    other.closeAllConnections();
    await new Promise((done) => other.close(done));
  }
});

test('AC-9: when the hub stops on its own, Orynx says so, and Quit quits', async () => {
  const { app } = await launch('Quit');
  const closed = new Promise((done) => app.process().once('exit', done));

  process.kill((await runtime()).pid, 'SIGKILL');

  await closed;
  opened = null;
  expect(await log()).toContain('The Orynx hub exited');
});

test('AC-18: quitting stops the hub as Ctrl-C does, and removes runtime.json', async () => {
  const { app } = await launch();
  const { pid } = await runtime();
  const closed = new Promise((done) => app.process().once('exit', done));

  await app.evaluate(({ app: electronApp }) => {
    electronApp.quit();
  });

  await closed;
  opened = null;
  expect(isAlive(pid)).toBe(false);
  expect(existsSync(join(home, 'runtime.json'))).toBe(false);
  expect(await log()).toContain('SIGTERM: stopping Orynx');
});
