import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cleanupDays, type CleanupDays, type SessionState, type Storage } from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import type { BranchGit } from './branch-git.ts';
import type { StoredSession } from './session-store.ts';

const day = 24 * 60 * 60 * 1000;
const hour = 60 * 60 * 1000;

/** The states a cleanup run may delete (spec 047, D): finished, stopped, or its pull request merged or closed. */
const ended: ReadonlySet<SessionState> = new Set(['done', 'stopped', 'pr_merged', 'pr_closed']);

/**
 * What must already hold the worktree's HEAD for nothing to be lost, or null when nothing can say. A branch of the
 * session's own keeps its commits, so only the files count (Q4); a detached worktree on your pull request needs origin
 * to have its HEAD; one with no branch yet must still be at its start commit.
 */
function keptBy(record: StoredSession): string[] | null {
  const { session } = record;
  if (session.workOn === 'pull_request')
    return session.branch === null ? null : [`refs/remotes/origin/${session.branch}`];
  if (session.branch !== null) return [];
  return record.startCommit === null ? null : [record.startCommit];
}

async function nothingToLose(record: StoredSession, git: Pick<BranchGit, 'nothingToLose'>): Promise<boolean> {
  if (record.worktree === null) return true;
  const against = keptBy(record);
  return against !== null && git.nothingToLose(record.worktree, against);
}

function changedBefore(session: { updatedAt: string }, days: CleanupDays, now: number): boolean {
  return Date.parse(session.updatedAt) < now - days * day;
}

/**
 * The sessions a run with `days` deletes now (spec 047, D): ended, not pinned, last changed more than `days` ago, and
 * nothing would be lost (spec 047, C's check). Working, waiting and PR open sessions never go.
 */
export async function sessionsToClean(
  records: readonly StoredSession[],
  days: CleanupDays,
  now: number,
  git: Pick<BranchGit, 'nothingToLose'>,
): Promise<StoredSession[]> {
  const old = records.filter(
    ({ session }) => ended.has(session.state) && session.pinnedAt === null && changedBefore(session, days, now),
  );
  const safe = await Promise.all(old.map((record) => nothingToLose(record, git)));
  return old.filter((_, index) => safe[index] === true);
}

/** The bytes of every file under `folder`, never following a link; 0 when it's gone. */
export async function folderBytes(folder: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true, recursive: true });
  } catch {
    return 0;
  }
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      bytes += (await lstat(join(entry.parentPath, entry.name))).size;
    } catch {
      // Gone since it was listed: it holds nothing now.
    }
  }
  return bytes;
}

/**
 * GET /api/storage (spec 047, D): the size of every worktree under `root`, and for each choice the sessions a run would
 * delete now and the size of their worktrees. Each folder is walked once.
 */
export async function measureStorage(
  records: readonly StoredSession[],
  root: string,
  now: number,
  git: Pick<BranchGit, 'nothingToLose'>,
): Promise<Storage> {
  let folders: string[] = [];
  try {
    folders = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name));
  } catch {
    // No session has made a worktree yet.
  }
  const sizes = new Map(await Promise.all(folders.map(async (folder) => [folder, await folderBytes(folder)] as const)));
  const sizeOf = (record: StoredSession) => (record.worktree === null ? 0 : (sizes.get(record.worktree) ?? 0));
  // The shortest choice's sessions hold every longer one's.
  const going = await sessionsToClean(records, cleanupDays[0], now, git);
  return {
    bytes: [...sizes.values()].reduce((sum, bytes) => sum + bytes, 0),
    choices: cleanupDays.map((days) => {
      const chosen = going.filter(({ session }) => changedBefore(session, days, now));
      return { days, sessions: chosen.length, bytes: chosen.reduce((sum, record) => sum + sizeOf(record), 0) };
    }),
  };
}

export interface SessionCleanupSchedule {
  stop(): void;
}

export interface SessionCleanupScheduleOptions {
  sessions: { cleanUp(): Promise<void> };
  events: EventBus;
  /** How often a run comes on its own; every hour. */
  everyMs?: number;
  /** Told about a run that failed behind the scenes. */
  onError?: (error: unknown) => void;
}

/**
 * When old sessions are deleted (spec 047, D): once when Orynx starts, every hour, and as soon as a setting is saved, so
 * a new choice acts at once. Each run reads Delete old sessions itself, so Never deletes nothing. Hosts turn this on
 * with `autoSync`; tests leave it off, so nothing is deleted by surprise.
 */
export function startSessionCleanup({
  sessions,
  events,
  everyMs = hour,
  onError,
}: SessionCleanupScheduleOptions): SessionCleanupSchedule {
  const run = () => {
    sessions.cleanUp().catch((error: unknown) => onError?.(error));
  };
  run();
  const timer = setInterval(run, everyMs);
  timer.unref();
  const unsubscribe = events.subscribe((event) => {
    if (event.type === 'settings.changed') run();
  });
  return {
    stop() {
      clearInterval(timer);
      unsubscribe();
    },
  };
}
