import type { SessionSummary } from '@devhub/contracts';

/**
 * Where sessions are kept. Spec 011 adds the real store under `<DEVHUB_HOME>/sessions/`;
 * until then nothing creates a session, so the server starts with an empty memory store.
 */
export interface SessionStore {
  /** Every session, in any order. */
  list(): Promise<readonly SessionSummary[]>;
}

export function createMemorySessionStore(sessions: readonly SessionSummary[] = []): SessionStore {
  return { list: () => Promise.resolve(sessions) };
}

/** Newest activity first, then at most `limit` of them. */
export async function listSessions(store: SessionStore, limit?: number): Promise<SessionSummary[]> {
  const sorted = [...(await store.list())].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return limit === undefined ? sorted : sorted.slice(0, limit);
}
