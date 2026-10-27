import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { CleanupDays, SessionState } from '@devhub/contracts';
import type { BranchGit } from './branch-git.ts';
import type { StoredSession } from './session-store.ts';

const day = 24 * 60 * 60 * 1000;

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
    ({ session }) =>
      ended.has(session.state) && session.pinnedAt === null && Date.parse(session.updatedAt) < now - days * day,
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
