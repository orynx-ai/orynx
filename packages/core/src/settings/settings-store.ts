import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  GitHubSavedConnectionSchema,
  JiraProjectKeySchema,
  JiraSavedConnectionSchema,
  RepositoryIdSchema,
} from '@devhub/contracts';

/** One folder in Settings › Repositories as settings.json keeps it; the name and `~` path are worked out on read. */
export const SavedRepositorySchema = z.looseObject({
  id: RepositoryIdSchema,
  path: z.string(),
  jiraProject: JiraProjectKeySchema.nullable(),
});
export type SavedRepository = z.infer<typeof SavedRepositorySchema>;

/** A JSON object as it was written, whatever keys and values it holds. */
const WrittenObjectSchema = z.record(z.string(), z.unknown());

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
   * Settings' own values (spec 005): Coding agent, Inbox rules (only the rules the person changed) and
   * Repositories, kept as written. The services take what they can read and keep the rest through every
   * save, so a value from a newer DevHub survives, and one bad value can't make DevHub forget the Jira
   * and GitHub settings next to it.
   */
  agent: WrittenObjectSchema.optional().catch(undefined),
  inbox: WrittenObjectSchema.optional().catch(undefined),
  repositories: z.array(z.unknown()).optional().catch(undefined),
  /** Which sprint Tickets shows (spec 020), kept as written; the tickets service reads what it can. */
  tickets: WrittenObjectSchema.optional().catch(undefined),
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
export function oneAtATime(): <T>(work: () => Promise<T>) => Promise<T> {
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
  /** Called with the path the next save moved an unreadable settings.json to (spec 027, AC-37). */
  onKept?: (path: string) => void;
}

/** `settings-20261019-081233.unreadable.json`, from the time of the save, in UTC. */
function keptFilePath(home: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return join(home, `settings-${stamp}.unreadable.json`);
}

/**
 * Settings in `<DEVHUB_HOME>/settings.json`: the folder is 0700 and the file 0600. Each save writes a
 * temporary file and renames it over the old one, so a crash never leaves half a file.
 */
export function createFileSettingsStore(home: string, options: FileSettingsStoreOptions = {}): SettingsStore {
  const path = settingsFilePath(home);
  const queue = oneAtATime();

  async function load(): Promise<{ settings: Settings; unreadable: boolean }> {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return { settings: {}, unreadable: false };
      throw error;
    }
    try {
      return { settings: SettingsSchema.parse(JSON.parse(text)), unreadable: false };
    } catch {
      options.onUnreadable?.();
      return { settings: {}, unreadable: true };
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
    read: async () => (await load()).settings,
    update: (change) =>
      queue(async () => {
        const { settings, unreadable } = await load();
        const next = SettingsSchema.parse(change(settings));
        // A newer or older Orynx may have written a file this one can't read: keep it rather than save over it.
        if (unreadable) {
          const kept = keptFilePath(home);
          await rename(path, kept);
          await chmod(kept, 0o600);
          options.onKept?.(kept);
        }
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
