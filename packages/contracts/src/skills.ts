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
  /** The folder the composer shows, yours under `~/.claude`, or yours in Orynx (Settings › Skills, spec 023). */
  source: z.enum(['folder', 'yours', 'orynx']),
});
export type Skill = z.infer<typeof SkillSchema>;

/** GET /api/skills?repositoryId=: the shown folder's skills, then yours; yours alone without a folder (AC-59). */
export const SkillListSchema = z.object({ skills: z.array(SkillSchema) });
export type SkillList = z.infer<typeof SkillListSchema>;

export const SkillListQuerySchema = z.object({ repositoryId: RepositoryIdSchema.optional() });
export type SkillListQuery = z.infer<typeof SkillListQuerySchema>;

/**
 * The skill names a message asks for, each once, in the order it names them (spec 022, AC-53): `/name` at the start
 * or after a space or a new line. A full stop or colon after one ends a sentence, not the name. Whether a name is a
 * skill is the server's to say at Send.
 */
export function skillsNamedIn(message: string): string[] {
  const named: string[] = [];
  for (const match of message.matchAll(/(?:^|\s)\/([A-Za-z0-9][A-Za-z0-9._:-]*)/g)) {
    const name = (match[1] ?? '').replace(/[.:]+$/, '');
    if (SkillNameSchema.safeParse(name).success && !named.includes(name)) named.push(name);
  }
  return named;
}
