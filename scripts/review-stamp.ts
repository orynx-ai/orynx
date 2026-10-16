import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { git, repoRoot } from './lib/repo.ts';
import {
  currentBranch,
  evaluateStamp,
  fingerprint,
  readStamp,
  resolveBase,
  STAMP_PATH,
  type ReviewStamp,
} from './lib/review.ts';

// Usage:
//   pnpm review:stamp write --verdict pass|fail --model <id> --effort <level> --critical N --important N --suggestion N
//   pnpm review:stamp verify        does the stamp match this exact change?
//   pnpm review:stamp fingerprint   print this branch's fingerprint

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

function count(argv: readonly string[], name: string): number {
  const raw = flag(argv, name) ?? '0';
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0 || String(value) !== raw)
    throw new Error(`--${name} must be a whole number, got "${raw}"`);
  return value;
}

function baseOrThrow(): string {
  const base = resolveBase(repoRoot);
  if (base === null)
    throw new Error('cannot find origin/main or main to compare this branch with (git fetch origin main)');
  return base;
}

function main(argv: readonly string[]): number {
  const command = argv[0];
  if (command === 'fingerprint') {
    console.log(fingerprint(repoRoot, baseOrThrow()));
    return 0;
  }
  if (command === 'verify') {
    const check = evaluateStamp(readStamp(repoRoot), fingerprint(repoRoot, baseOrThrow()));
    console.log(`${check.ok ? '✔' : '✖'} ${check.reason}`);
    return check.ok ? 0 : 1;
  }
  if (command === 'write') {
    const verdict = flag(argv, 'verdict');
    const model = flag(argv, 'model');
    const effort = flag(argv, 'effort');
    if (verdict !== 'pass' && verdict !== 'fail') throw new Error('--verdict must be pass or fail');
    if (!model) throw new Error('--model is required, e.g. claude-opus-5-5');
    if (!effort) throw new Error('--effort is required, e.g. xhigh');
    const dirty = git(['status', '--porcelain', '--untracked-files=no'], repoRoot).trim();
    if (dirty !== '') throw new Error('the working tree has uncommitted changes: commit first, then review');
    const stamp: ReviewStamp = {
      verdict,
      model,
      effort,
      findings: {
        critical: count(argv, 'critical'),
        important: count(argv, 'important'),
        suggestion: count(argv, 'suggestion'),
      },
      reviewId: fingerprint(repoRoot, baseOrThrow()),
      branch: currentBranch(repoRoot) ?? '(detached)',
      createdAt: new Date().toISOString(),
    };
    const path = join(repoRoot, STAMP_PATH);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(stamp, null, 2)}\n`);
    console.log(`✔ wrote ${STAMP_PATH}: ${verdict} by ${model} (${effort}), reviewId ${stamp.reviewId}`);
    return 0;
  }
  console.error('usage: pnpm review:stamp write|verify|fingerprint (see scripts/review-stamp.ts)');
  return 1;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
