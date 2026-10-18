import type { InboxProblem, InboxToolState } from '@devhub/contracts';
import type { CachedTool } from './inbox-cache.ts';

/**
 * What a tool's line says when its sync broke in DevHub itself (a cache it can't write, say): the words
 * the /api error handler already uses, because the cause is in the terminal, not in the tool.
 */
export const brokenHere: InboxProblem = {
  kind: 'other',
  message: 'Something went wrong in the local server. See the terminal for details.',
};

/** Where a connected tool's part of the cache stands, for Home (spec 007) and Tickets (spec 008). */
export function toolState(cached: CachedTool | null, broken: boolean): InboxToolState {
  if (broken) return { state: 'failed', problem: brokenHere, lastSyncedAt: cached?.syncedAt ?? null };
  if (cached === null) return { state: 'syncing' };
  if (cached.problem !== null) return { state: 'failed', problem: cached.problem, lastSyncedAt: cached.syncedAt };
  // No time and no problem this version can read: nothing to show yet, as before a first sync.
  return cached.syncedAt === null ? { state: 'syncing' } : { state: 'synced', at: cached.syncedAt };
}
