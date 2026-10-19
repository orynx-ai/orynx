import { readFile, realpath } from 'node:fs/promises';
import { composerLimits, skillsNamedIn, type SkillList } from '@devhub/contracts';
import type { BriefSkill } from '../sessions/brief.ts';
import type { RepositoryService } from '../repositories/repository-service.ts';
import { readSkills, type FoundSkill } from './skills-reader.ts';

/** The composer's skills (spec 022, G): read from disk each time they're asked for, and kept nowhere. */
export interface SkillsService {
  /** The folder's skills, then yours; yours alone without a folder. Null for a folder Settings doesn't hold. */
  list(repositoryId: string | undefined): Promise<SkillList | null>;
  /** Every skill for a folder on disk, with its file and folder, for Send (null: yours alone). */
  found(folderPath: string | null): Promise<FoundSkill[]>;
  /**
   * The skills a message names that the folder or you have, at most 5, in the order named (AC-53), each with its
   * text and real paths. A `/name` that's no skill is just words (AC-54).
   */
  named(message: string, folderPath: string | null): Promise<BriefSkill[]>;
}

/** A skill's text goes to Claude up to this many bytes; skills are short, and the rest of the folder can be read. */
const mostSkillBytes = 256 * 1024;

/** A skill's text without the frontmatter at its top, which only names and describes it. */
function bodyOf(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim();
}

export function createSkillsService({
  repositories,
  home,
  orynx = null,
}: {
  repositories: Pick<RepositoryService, 'list'>;
  /** The person's home folder, whose `.claude` holds your skills. */
  home: string;
  /** `<DEVHUB_HOME>/plugin/skills`: the skills you write in Settings › Skills (spec 023), listed after the rest. */
  orynx?: string | null;
}): SkillsService {
  return {
    async list(repositoryId) {
      let folder: string | null = null;
      if (repositoryId !== undefined) {
        const repository = (await repositories.list()).find((held) => held.id === repositoryId);
        if (repository === undefined) return null;
        folder = repository.path;
      }
      const skills = await readSkills({ folder, home, orynx });
      return { skills: skills.map(({ name, description, source }) => ({ name, description, source })) };
    },
    found(folderPath) {
      return readSkills({ folder: folderPath, home, orynx });
    },
    async named(message, folderPath) {
      const names = skillsNamedIn(message);
      if (names.length === 0) return [];
      const skills = await readSkills({ folder: folderPath, home, orynx });
      const picked = names.flatMap((name) => skills.filter((skill) => skill.name === name));
      const read = await Promise.all(
        picked.map(async (skill): Promise<BriefSkill | null> => {
          try {
            const text = (await readFile(skill.file)).subarray(0, mostSkillBytes).toString('utf8');
            return {
              name: skill.name,
              text: bodyOf(text),
              file: await realpath(skill.file),
              folder: skill.folder === null ? null : await realpath(skill.folder),
            };
          } catch {
            // Gone since it was listed: it's just words now.
            return null;
          }
        }),
      );
      return read.filter((skill) => skill !== null).slice(0, composerLimits.skills);
    },
  };
}
