import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SkillFolderSchema, skillLimits, type SkillEntry, type SkillList } from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import { displayPath } from '../repositories/folder-check.ts';
import { readSkillFile } from './skill-file.ts';

/** Settings › Skills (spec 023): your skills, one `SKILL.md` each under `<DEVHUB_HOME>/plugin/skills`. */
export interface SkillStore {
  /** Every skill folder, by Name; a folder Orynx can't read is listed as such (AC-17). */
  list(): Promise<SkillList>;
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

export function createSkillStore(options: SkillStoreOptions): SkillStore {
  const plugin = join(options.devhubHome, 'plugin');
  const skills = join(plugin, 'skills');

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

  /** One folder's skill, or unreadable when its `SKILL.md` is missing, a link, too big or not a skill. */
  async function entry(folder: string): Promise<SkillEntry> {
    const unreadable: SkillEntry = { state: 'unreadable', folder };
    const file = join(skills, folder, 'SKILL.md');
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.size > skillLimits.fileBytes) return unreadable;
      const content = readSkillFile(await readFile(file, 'utf8'), folder);
      if (content === null) return unreadable;
      const { title, description, instructions } = content;
      return { state: 'ready', folder, title, description, instructions };
    } catch {
      return unreadable;
    }
  }

  return {
    async list() {
      const entries = await Promise.all((await folders()).map(entry));
      return { pluginFolder: displayPath(plugin, options.home), skills: entries.sort(byName) };
    },
  };
}
