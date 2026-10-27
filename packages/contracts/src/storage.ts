import { z } from 'zod';
import { CleanupDaysSchema } from './preferences.ts';

/** GET /api/storage (spec 047, D): what the session worktrees hold, and what each choice would delete now. */
export const StorageSchema = z.object({
  /** Every worktree under `~/.devhub/worktrees`, in bytes. */
  bytes: z.int().nonnegative(),
  /** For each of Delete old sessions' choices, the sessions a run would delete now and the space they hold. */
  choices: z.array(
    z.object({ days: CleanupDaysSchema, sessions: z.int().nonnegative(), bytes: z.int().nonnegative() }),
  ),
});
export type Storage = z.infer<typeof StorageSchema>;
