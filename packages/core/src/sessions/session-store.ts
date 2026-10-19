import { z } from 'zod';
import {
  ApprovalDecisionSchema,
  RepositoryIdSchema,
  SessionSchema,
  type Session,
  type SessionList,
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
  /**
   * The commit Orynx last pushed to the pull request's branch (spec 014): Push changes drafts its message from what
   * changed since. Null until the first push, and for a session saved before spec 014.
   */
  pushedCommit: z
    .string()
    .regex(/^[0-9a-f]{40}([0-9a-f]{24})?$/)
    .nullable()
    .default(null),
  /** Every call that asked, in order (spec 012). A session saved before spec 012 has none. */
  approvalLog: z.array(ApprovalRecordSchema).default([]),
  /**
   * What outside the worktree the brief named, as real paths, which Claude may read on every run, a follow-up's
   * too (spec 022): the files you picked and skills' folders. A session saved before spec 022 has none.
   */
  reads: z.object({ files: z.array(z.string().min(1)), folders: z.array(z.string().min(1)) }).optional(),
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
  /** What Claude was sent at the start; null when nothing was (spec 013, AC-9). */
  readBrief(id: string): Promise<string | null>;
}

export function listedSession(session: Session): ListedSession {
  const { id, title, state, source, updatedAt, discardedAt } = session;
  return { id, title, state, source, updatedAt, discardedAt };
}

/** Sessions held in memory: `sessions` are list-only summaries, as tests of Tickets and the inbox give them. */
export function createMemorySessionStore(sessions: readonly SessionSummary[] = []): SessionRecords {
  const records = new Map<string, StoredSession>();
  const briefs = new Map<string, string>();
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
    writeBrief(id, text) {
      briefs.set(id, text);
      return Promise.resolve();
    },
    readBrief: (id) => Promise.resolve(briefs.get(id) ?? null),
  };
}

const keptInSidebar = 7 * 24 * 60 * 60 * 1000;

export interface ListOptions {
  limit?: number | undefined;
  /** Leave out sessions discarded more than 7 days ago (product spec, "Cleaning up"). */
  recent?: boolean | undefined;
  /** Start after the row this names: a page's `nextCursor` (spec 020). */
  cursor?: string | undefined;
  now?: () => number;
}

/** A row's place in the list: its activity time in milliseconds, then its id. */
function cursorOf(session: SessionSummary): string {
  return `${String(Date.parse(session.updatedAt))}.${session.id}`;
}

/** Newest activity first; two sessions active in the same millisecond keep one order, by id. */
function newerFirst(a: SessionSummary, b: SessionSummary): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/**
 * Newest activity first, as summaries: after `cursor` when one is given, then at most `limit` of them,
 * with the cursor of the page after when more follow. The contract has already checked the cursor's shape.
 */
export async function listSessions(
  store: SessionStore,
  { limit, recent = false, cursor, now = Date.now }: ListOptions = {},
): Promise<SessionList> {
  const cutoff = now() - keptInSidebar;
  const sorted = [...(await store.list())]
    .filter((session) => !recent || session.discardedAt == null || Date.parse(session.discardedAt) >= cutoff)
    .map(({ id, title, state, source, updatedAt }): SessionSummary => ({ id, title, state, source, updatedAt }))
    .sort(newerFirst);
  const start = cursor === undefined ? 0 : afterCursor(sorted, cursor);
  const rest = sorted.slice(start);
  if (limit === undefined || rest.length <= limit) return { sessions: rest, nextCursor: null };
  const sessions = rest.slice(0, limit);
  const last = sessions[sessions.length - 1];
  return { sessions, nextCursor: last === undefined ? null : cursorOf(last) };
}

/** Where the rows after the cursor's row begin, wherever that row has moved to since. */
function afterCursor(sorted: readonly SessionSummary[], cursor: string): number {
  const dot = cursor.indexOf('.');
  const at = Number(cursor.slice(0, dot));
  const id = cursor.slice(dot + 1);
  const index = sorted.findIndex((session) => {
    const time = Date.parse(session.updatedAt);
    return time < at || (time === at && session.id < id);
  });
  return index === -1 ? sorted.length : index;
}
