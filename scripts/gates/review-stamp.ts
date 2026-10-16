import type { Gate } from '../lib/gate.ts';
import {
  commitsAhead,
  currentBranch,
  evaluateStamp,
  fingerprint,
  readStamp,
  resolveBase,
  STAMP_PATH,
} from '../lib/review.ts';

const FIX = 'run /review — it reviews the branch and writes the stamp with `pnpm review:stamp write`';

const gate: Gate = {
  id: 'review-stamp',
  description: 'Before push: a passing /review stamp matches this exact change',
  mode: 'fail',
  when: 'push',
  run(ctx) {
    if (ctx.ci) return [];
    const branch = currentBranch(ctx.root);
    if (branch === null || branch === 'main') return [];
    const base = resolveBase(ctx.root);
    if (base === null) {
      return [
        {
          file: STAMP_PATH,
          line: 0,
          rule: 'no-base',
          message: 'cannot find origin/main or main to compare this branch with',
          fix: 'fetch main (`git fetch origin main`) so the gate can fingerprint the branch',
        },
      ];
    }
    if (commitsAhead(ctx.root, base) === 0) return [];
    const check = evaluateStamp(readStamp(ctx.root), fingerprint(ctx.root, base));
    return check.ok
      ? []
      : [{ file: STAMP_PATH, line: 0, rule: 'not-reviewed', message: `${branch}: ${check.reason}`, fix: FIX }];
  },
};

export default gate;
