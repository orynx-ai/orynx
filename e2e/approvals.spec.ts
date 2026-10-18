import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { answerClaudeAs, fakeClaudeDirFor } from './fake-claude/config.ts';
import { approvalsHubPort, controlPortFor, type FakeTools } from './fake-tools/config.ts';

declare global {
  interface Window {
    axe: {
      run: (
        context: Element,
        options: object,
      ) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }>;
    };
  }
}

const axePath = createRequire(new URL('../packages/ui/package.json', import.meta.url)).resolve('axe-core/axe.min.js');

// Spec 012 on its own hub (playwright.config.ts): its permission modes and allow list change from test to test.
test.use({ baseURL: `http://127.0.0.1:${String(approvalsHubPort)}` });
test.describe.configure({ mode: 'serial' });

// The fake Claude Code edits a file, then runs what the ticket's title asks for (e2e/fake-claude/session.ts).
const tools: FakeTools = {
  sprint: true,
  issues: [
    { key: 'PROJ-2001', summary: 'Check the content list (runs tests)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2002', summary: 'Check the list once more (runs tests)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2003', summary: 'Look up the package (fetches)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2004', summary: 'Lint and test (runs two)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2005', summary: 'Ship the archive (pushes)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2006', summary: 'Wait on a command (runs tests)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2007', summary: 'Stop while it asks (runs tests)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2008', summary: 'Tidy the list (runs tests)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2009', summary: 'Tidy the list again (runs tests)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2010', summary: 'Archive old events', status: 'To Do', category: 'new' },
    { key: 'PROJ-2011', summary: 'Answer by keyboard (runs tests)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2012', summary: 'Look at a command (runs tests)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2013', summary: 'Look at the network line (fetches)', status: 'To Do', category: 'new' },
    { key: 'PROJ-2014', summary: 'Look at an edit', status: 'To Do', category: 'new' },
  ],
  reviews: [],
  mine: [],
};

/** A real repository in a temporary folder, with a bare origin, and git that reads none of your settings. */
function makeRepository() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'devhub-e2e-approvals-repo-')));
  const env = {
    PATH: process.env['PATH'] ?? '/usr/bin:/bin',
    HOME: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  writeFileSync(join(root, '.gitconfig'), '[init]\n\tdefaultBranch = main\n');
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
  const origin = join(root, 'origin.git');
  const seed = join(root, 'seed');
  const clone = join(root, 'web-app');
  git(root, 'init', '--bare', origin);
  git(root, 'clone', origin, seed);
  writeFileSync(join(seed, 'README.md'), '# web-app\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'first');
  git(seed, 'push', 'origin', 'main');
  git(root, 'clone', origin, clone);
  return { root, clone, git };
}

const repository = makeRepository();

/** Sends a request to the hub with the page's token, as the page does. */
async function api(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const token = document.querySelector('meta[name="devhub-token"]')?.getAttribute('content') ?? '';
      const answer = await fetch(path, {
        method,
        headers: { 'x-devhub-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!answer.ok) throw new Error(`${method} ${path} answered ${String(answer.status)}`);
      return answer.status === 204 ? null : ((await answer.json()) as unknown);
    },
    { method, path, body },
  );
}

/** The ticket's worktree, by its branch. */
function worktreeOf(key: string): string {
  const worktree = repository
    .git(repository.clone, 'worktree', 'list', '--porcelain')
    .split('\n\n')
    .find((entry) => entry.includes(`branch refs/heads/feat/${key}`))
    ?.split('\n')[0]
    ?.slice('worktree '.length);
  if (worktree === undefined) throw new Error(`No worktree for ${key}`);
  return worktree;
}

/** The commands the fake Claude Code ran in a ticket's worktree; empty when it ran none. */
function ran(key: string): string[] {
  const file = join(worktreeOf(key), 'ran.txt');
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : [];
}

/** Presses Ship on the ticket's card and waits for its Session screen. */
async function build(page: Page, key: string): Promise<string> {
  await page.goto('/tickets');
  await page.getByRole('button', { name: `Ship ${key}` }).click();
  await page.waitForURL(/\/sessions\/[0-9a-f]{16}$/);
  return page.url();
}

function progress(page: Page) {
  return page.getByRole('region', { name: "Claude's progress" });
}

async function finished(page: Page) {
  await expect(page.getByRole('main').getByText('Done, ready for PR')).toBeVisible({ timeout: 15_000 });
}

/** The callout holds exactly these buttons, by the names a screen reader hears, in this order. */
async function expectButtons(callout: Locator, names: string[]) {
  await expect(callout.getByRole('button')).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(callout.getByRole('button').nth(index)).toHaveAccessibleName(name);
  }
}

/** axe's violations in the page or one part of it, once anything fading in has settled. */
async function axe(page: Page, selector = 'body'): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async (context) => {
    const target = document.querySelector(context);
    if (target === null) throw new Error(`Nothing matches ${context}`);
    const moving = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    await Promise.allSettled(moving.map((animation) => animation.finished));
    const results = await window.axe.run(target, { resultTypes: ['violations'] });
    return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
  }, selector);
}

/** No axe violations and nothing scrolling sideways, at 1280 and 360 px, in light and dark. */
async function checkEverywhere(page: Page, ready: () => Promise<void>, what: string) {
  for (const width of [1280, 360]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme });
      await ready();
      expect(await axe(page), `${what} at ${String(width)} px, ${colorScheme}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}

async function setMode(page: Page, permissionMode: string) {
  await api(page, 'PATCH', '/api/preferences', { permissionMode });
}

test.beforeAll(async ({ browser }, testInfo) => {
  test.skip((testInfo.project.use.viewport?.width ?? 0) < 768, 'the approvals share one hub and one repository');
  const page = await browser.newPage({ baseURL: `http://127.0.0.1:${String(approvalsHubPort)}` });
  await page.goto('/settings/connections');
  const answer = await page.request.put(`http://127.0.0.1:${String(controlPortFor(approvalsHubPort))}/tools`, {
    data: tools,
  });
  expect(answer.status()).toBe(204);
  await api(page, 'PUT', '/api/jira/connection', {
    site: 'your-team.atlassian.net',
    email: 'dev@example.com',
    apiToken: 'fake-good-token',
  });
  await answerClaudeAs('signed_in', fakeClaudeDirFor(approvalsHubPort));
  await api(page, 'POST', '/api/claude/login/check');
  await api(page, 'POST', '/api/repositories', { path: repository.clone, jiraProject: 'PROJ' });
  await api(page, 'POST', '/api/inbox/refresh');
  await page.close();
});

test.afterAll(() => {
  rmSync(repository.root, { recursive: true, force: true });
});

test('AC-1, AC-2: a command asks in place, and Allow once runs it', async ({ page }) => {
  await build(page, 'PROJ-2001');

  const callout = progress(page).getByRole('alert');
  await expect(callout.getByText('Claude wants to run a command')).toBeVisible({ timeout: 15_000 });
  await expect(callout.getByText('npm test -- content-list')).toBeVisible();
  await expectButtons(callout, ['Allow once', 'Deny']);
  await expect(page.getByRole('main').getByText('Needs your approval')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByText('Needs you')).toBeVisible();
  await expect(progress(page).getByText('Waiting for your approval')).toBeVisible();
  await expect(progress(page).getByText('Run the content list tests')).toBeVisible();
  expect(ran('PROJ-2001')).toEqual([]);

  await callout.getByRole('button', { name: 'Allow once' }).click();

  await finished(page);
  await expect(progress(page).getByRole('alert')).toBeHidden();
  await expect(progress(page).getByText('Ran 1 command')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Session progress' }).getByText('Review')).toHaveAttribute(
    'aria-current',
    'step',
  );
  expect(ran('PROJ-2001')).toEqual(['npm test -- content-list']);
});

test('AC-3: Deny keeps the command from running, and Claude carries on', async ({ page }) => {
  await build(page, 'PROJ-2002');
  await progress(page).getByRole('button', { name: 'Deny' }).click({ timeout: 15_000 });
  await finished(page);
  await expect(progress(page).getByText('You denied a command')).toBeVisible();
  expect(ran('PROJ-2002')).toEqual([]);
});

test('AC-6: a command that reaches the network says why it always asks, with no Always allow, in any mode', async ({
  page,
}) => {
  await page.goto('/');
  await setMode(page, 'edit_and_run_allowed');
  await build(page, 'PROJ-2003');
  const callout = progress(page).getByRole('alert');
  await expect(
    callout.getByText(
      'This reaches the network, so it always asks. If you allow it, it runs once outside the sandbox.',
    ),
  ).toBeVisible({ timeout: 15_000 });
  await expectButtons(callout, ['Allow once', 'Deny']);
  await callout.getByRole('button', { name: 'Allow once' }).click();
  await finished(page);
  expect(ran('PROJ-2003')).toEqual(['curl -fsS https://registry.npmjs.org/react']);
  await setMode(page, 'edit_freely_ask_commands');
});

test('AC-10: two commands asked together wait in turn', async ({ page }) => {
  await build(page, 'PROJ-2004');
  const callout = progress(page).getByRole('alert');
  await expect(callout.getByText('npm test', { exact: true })).toBeVisible({ timeout: 15_000 });
  await callout.getByRole('button', { name: 'Allow once' }).click();
  await expect(callout.getByText('npm run lint', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('Needs your approval')).toBeVisible();
  await callout.getByRole('button', { name: 'Deny' }).click();
  await finished(page);
  expect(ran('PROJ-2004')).toEqual(['npm test']);
});

test('AC-7: a push is refused without asking, and the progress says so', async ({ page }) => {
  await build(page, 'PROJ-2005');
  await finished(page);
  await expect(progress(page).getByText("Couldn't push: that waits for Create pull request")).toBeVisible();
  expect(ran('PROJ-2005')).toEqual([]);
});

test('AC-13: an answer in one tab takes the callout away in the other', async ({ page, context }) => {
  const url = await build(page, 'PROJ-2006');
  await expect(progress(page).getByRole('alert')).toBeVisible({ timeout: 15_000 });
  const other = await context.newPage();
  await other.goto(url);
  await expect(progress(other).getByRole('alert')).toBeVisible();

  await progress(page).getByRole('button', { name: 'Allow once' }).click();

  await expect(progress(other).getByRole('alert')).toBeHidden({ timeout: 1_000 });
  await finished(other);
  await other.close();
});

test('AC-12: Stop while a command waits denies it and stops Claude', async ({ page }) => {
  await build(page, 'PROJ-2007');
  await expect(progress(page).getByRole('alert')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Stop Claude' }).click();
  await expect(page.getByRole('main').getByText('Stopped', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(progress(page).getByRole('alert')).toBeHidden();
  await expect(progress(page).getByText('You stopped Claude')).toBeVisible();
  expect(ran('PROJ-2007')).toEqual([]);
});

test('AC-4, AC-5: Always allow adds the command to the list, and the next one runs without asking', async ({
  page,
}) => {
  await page.goto('/');
  await setMode(page, 'edit_and_run_allowed');
  await build(page, 'PROJ-2008');
  const callout = progress(page).getByRole('alert');
  await callout.getByRole('button', { name: 'Always allow npm test' }).click({ timeout: 15_000 });
  await finished(page);
  expect(ran('PROJ-2008')).toEqual(['npm test -- content-list']);

  await page.goto('/settings/coding-agent');
  await expect(
    page.getByRole('region', { name: 'Allowed commands' }).getByRole('button', { name: 'Remove npm test' }),
  ).toBeVisible();

  await build(page, 'PROJ-2009');
  await finished(page);
  await expect(progress(page).getByRole('alert')).toBeHidden();
  await expect(progress(page).getByText('Ran 1 command')).toBeVisible();
  expect(ran('PROJ-2009')).toEqual(['npm test -- content-list']);
  await setMode(page, 'edit_freely_ask_commands');
});

test('AC-8: an edit asks while Ask before everything is on, with its change, and is made once allowed', async ({
  page,
}) => {
  await page.goto('/');
  await setMode(page, 'ask_everything');
  await build(page, 'PROJ-2010');
  const callout = progress(page).getByRole('alert');
  await expect(callout.getByText('Claude wants to create a file')).toBeVisible({ timeout: 15_000 });
  const change = callout.getByRole('region', { name: 'Changes in archive.ts' });
  await expect(change.getByText('export const archive = true;')).toBeVisible();
  await expectButtons(callout, ['Allow once', 'Deny']);
  expect(existsSync(join(worktreeOf('PROJ-2010'), 'src', 'archive.ts'))).toBe(false);

  await callout.getByRole('button', { name: 'Allow once' }).click();

  await finished(page);
  expect(readFileSync(join(worktreeOf('PROJ-2010'), 'src', 'archive.ts'), 'utf8')).toBe(
    'export const archive = true;\n',
  );
  await setMode(page, 'edit_freely_ask_commands');
});

test('AC-18: a callout leaves focus where it was; Tab reaches its buttons, and focus moves on after an answer', async ({
  page,
}) => {
  await build(page, 'PROJ-2011');
  const callout = progress(page).getByRole('alert');
  await expect(callout).toBeVisible({ timeout: 15_000 });
  expect(await callout.evaluate((element) => element.contains(document.activeElement))).toBe(false);

  await page.getByRole('button', { name: 'Stop Claude' }).focus();
  await page.keyboard.press('Tab');
  await expect(callout.getByRole('button', { name: 'Allow once' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(callout.getByRole('button', { name: 'Deny' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');

  await expect(progress(page)).toBeFocused();
  await finished(page);
});

test('AC-15, AC-18: the allow list in Settings adds by Enter, refuses with its line, and removes by keyboard', async ({
  page,
}) => {
  await page.goto('/settings/coding-agent');
  const allowed = page.getByRole('region', { name: 'Allowed commands' });
  const field = allowed.getByRole('textbox', { name: 'Command' });
  await expect(allowed.getByRole('button', { name: 'Remove npm test' })).toBeVisible();

  await field.fill('pnpm lint');
  await field.press('Enter');
  await expect(allowed.getByRole('button', { name: 'Remove pnpm lint' })).toBeVisible();
  await expect(field).toHaveValue('');
  await expect(field).toBeFocused();

  await field.fill('git push');
  await field.press('Enter');
  await expect(allowed.getByText("git push always asks, so it can't go on the list.")).toBeVisible();

  await allowed.getByRole('button', { name: 'Remove npm test' }).focus();
  await page.keyboard.press('Enter');
  await expect(allowed.getByRole('button', { name: 'Remove pnpm lint' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(field).toBeFocused();
  await expect(allowed.getByText('No commands yet')).toBeVisible();

  // Another tab sees the list as saved.
  const other = await page.context().newPage();
  await other.goto('/settings/coding-agent');
  await expect(other.getByRole('region', { name: 'Allowed commands' }).getByText('No commands yet')).toBeVisible();
  await other.close();
});

test('AC-19: the callouts and the allow list have no axe violations, at 1280 and 360 px, in light and dark', async ({
  page,
}) => {
  const waiting = async (key: string, title: string) => {
    const url = await build(page, key);
    await expect(progress(page).getByRole('alert').getByText(title)).toBeVisible({ timeout: 15_000 });
    await checkEverywhere(
      page,
      async () => {
        await page.goto(url);
        await expect(progress(page).getByRole('alert').getByText(title)).toBeVisible();
      },
      key,
    );
    await page.getByRole('button', { name: 'Stop Claude' }).click();
    await expect(page.getByRole('main').getByText('Stopped', { exact: true })).toBeVisible({ timeout: 10_000 });
  };
  await waiting('PROJ-2012', 'Claude wants to run a command');
  await waiting('PROJ-2013', 'This reaches the network, so it always asks.');
  await page.goto('/');
  await setMode(page, 'ask_everything');
  await waiting('PROJ-2014', 'Claude wants to create a file');
  await setMode(page, 'edit_freely_ask_commands');

  await page.goto('/settings/coding-agent');
  const allowed = page.getByRole('region', { name: 'Allowed commands' });
  await checkEverywhere(
    page,
    async () => {
      await page.goto('/settings/coding-agent');
      await expect(allowed.getByText('No commands yet')).toBeVisible();
    },
    'the empty allow list',
  );
  const field = allowed.getByRole('textbox', { name: 'Command' });
  await field.fill('npm test');
  await field.press('Enter');
  await checkEverywhere(
    page,
    async () => {
      await page.goto('/settings/coding-agent');
      await expect(allowed.getByRole('button', { name: 'Remove npm test' })).toBeVisible();
      await allowed.getByRole('textbox', { name: 'Command' }).fill('npm test && npm run lint');
      await allowed.getByRole('textbox', { name: 'Command' }).press('Enter');
      await expect(allowed.getByText('Add one command at a time, without &&, ; or |.')).toBeVisible();
    },
    'the allow list with an entry and a refusal',
  );
});
