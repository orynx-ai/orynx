import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, constants, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** macOS's own programs the update needs: unpack the zip, read the new app's version, check its signature. */
export interface MacTools {
  unzip(zip: string, into: string): Promise<void>;
  version(app: string): Promise<string>;
  verify(app: string): Promise<void>;
}

export const macTools: MacTools = {
  // ditto keeps the bundle's symlinks and signature as the zip holds them.
  unzip: async (zip, into) => {
    await run('ditto', ['-x', '-k', zip, into]);
  },
  version: async (app) =>
    (
      await run('plutil', [
        '-extract',
        'CFBundleShortVersionString',
        'raw',
        '-o',
        '-',
        join(app, 'Contents', 'Info.plist'),
      ])
    ).stdout.trim(),
  verify: async (app) => {
    await run('codesign', ['--verify', '--deep', '--strict', app]);
  },
};

/** The zip `latest-mac.yml` names, with its sha512, for one version. A name with a path or an address is refused. */
export function zipOf(yml: string): { version: string; file: string; sha512: string } | null {
  let version: string | null = null;
  const files: { file: string; sha512?: string }[] = [];
  for (const line of yml.split('\n')) {
    const top = /^version:\s*'?([^'\s]+)'?\s*$/.exec(line);
    if (top?.[1] !== undefined) version = top[1];
    const file = /^\s*-\s*url:\s*'?([^'\s]+)'?\s*$/.exec(line);
    if (file?.[1] !== undefined) files.push({ file: file[1] });
    const sha = /^\s+sha512:\s*'?([^'\s]+)'?\s*$/.exec(line);
    const last = files.at(-1);
    if (sha?.[1] !== undefined && last !== undefined) last.sha512 = sha[1];
  }
  const zip = files.find(({ file }) => /^[\w.-]+\.zip$/.test(file));
  return version === null || zip?.sha512 === undefined ? null : { version, file: zip.file, sha512: zip.sha512 };
}

export interface MacUpdater {
  /** Whether this Mac can replace Orynx.app itself; otherwise Download opens the release page (AC-21). */
  canReplace(): Promise<boolean>;
  /** Downloads the version's zip, checks its sha512, version and signature, and unpacks it beside the app (AC-20). */
  download(version: string): Promise<void>;
  /** Moves the old app aside and the new one in, putting the old one back if that fails. */
  swap(): Promise<void>;
  /** Deletes what an earlier update left beside the app: the old one, or a download never installed. */
  cleanUp(): Promise<void>;
}

export interface MacUpdaterOptions {
  /** The running bundle, such as /Applications/Orynx.app. */
  app: string;
  /** A test's fake releases server (DEVHUB_UPDATES_URL); this repo's GitHub Releases otherwise. */
  feedUrl: string | null;
  tools?: MacTools;
}

/**
 * The Mac's own update (spec 045, Q2a): Apple's updater needs a Developer ID Orynx doesn't have, so Orynx downloads
 * the release's zip itself and checks it against `latest-mac.yml` before anything is replaced. The keychain asks
 * again after each update, as after one by hand.
 */
export function createMacUpdater({ app, feedUrl, tools = macTools }: MacUpdaterOptions): MacUpdater {
  const folder = dirname(app);
  const name = basename(app);
  const staging = join(folder, `.${name}-update`);
  const aside = join(folder, `.${name}-old`);
  const staged = join(staging, 'unpacked', name);

  async function get(url: string): Promise<Response> {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30 * 60_000) });
    if (!response.ok) throw new Error(`${url.split('/').at(-1) ?? url} answered ${String(response.status)}`);
    return response;
  }

  return {
    async canReplace() {
      try {
        await access(folder, constants.W_OK);
        await access(app, constants.W_OK);
        return true;
      } catch {
        return false;
      }
    },

    async download(version) {
      const base = feedUrl ?? `https://github.com/orynx-ai/orynx/releases/download/v${version}`;
      await rm(staging, { recursive: true, force: true });
      try {
        const zip = zipOf(await (await get(`${base}/latest-mac.yml`)).text());
        if (zip?.version !== version) throw new Error(`latest-mac.yml doesn't name the ${version} zip`);
        await mkdir(staging, { recursive: true });
        const file = join(staging, zip.file);
        const hash = createHash('sha512');
        const { body } = await get(`${base}/${zip.file}`);
        if (body === null) throw new Error(`${zip.file} came back empty`);
        await pipeline(
          Readable.fromWeb(body),
          new Transform({
            transform(chunk: Buffer, _encoding, done) {
              hash.update(chunk);
              done(null, chunk);
            },
          }),
          createWriteStream(file),
        );
        if (hash.digest('base64') !== zip.sha512) throw new Error("the zip's sha512 didn't match");
        await tools.unzip(file, join(staging, 'unpacked'));
        await rm(file);
        const unpacked = await tools.version(staged);
        if (unpacked !== version) throw new Error(`the new app says it is ${unpacked}`);
        await tools.verify(staged);
      } catch (error) {
        await rm(staging, { recursive: true, force: true });
        throw error;
      }
    },

    async swap() {
      await rm(aside, { recursive: true, force: true });
      await rename(app, aside);
      try {
        await rename(staged, app);
      } catch (error) {
        await rename(aside, app);
        throw error;
      }
      await rm(staging, { recursive: true, force: true });
    },

    async cleanUp() {
      await rm(aside, { recursive: true, force: true });
      await rm(staging, { recursive: true, force: true });
    },
  };
}
