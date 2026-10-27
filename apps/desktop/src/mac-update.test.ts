import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMacUpdater, zipOf, type MacTools } from './mac-update.ts';
import { watchUpdates, type UpdateState } from './updates.ts';

const zipBytes = Buffer.from('a zip that stands in for Orynx-0.1.40-arm64-mac.zip');
const sha512 = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64');

function latestMac({ version = '0.1.40', hash = sha512(zipBytes) } = {}): string {
  return [
    `version: ${version}`,
    'files:',
    `  - url: Orynx-${version}-arm64-mac.zip`,
    `    sha512: ${hash}`,
    `    size: ${String(zipBytes.length)}`,
    `  - url: Orynx-${version}-arm64.dmg`,
    '    sha512: not-the-zip',
    '    size: 10',
    `path: Orynx-${version}-arm64-mac.zip`,
    `sha512: ${hash}`,
    "releaseDate: '2026-10-22T10:38:28.439Z'",
    '',
  ].join('\n');
}

/** A releases server: GitHub Releases' download folder, an outside service, on this computer. */
let feed: { url: string; files: Map<string, string | Buffer>; server: Server };
let folder: string;
let app: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'orynx-mac-'));
  app = join(folder, 'Applications', 'Orynx.app');
  await mkdir(join(app, 'Contents'), { recursive: true });
  await writeFile(join(app, 'Contents', 'Info.plist'), '0.1.37');
  const files = new Map<string, string | Buffer>([
    ['/latest-mac.yml', latestMac()],
    ['/Orynx-0.1.40-arm64-mac.zip', zipBytes],
  ]);
  const server = createServer((request, response) => {
    const body = files.get(request.url ?? '');
    if (body === undefined) response.writeHead(404).end();
    else response.writeHead(200).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  feed = { url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, files, server };
});

afterEach(async () => {
  await new Promise((resolve) => feed.server.close(resolve));
  await chmod(join(folder, 'Applications'), 0o755).catch(() => undefined);
  await rm(folder, { recursive: true, force: true });
});

/**
 * macOS's own ditto, plutil and codesign, which a Linux test machine doesn't have: the zip "unpacks" to a bundle
 * whose Info.plist holds the version the test says, and the signature checks unless it says otherwise.
 */
function fakeTools({ unpacks = '0.1.40', signed = true } = {}): MacTools {
  return {
    unzip: async (zip, into) => {
      expect(await readFile(zip)).toEqual(zipBytes);
      await mkdir(join(into, 'Orynx.app', 'Contents'), { recursive: true });
      await writeFile(join(into, 'Orynx.app', 'Contents', 'Info.plist'), unpacks);
    },
    version: (bundle) => readFile(join(bundle, 'Contents', 'Info.plist'), 'utf8'),
    verify: () => (signed ? Promise.resolve() : Promise.reject(new Error('invalid signature'))),
  };
}

const installed = () => readFile(join(app, 'Contents', 'Info.plist'), 'utf8');
const readdirNames = async (path: string) => (await readdir(path)).sort();

describe('the Mac’s own update (spec 045, Q2a)', () => {
  it('reads the zip and its sha512 from latest-mac.yml, and nothing that would leave the release', () => {
    expect(zipOf(latestMac())).toEqual({
      version: '0.1.40',
      file: 'Orynx-0.1.40-arm64-mac.zip',
      sha512: sha512(zipBytes),
    });
    expect(zipOf(latestMac().replace('url: Orynx-0.1.40-arm64-mac.zip', 'url: https://evil.dev/x.zip'))).toBeNull();
    expect(zipOf('version: 0.1.40\nfiles: []\n')).toBeNull();
  });

  it('AC-20: downloads the zip, checks its sha512, and Restart to update swaps Orynx.app for the new one', async () => {
    const mac = createMacUpdater({ app, feedUrl: feed.url, tools: fakeTools() });
    expect(await mac.canReplace()).toBe(true);
    await mac.download('0.1.40');
    expect(await installed()).toBe('0.1.37');

    await mac.swap();
    expect(await installed()).toBe('0.1.40');
    // The old one waits beside it until the next start.
    await mac.cleanUp();
    expect(await readdirNames(join(folder, 'Applications'))).toEqual(['Orynx.app']);
  });

  it('AC-23: a sha512 that does not match, a missing file, another version or a bad signature installs nothing', async () => {
    feed.files.set('/latest-mac.yml', latestMac({ hash: sha512(Buffer.from('another zip')) }));
    await expect(createMacUpdater({ app, feedUrl: feed.url, tools: fakeTools() }).download('0.1.40')).rejects.toThrow(
      "the zip's sha512 didn't match",
    );

    feed.files.set('/latest-mac.yml', latestMac());
    feed.files.delete('/Orynx-0.1.40-arm64-mac.zip');
    await expect(createMacUpdater({ app, feedUrl: feed.url, tools: fakeTools() }).download('0.1.40')).rejects.toThrow(
      '404',
    );

    feed.files.set('/Orynx-0.1.40-arm64-mac.zip', zipBytes);
    const older = createMacUpdater({ app, feedUrl: feed.url, tools: fakeTools({ unpacks: '0.1.39' }) });
    await expect(older.download('0.1.40')).rejects.toThrow('the new app says it is 0.1.39');
    const unsigned = createMacUpdater({ app, feedUrl: feed.url, tools: fakeTools({ signed: false }) });
    await expect(unsigned.download('0.1.40')).rejects.toThrow('invalid signature');
    await expect(unsigned.swap()).rejects.toThrow();

    expect(await installed()).toBe('0.1.37');
    expect(await readdirNames(join(folder, 'Applications'))).toEqual(['Orynx.app']);
  });

  it('AC-20: puts the old Orynx.app back when the new one fails to move in', async () => {
    const mac = createMacUpdater({ app, feedUrl: feed.url, tools: fakeTools() });
    await mac.download('0.1.40');
    // Something took the new bundle away before the restart.
    await rm(join(folder, 'Applications', '.Orynx.app-update'), { recursive: true });
    await expect(mac.swap()).rejects.toThrow();
    expect(await installed()).toBe('0.1.37');
  });

  it('AC-21: offers Download when the folder holding Orynx.app can’t be written', async () => {
    await chmod(join(folder, 'Applications'), 0o555);
    expect(await createMacUpdater({ app, feedUrl: feed.url, tools: fakeTools() }).canReplace()).toBe(false);
  });

  it('AC-20, AC-23: through the updater: Update downloads, says ready, and a failed download says so', async () => {
    const told: UpdateState[] = [];
    const logged: string[] = [];
    let restarts = 0;
    const watch = (tools: MacTools) =>
      watchUpdates({
        updater: {
          autoDownload: true,
          autoInstallOnAppQuit: true,
          checkForUpdates: () => Promise.resolve(),
          setFeedURL: () => undefined,
          on: () => undefined,
        },
        platform: 'darwin',
        feedUrl: feed.url,
        mac: createMacUpdater({ app, feedUrl: feed.url, tools }),
        tell: (state) => told.push(state),
        restart: () => {
          restarts += 1;
        },
        log: (line) => logged.push(line),
      });

    const watched = watch(fakeTools());
    await expect.poll(() => told.at(-1)?.action).toBe('update');
    watched.command({ type: 'download', version: '0.1.40' });
    await expect.poll(() => told.at(-1)?.update).toEqual({ state: 'ready', version: '0.1.40' });
    expect(told.map((state) => state.update.state)).toContain('downloading');
    watched.command({ type: 'restart' });
    expect(restarts).toBe(1);

    told.length = 0;
    const failing = watch(fakeTools({ signed: false }));
    await expect.poll(() => told.at(-1)).toEqual({ type: 'update-state', action: 'update', update: { state: 'idle' } });
    failing.command({ type: 'download', version: '0.1.40' });
    await expect.poll(() => told.at(-1)?.update).toEqual({ state: 'failed', log: null });
    expect(logged).toEqual(["Orynx couldn't download the update (invalid signature)."]);
  });
});
