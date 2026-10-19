import { z } from 'zod';
import { RepositoryIdSchema } from './repositories.ts';

/**
 * Skills, for the composer's `/` list (spec 022, G): a folder's `.claude/skills` and `.claude/commands`, then
 * yours under `~/.claude`, as Claude Code's terminal lists them.
 */

/** What follows `/`: letters, digits, `-`, `_`, `.`, and `:` between a command's folders. */
export const SkillNameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);

export const SkillSchema = z.object({
  name: SkillNameSchema,
  description: z.string().min(1).nullable(),
  /** The folder the composer shows, or yours. */
  source: z.enum(['folder', 'yours']),
});
export type Skill = z.infer<typeof SkillSchema>;

/** GET /api/skills?repositoryId=: the shown folder's skills, then yours; yours alone without a folder (AC-59). */
export const SkillListSchema = z.object({ skills: z.array(SkillSchema) });
export type SkillList = z.infer<typeof SkillListSchema>;

export const SkillListQuerySchema = z.object({ repositoryId: RepositoryIdSchema.optional() });
export type SkillListQuery = z.infer<typeof SkillListQuerySchema>;
