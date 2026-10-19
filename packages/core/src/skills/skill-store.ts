import { randomBytes } from 'node:crypto';
import { chmod, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  folderFromName,
  SkillFolderSchema,
  skillLimits,
  type ApiErrorCode,
  type ReadySkill,
  type SaveSkillRequestSchema,
  type SkillEntry,
  type SkillFolder,
  type OrynxSkillList,
} from '@devhub/contracts';
import type { z } from 'zod';
import type { EventBus } from '../events/event-bus.ts';
import { displayPath } from '../repositories/folder-check.ts';
import { oneAtATime } from '../settings/settings-store.ts';
import { readSkillFile, writeSkillFile, type SkillFileContent } from './skill-file.ts';
import { starterSkills } from './starters.ts';

/** Why a skill wasn't saved. The message goes under the Name field as it is (spec 023, AC-7). */
export class SkillRejectedError extends Error {
  readonly code = 'skill_rejected' satisfies ApiErrorCode;

  constructor(message: string) {
    super(message);
    this.name = 'SkillRejectedError';
  }
}

/** The editor's fields once they passed the contract: trimmed, within the limits. */
export type SkillFields = z.output<typeof SaveSkillRequestSchema>;

/** Settings › Skills (spec 023): your skills, one `SKILL.md` each under `<DEVHUB_HOME>/plugin/skills`. */
export interface SkillStore {
  /** Every skill folder, by Name; a folder Orynx can't read is listed as such (AC-17). */
  list(): Promise<OrynxSkillList>;
  /** Writes a new skill in the folder its Name makes. A folder already there is a {@link SkillRejectedError}. */
  add(fields: SkillFields): Promise<ReadySkill>;
  /**
   * Saves a skill, moving its folder when the Name makes another one (AC-6). Null when the folder went, or is a
   * link. A folder another skill has is a {@link SkillRejectedError}.
   */
  save(folder: SkillFolder, fields: SkillFields): Promise<ReadySkill | null>;
  /** Deletes a skill's folder. A folder already gone, or a link, is left alone. */
  remove(folder: SkillFolder): Promise<void>;
  /** Adds the starter skills whose folders are free (AC-13). */
  addStarters(): Promise<void>;
}

export interface SkillStoreOptions {
  /** DEVHUB_HOME, which holds `plugin/skills`. */
  devhubHome: string;
  /** The person's home folder, for `~`. */
  home: string;
  events: EventBus;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** By Name, in any case; a skill Orynx can't read goes by its folder. */
function byName(a: SkillEntry, b: SkillEntry): number {
  const name = (entry: SkillEntry) => (entry.state === 'ready' ? entry.title : entry.folder);
  return name(a).localeCompare(name(b), undefined, { sensitivity: 'base' });
}

function taken(folder: string): SkillRejectedError {
  return new SkillRejectedError(`You already have a skill in ${folder}.`);
}

export function createSkillStore(options: SkillStoreOptions): SkillStore {
  const { events } = options;
  const plugin = join(options.devhubHome, 'plugin');
  const skills = join(plugin, 'skills');
  // Changes run one at a time, so two saves can't both take a free folder.
  const queue = oneAtATime();
  const folderPath = (folder: string) => join(skills, folder);

  /** What is at a skill folder's path: lstat, so a link is never taken for a folder (AC-20). */
  async function kind(folder: string): Promise<'folder' | 'missing' | 'other'> {
    try {
      return (await lstat(folderPath(folder))).isDirectory() ? 'folder' : 'other';
    } catch (error) {
      if (isMissing(error)) return 'missing';
      throw error;
    }
  }

  /** The folders a Name could have made. Links and files are skipped, so nothing outside is read (AC-20). */
  async function folders(): Promise<string[]> {
    try {
      const entries = await readdir(skills, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && SkillFolderSchema.safeParse(entry.name).success)
        .map((entry) => entry.name);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }

  /** A folder's `SKILL.md`, or null when it's missing, a link, too big or not a skill. */
  async function content(folder: string): Promise<SkillFileContent | null> {
    const file = join(folderPath(folder), 'SKILL.md');
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.size > skillLimits.fileBytes) return null;
      return readSkillFile(await readFile(file, 'utf8'), folder);
    } catch {
      return null;
    }
  }

  async function entry(folder: string): Promise<SkillEntry> {
    const read = await content(folder);
    if (read === null) return { state: 'unreadable', folder };
    return {
      state: 'ready',
      folder,
      title: read.title,
      description: read.description,
      instructions: read.instructions,
    };
  }

  /** A folder that only this user can open: the skills folder, its parent, or one skill's. */
  async function makeFolder(path: string): Promise<void> {
    await mkdir(path, { recursive: true, mode: 0o700 });
    await chmod(path, 0o700);
  }

  /** Writes a temporary file and renames it over `SKILL.md`, so a crash never leaves half a skill. */
  async function writeSkill(folder: string, file: string): Promise<void> {
    const path = join(folderPath(folder), 'SKILL.md');
    const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      await writeFile(temporary, file, { mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async function create(folder: string, fields: SkillFields): Promise<void> {
    await makeFolder(plugin);
    await makeFolder(skills);
    await makeFolder(folderPath(folder));
    await writeSkill(folder, writeSkillFile({ folder, ...fields }, {}));
  }

  return {
    async list() {
      const entries = await Promise.all((await folders()).map(entry));
      return { pluginFolder: displayPath(plugin, options.home), skills: entries.sort(byName) };
    },

    add: (fields) =>
      queue(async () => {
        const folder = folderFromName(fields.title);
        if ((await kind(folder)) !== 'missing') throw taken(folder);
        await create(folder, fields);
        events.publish({ type: 'skills.changed' });
        return { state: 'ready', folder, ...fields };
      }),

    save: (current, fields) =>
      queue(async () => {
        if ((await kind(current)) !== 'folder') return null;
        const folder = folderFromName(fields.title);
        const moving = folder !== current;
        if (moving && (await kind(folder)) !== 'missing') throw taken(folder);
        const before = (await content(current))?.frontmatter ?? {};
        if (moving) await rename(folderPath(current), folderPath(folder));
        try {
          await writeSkill(folder, writeSkillFile({ folder, ...fields }, before));
        } catch (error) {
          // The folder goes back to its old name, so the skill isn't left half renamed.
          if (moving) await rename(folderPath(folder), folderPath(current)).catch(() => undefined);
          throw error;
        }
        events.publish({ type: 'skills.changed' });
        return { state: 'ready', folder, ...fields };
      }),

    remove: (folder) =>
      queue(async () => {
        if ((await kind(folder)) !== 'folder') return;
        await rm(folderPath(folder), { recursive: true, force: true });
        events.publish({ type: 'skills.changed' });
      }),

    addStarters: () =>
      queue(async () => {
        let added = 0;
        for (const { folder, ...fields } of starterSkills) {
          if ((await kind(folder)) !== 'missing') continue;
          await create(folder, fields);
          added += 1;
        }
        if (added > 0) events.publish({ type: 'skills.changed' });
      }),
  };
}
