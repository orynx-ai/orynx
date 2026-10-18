import { z } from 'zod';
import { ChangeLineSchema } from './session.ts';

/**
 * The Changes tab (spec 013): what differs in a session's worktree from the commit its branch started from,
 * read with git and never written (Q4). The server sends paths, counts and lines; the app words them.
 */

/** One changed file, as the list shows it. */
export const ChangedFileSchema = z.object({
  /** Relative to the worktree, with "/" between folders. */
  path: z.string().min(1),
  /** Lines added and removed; both zero for a binary file. */
  added: z.int().nonnegative(),
  removed: z.int().nonnegative(),
  /** git can't count lines in it, so it has no diff to show (Q5). */
  binary: z.boolean(),
  /** Where git says the file was before it was renamed; null when it wasn't. */
  renamedFrom: z.string().min(1).nullable(),
});
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

/**
 * GET /api/sessions/:id/changes. `ready` lists the files, empty when nothing has changed yet. The others say
 * why there's nothing to list (AC-6): the session stopped before a worktree was made, the changes were
 * discarded, or the worktree was moved or deleted outside Orynx.
 */
export const SessionChangesSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ready'),
    /** In the order Claude first changed them, then by path, at most 300 (Q5). */
    files: z.array(ChangedFileSchema),
    /** How many more files changed past the list. */
    moreFiles: z.int().nonnegative(),
    /** Lines added and removed in the files listed. */
    added: z.int().nonnegative(),
    removed: z.int().nonnegative(),
  }),
  z.object({ state: z.literal('no_worktree') }),
  z.object({ state: z.literal('discarded') }),
  z.object({ state: z.literal('missing') }),
]);
export type SessionChanges = z.infer<typeof SessionChangesSchema>;

/** One line of a diff: a line of code with its number (as 012's edit preview has them), or a hunk's header. */
export const DiffLineSchema = z.union([ChangeLineSchema, z.object({ kind: z.literal('hunk'), text: z.string() })]);
export type DiffLine = z.infer<typeof DiffLineSchema>;

/** Query string of GET /api/sessions/:id/changes/diff: one path from the list, and only that (AC-24). */
export const FileDiffQuerySchema = z.object({ path: z.string().min(1).max(4096) });
export type FileDiffQuery = z.infer<typeof FileDiffQuerySchema>;

/** GET /api/sessions/:id/changes/diff: one file's diff, with git's 3 lines around each change (Q5). */
export const FileDiffSchema = z.object({
  path: z.string().min(1),
  /** Empty for a binary file. */
  lines: z.array(DiffLineSchema),
  binary: z.boolean(),
  renamedFrom: z.string().min(1).nullable(),
  /** The diff went past 2,000 lines, and only those are here. */
  cut: z.boolean(),
});
export type FileDiff = z.infer<typeof FileDiffSchema>;
