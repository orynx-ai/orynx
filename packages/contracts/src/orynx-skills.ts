import { z } from 'zod';

// Your own skills, the ones Settings › Skills writes into Orynx's plugin folder (spec 023). The composer's `/` list,
// which reads a folder's and ~/.claude's skills, is skills.ts (spec 022).

/**
 * Your skills' limits (spec 023): the Name, "When to use it" (Claude Code's limit for a description), the
 * instructions, and the largest `SKILL.md` Orynx reads.
 */
export const skillLimits = { title: 64, description: 1024, instructions: 20_000, fileBytes: 65_536 } as const;

/**
 * A skill's folder under `<DEVHUB_HOME>/plugin/skills`, which is also its `name` in `SKILL.md`: Claude Code's rule,
 * lowercase letters and digits in runs joined by single hyphens. It can't hold `/` or `..`, so it never leaves the
 * skills folder.
 */
export const SkillFolderSchema = z
  .string()
  .max(skillLimits.title)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type SkillFolder = z.infer<typeof SkillFolderSchema>;

/**
 * The folder a Name makes (spec 023): lowercase, accents dropped, every run of other characters one `-`, no `-` at
 * either end, at most 64 characters. Empty when the Name has no letter or digit. The form shows it as you type, and
 * the server saves to it.
 */
export function folderFromName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, skillLimits.title)
    .replace(/-+$/, '');
}

/** A skill Orynx read: its folder, and the Name, "When to use it" and instructions from its `SKILL.md`. */
export const ReadySkillSchema = z.object({
  state: z.literal('ready'),
  folder: SkillFolderSchema,
  /** The Name: `metadata.title`, or the folder when the file has none. */
  title: z.string().min(1),
  /** "When to use it": the file's `description`, empty when a hand-written file has none. */
  description: z.string(),
  /** Everything after the frontmatter. */
  instructions: z.string(),
});
export type ReadySkill = z.infer<typeof ReadySkillSchema>;

/** A folder whose `SKILL.md` is missing, unreadable, too big or has no frontmatter (AC-17): you can only delete it. */
export const UnreadableSkillSchema = z.object({ state: z.literal('unreadable'), folder: SkillFolderSchema });
export type UnreadableSkill = z.infer<typeof UnreadableSkillSchema>;

export const SkillEntrySchema = z.discriminatedUnion('state', [ReadySkillSchema, UnreadableSkillSchema]);
export type SkillEntry = z.infer<typeof SkillEntrySchema>;

/** GET /api/skills/orynx: your skills by Name, and the plugin folder as the page bar shows it ("~/.devhub/plugin"). */
export const OrynxSkillListSchema = z.object({
  pluginFolder: z.string(),
  skills: z.array(SkillEntrySchema),
});
export type OrynxSkillList = z.infer<typeof OrynxSkillListSchema>;

/**
 * POST /api/skills/orynx and PUT /api/skills/orynx/:folder: the editor's fields. The folder comes from the Name, so a rename
 * moves it. The form and the server refuse the same values, with the same words.
 */
export const SaveSkillRequestSchema = z.object({
  title: z
    .string()
    .trim()
    // `abort` keeps one message per field: an empty Name says only that it's empty.
    .min(1, { message: 'Give the skill a name.', abort: true })
    .max(skillLimits.title, { message: 'At most 64 characters.', abort: true })
    .refine((title) => folderFromName(title) !== '', 'Use at least one letter or digit.'),
  description: z
    .string()
    .trim()
    .min(1, 'Say when to use it.')
    .max(skillLimits.description, 'At most 1,024 characters.'),
  instructions: z
    .string()
    .max(skillLimits.instructions, 'At most 20,000 characters.')
    .refine((instructions) => instructions.trim() !== '', 'Write the instructions.'),
});
export type SaveSkillRequest = z.input<typeof SaveSkillRequestSchema>;
