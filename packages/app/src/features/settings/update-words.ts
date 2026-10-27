import type { RunningVersion } from '@devhub/contracts';

/**
 * The version you run (spec 045, AC-1, AC-2): `0.1.37`, `0.1.37 + 4 commits (abc1234)` past it, or a clone's commit
 * alone when no release is in its history. Empty when not even that is known.
 */
export function versionText({ release, commits, commit }: RunningVersion): string {
  if (release === null) return commit ?? '';
  if (commits === 0 || commit === null) return release;
  return `${release} + ${String(commits)} ${commits === 1 ? 'commit' : 'commits'} (${commit})`;
}
