import { repoRoot } from '../lib/repo.ts';
import {
  changedPaths,
  commitsAhead,
  currentBranch,
  evaluateStamp,
  fingerprint,
  readStamp,
  resolveBase,
  touchesReviewedCode,
  type ReviewStamp,
} from '../lib/review.ts';
import { ALLOW, block, isMain, runHook, type Decision, type HookInput } from './hook-io.ts';

export const REVIEW_MESSAGE =
  'This branch has not been reviewed. Run /review now (Opus 5.5, xhigh effort); it writes the stamp that the pre-push gate checks.';

export interface BranchState {
  branch: string | null;
  base: string | null;
  ahead: number;
  changed: readonly string[];
  fingerprint: string | null;
  stamp: ReviewStamp | 'invalid' | null;
}

/** Lets the agent stop unless this branch has unreviewed code changes. */
export function decideStop(
  input: HookInput,
  env: Readonly<Record<string, string | undefined>>,
  state: () => BranchState,
): Decision {
  if (input.stop_hook_active === true) return ALLOW;
  if (env['DEVHUB_SKIP_REVIEW_HOOK'] === '1') return ALLOW;
  const s = state();
  if (s.branch === null || s.branch === 'main') return ALLOW;
  // No base means the gate will fail at push with a clear message; the hook stays out of the way.
  if (s.base === null || s.ahead === 0 || s.fingerprint === null) return ALLOW;
  if (!touchesReviewedCode(s.changed)) return ALLOW;
  if (evaluateStamp(s.stamp, s.fingerprint).ok) return ALLOW;
  return block(REVIEW_MESSAGE);
}

function readState(root: string): BranchState {
  const branch = currentBranch(root);
  const base = branch === null || branch === 'main' ? null : resolveBase(root);
  if (base === null) return { branch, base, ahead: 0, changed: [], fingerprint: null, stamp: null };
  return {
    branch,
    base,
    ahead: commitsAhead(root, base),
    changed: changedPaths(root, base),
    fingerprint: fingerprint(root, base),
    stamp: readStamp(root),
  };
}

if (isMain(import.meta.url)) await runHook((input) => decideStop(input, process.env, () => readState(repoRoot)));
