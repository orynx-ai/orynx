/** Read review requests ahead's limits (spec 057, Q6): one at a time, a slot kept free for you, five a day. */
export const readAheadLimits = { freeAt: 2, perDay: 5 } as const;

/** The requests waiting their turn, oldest first, and the ones the last sync saw; null before the first one. */
export interface ReadAheadQueue {
  queued: readonly string[];
  known: readonly string[] | null;
}

/**
 * The queue after a sync that found `requested` (each `owner/name#number`): a request new since the last sync joins
 * its end, and one withdrawn leaves it. The first sync after turning it on only learns what was waiting (AC-37).
 */
export function afterSync({ queued, known }: ReadAheadQueue, requested: readonly string[]): ReadAheadQueue {
  const now = new Set(requested);
  const seen = new Set(known ?? requested);
  const fresh = requested.filter((id) => !seen.has(id) && !queued.includes(id));
  return { queued: [...queued.filter((id) => now.has(id)), ...fresh], known: [...requested] };
}

/** The request to start now, or null: nothing being read, fewer than 2 sessions working, under 5 today (AC-38, AC-39). */
export function nextToRead(state: {
  queued: readonly string[];
  working: number;
  reading: boolean;
  startedToday: number;
}): string | null {
  if (state.reading || state.working >= readAheadLimits.freeAt || state.startedToday >= readAheadLimits.perDay) {
    return null;
  }
  return state.queued[0] ?? null;
}
