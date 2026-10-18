import { z } from 'zod';
import {
  ApprovalDecisionSchema,
  RepositoryIdSchema,
  SessionSchema,
  type Session,
  type SessionSummary,
} from '@devhub/contracts';

/**
 * Where sessions are kept. `openFileSessionStore` keeps them under `<DEVHUB_HOME>/sessions/` (spec 011);
 * the memory store serves tests and a server built without a home.
 */

/**
 * A call that asked, as the session keeps it for your own review (spec 012; product spec, "Security,
 * privacy and data"): what it was, and how it ended. Never sent to the page or the log.
 */
export const ApprovalRecordSchema = z.object({
  id: z.string().min(1),
  about: z.enum(['command', 'edit']),
  /** The command, or the edit's path. */
  text: z.string().min(1),
  askedAt: z.iso.datetime(),
  /** Your answer; null when the call ended without one. */
  answer: ApprovalDecisionSchema.nullable(),
  /** Who ended it: you, Stop, Discard, Orynx closing, or Claude Code dropping it. Null while it waits. */
  by: z.enum(['you', 'stopped', 'discarded', 'closed', 'dropped']).nullable(),
  answeredAt: z.iso.datetime().nullable(),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

/** A session as the server keeps it: what the Session screen shows, plus what only the server needs. */
export const StoredSessionSchema = z.object({
  session: SessionSchema,
  /** The folder Claude works on, by its id in Settings › Repositories and its real path. */
  repository: z.object({ id: RepositoryIdSchema, path: z.string().min(1) }),
  /** `<DEVHUB_HOME>/worktrees/<id>`; null before Orynx gets as far as making it. */
  worktree: z.string().min(1).nullable(),
  /**
   * The commit the branch started from, which the Changes tab compares the worktree with (spec 013, AC-4).
   * Null before the worktree is made, and for a session made before spec 013.
   */
  startCommit: z
    .string()
    .regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/)
    .nullable()
    .default(null),
  /** Claude Code's own session id, which a follow-up resumes (spec 013). */
  claudeSessionId: z.string().min(1).nullable(),
  /** Every call that asked, in order (spec 012). A session saved before spec 012 has none. */
  approvalLog: z.array(ApprovalRecordSchema).default([]),
});
export type StoredSession = z.infer<typeof StoredSessionSchema>;

/** A session as lists see it: its summary, and when it was discarded. */
export type ListedSession = SessionSummary & { discardedAt?: string | null };

/** What Tickets, the inbox and search read: every session, in any order. */
export interface SessionStore {
  list(): Promise<readonly ListedSession[]>;
}

/** What the session service reads and changes. One session's changes are applied in the order they come. */
export interface SessionRecords extends SessionStore {
  get(id: string): Promise<StoredSession | null>;
  create(record: StoredSession): Promise<void>;
  /** Applies `change` to the session as it is now; null when there's no such session. */
  update(id: string, change: (current: StoredSession) => StoredSession): Promise<StoredSession | null>;
  /** Saves exactly what Claude was sent (Q5). */
  writeBrief(id: string, text: string): Promise<void>;
}

export function listedSession(session: Session): ListedSession {
  const { id, title, state, source, updatedAt, discardedAt } = session;
  return { id, title, state, source, updatedAt, discardedAt };
}

/** Sessions held in memory: `sessions` are list-only summaries, as tests of Tickets and the inbox give them. */
export function createMemorySessionStore(sessions: readonly SessionSummary[] = []): SessionRecords {
  const records = new Map<string, StoredSession>();
  return {
    list: () => Promise.resolve([...sessions, ...[...records.values()].map((record) => listedSession(record.session))]),
    get: (id) => Promise.resolve(records.get(id) ?? null),
    create(record) {
      records.set(record.session.id, record);
      return Promise.resolve();
    },
    update(id, change) {
      const current = records.get(id);
      if (current === undefined) return Promise.resolve(null);
      const next = change(current);
      records.set(id, next);
      return Promise.resolve(next);
    },
    writeBrief: () => Promise.resolve(),
  };
}

const keptInSidebar = 7 * 24 * 60 * 60 * 1000;

export interface ListOptions {
  limit?: number | undefined;
  /** Leave out sessions discarded more than 7 days ago (product spec, "Cleaning up"). */
  recent?: boolean | undefined;
  now?: () => number;
}

/** Newest activity first, then at most `limit` of them, as summaries. */
export async function listSessions(
  store: SessionStore,
  { limit, recent = false, now = Date.now }: ListOptions = {},
): Promise<SessionSummary[]> {
  const cutoff = now() - keptInSidebar;
  const sorted = [...(await store.list())]
    .filter((session) => !recent || session.discardedAt == null || Date.parse(session.discardedAt) >= cutoff)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map(({ id, title, state, source, updatedAt }) => ({ id, title, state, source, updatedAt }));
  return limit === undefined ? sorted : sorted.slice(0, limit);
}
