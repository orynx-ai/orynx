import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, tryGit } from './repo.ts';

export const STAMP_PATH = '.claude/review-stamp.json';
/** Paths whose change needs a review. Docs-only branches skip the stop hook. */
export const REVIEWED_PREFIXES = ['apps/', 'packages/', 'scripts/', 'e2e/'];

export interface ReviewStamp {
  verdict: 'pass' | 'fail';
  model: string;
  effort: string;
  findings: { critical: number; important: number; suggestion: number };
  reviewId: string;
  branch: string;
  createdAt: string;
}

/** The current branch name, or null when HEAD is detached. Works on an unborn branch too. */
export function currentBranch(root: string): string | null {
  return tryGit(['symbolic-ref', '--short', '-q', 'HEAD'], root);
}

/** The commit this branch forked from: merge-base with origin/main, else main. Null when neither exists. */
export function resolveBase(root: string): string | null {
  for (const ref of ['origin/main', 'main']) {
    if (tryGit(['rev-parse', '--verify', '-q', `${ref}^{commit}`], root) === null) continue;
    const base = tryGit(['merge-base', 'HEAD', ref], root);
    if (base) return base;
  }
  return null;
}

export function commitsAhead(root: string, base: string): number {
  return Number.parseInt(git(['rev-list', '--count', `${base}..HEAD`], root).trim(), 10);
}

export function changedPaths(root: string, base: string): string[] {
  return git(['diff', '--name-only', `${base}..HEAD`], root)
    .split('\n')
    .filter((line) => line.length > 0);
}

export function fingerprintOf(diff: string): string {
  return createHash('sha256').update(diff).digest('hex').slice(0, 16);
}

/** Fingerprint of everything committed on this branch since `base`. One more commit changes it. */
export function fingerprint(root: string, base: string): string {
  return fingerprintOf(git(['diff', '--binary', `${base}..HEAD`], root));
}

export function touchesReviewedCode(paths: readonly string[]): boolean {
  return paths.some((path) => REVIEWED_PREFIXES.some((prefix) => path.startsWith(prefix)));
}

/** Reads the stamp. Returns null when there is none, "invalid" when it cannot be parsed. */
export function readStamp(root: string): ReviewStamp | 'invalid' | null {
  const path = join(root, STAMP_PATH);
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isStamp(value) ? value : 'invalid';
  } catch {
    return 'invalid';
  }
}

function isStamp(value: unknown): value is ReviewStamp {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v['verdict'] === 'pass' || v['verdict'] === 'fail') &&
    typeof v['model'] === 'string' &&
    typeof v['effort'] === 'string' &&
    typeof v['reviewId'] === 'string' &&
    typeof v['findings'] === 'object' &&
    v['findings'] !== null
  );
}

export interface StampCheck {
  ok: boolean;
  reason: string;
}

export function evaluateStamp(stamp: ReviewStamp | 'invalid' | null, current: string): StampCheck {
  if (stamp === null) return { ok: false, reason: 'this branch has no review stamp' };
  if (stamp === 'invalid') return { ok: false, reason: `${STAMP_PATH} is not a valid review stamp` };
  if (stamp.verdict !== 'pass')
    return { ok: false, reason: `the last review failed (${stamp.findings.critical} critical findings)` };
  if (stamp.reviewId !== current) {
    return { ok: false, reason: `the code changed after the review (stamp ${stamp.reviewId}, branch now ${current})` };
  }
  return { ok: true, reason: `reviewed by ${stamp.model} (${stamp.effort}) at ${stamp.createdAt}` };
}
