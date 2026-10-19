import type { SkillList } from '@devhub/contracts';
import type { RepositoryService } from '../repositories/repository-service.ts';
import { readSkills, type FoundSkill } from './skills-reader.ts';

/** The composer's skills (spec 022, G): read from disk each time they're asked for, and kept nowhere. */
export interface SkillsService {
  /** The folder's skills, then yours; yours alone without a folder. Null for a folder Settings doesn't hold. */
  list(repositoryId: string | undefined): Promise<SkillList | null>;
  /** Every skill for a folder on disk, with its file and folder, for Send (null: yours alone). */
  found(folderPath: string | null): Promise<FoundSkill[]>;
}

export function createSkillsService({
  repositories,
  home,
}: {
  repositories: Pick<RepositoryService, 'list'>;
  /** The person's home folder, whose `.claude` holds your skills. */
  home: string;
}): SkillsService {
  return {
    async list(repositoryId) {
      let folder: string | null = null;
      if (repositoryId !== undefined) {
        const repository = (await repositories.list()).find((held) => held.id === repositoryId);
        if (repository === undefined) return null;
        folder = repository.path;
      }
      const skills = await readSkills({ folder, home });
      return { skills: skills.map(({ name, description, source }) => ({ name, description, source })) };
    },
    found(folderPath) {
      return readSkills({ folder: folderPath, home });
    },
  };
}
