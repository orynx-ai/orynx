import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { GitHubSavedConnectionSchema, JiraSavedConnectionSchema, PermissionModeSchema } from '@devhub/contracts';

/**
 * Everything in `<DEVHUB_HOME>/settings.json`. Never a token: tokens live in the keychain (spec 002).
 * Settings this version doesn't know are kept as they are, so a newer DevHub's settings survive.
 */
const SettingsSchema = z.looseObject({
  /** The Jira site and email that Jira accepted (spec 003). */
  jira: JiraSavedConnectionSchema.optional(),
  /** The way GitHub accepted: the gh login or a token in the keychain (spec 004). */
  github: GitHubSavedConnectionSchema.optional(),
  /**
   * Settings › Coding agent (spec 005). A value this version can't read counts as never chosen, so one
   * bad key can't make DevHub forget the Jira and GitHub settings next to it.
   */
  agent: z
    .looseObject({ permissionMode: PermissionModeSchema.optional().catch(undefined) })
    .optional()
    .catch(undefined),
  /**
   * Settings › Inbox rules (spec 005): only the rules the person changed. Rule names this version doesn't
   * know are kept, so a newer DevHub's rules survive.
   */
  inbox: z
    .looseObject({ rules: z.record(z.string(), z.boolean()).optional().catch(undefined) })
    .optional()
    .catch(undefined),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** The settings DevHub keeps between runs: the connections (specs 003, 004) and Settings' own values (spec 005). */
export interface SettingsStore {
  read(): Promise<Settings>;
  /** Applies `change` to the latest settings and saves the result. Changes run one at a time. */
  update(change: (current: Settings) => Settings): Promise<Settings>;
}

export function settingsFilePath(home: string): string {
  return join(home, 'settings.json');
}

/** Runs each change after the one before has finished, whether or not that one failed. */
function oneAtATime(): <T>(work: () => Promise<T>) => Promise<T> {
  let last: Promise<unknown> = Promise.resolve();
  return (work) => {
    const next = last.then(work, work);
    last = next.catch(() => undefined);
    return next;
  };
}

export interface FileSettingsStoreOptions {
  /** Called when settings.json is not valid; DevHub then treats it as empty until the next save. */
  onUnreadable?: () => void;
}

/**
 * Settings in `<DEVHUB_HOME>/settings.json`: the folder is 0700 and the file 0600. Each save writes a
 * temporary file and renames it over the old one, so a crash never leaves half a file.
 */
export function createFileSettingsStore(home: string, options: FileSettingsStoreOptions = {}): SettingsStore {
  const path = settingsFilePath(home);
  const queue = oneAtATime();

  async function read(): Promise<Settings> {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
      throw error;
    }
    try {
      return SettingsSchema.parse(JSON.parse(text));
    } catch {
      options.onUnreadable?.();
      return {};
    }
  }

  async function write(settings: Settings): Promise<void> {
    await mkdir(home, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  return {
    read,
    update: (change) =>
      queue(async () => {
        const next = SettingsSchema.parse(change(await read()));
        await write(next);
        return next;
      }),
  };
}

/** Settings for this run only: tests, and a host with no folder. */
export function createMemorySettingsStore(initial: Settings = {}): SettingsStore {
  let settings = initial;
  const queue = oneAtATime();
  return {
    read: () => Promise.resolve(settings),
    update: (change) =>
      queue(() => {
        settings = SettingsSchema.parse(change(settings));
        return Promise.resolve(settings);
      }),
  };
}
