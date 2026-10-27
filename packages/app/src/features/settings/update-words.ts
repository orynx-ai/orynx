import type { RunningVersion, UpdateRefusal } from '@devhub/contracts';
import { minute } from '../../words/calendar.ts';
import { waitText } from '../../words/tool-line.ts';

/**
 * The version you run (spec 045, AC-1, AC-2): `0.1.37`, `0.1.37 + 4 commits (abc1234)` past it, or a clone's commit
 * alone when no release is in its history. Empty when not even that is known.
 */
export function versionText({ release, commits, commit }: RunningVersion): string {
  if (release === null) return commit ?? '';
  if (commits === 0 || commit === null) return release;
  return `${release} + ${String(commits)} ${commits === 1 ? 'commit' : 'commits'} (${commit})`;
}

/** Why Update changed nothing in a clone (AC-27, Q7). */
export const refusalLines: Record<UpdateRefusal, string> = {
  changes: 'This clone has changes of its own. Commit or stash them, then update.',
  diverged: 'This clone’s branch has moved apart from GitHub’s. Update it by hand.',
};

/** What a clone started by hand runs to update (AC-30); `pnpm start` builds it again. */
export const updateCommands = 'git pull --ff-only && pnpm install';

/** "Checked just now", then "Checked 5 minutes ago" (AC-6). */
export function checkedText(checkedAt: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - Date.parse(checkedAt));
  return ms < minute ? 'Checked just now' : `Checked ${waitText(ms).spoken} ago`;
}
