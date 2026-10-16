import assert from 'node:assert/strict';
import { it } from 'node:test';
import { fingerprintOf, type ReviewStamp } from '../lib/review.ts';
import { decideStop, REVIEW_MESSAGE, type BranchState } from './stop-review.ts';

const FP = fingerprintOf('diff');
const passing: ReviewStamp = {
  verdict: 'pass',
  model: 'claude-opus-5-5',
  effort: 'xhigh',
  findings: { critical: 0, important: 0, suggestion: 0 },
  reviewId: FP,
  branch: 'feat/001-shell',
  createdAt: '2026-10-16T00:00:00Z',
};
const state =
  (over: Partial<BranchState> = {}) =>
  (): BranchState => ({
    branch: 'feat/001-shell',
    base: 'abc123',
    ahead: 2,
    changed: ['packages/app/src/x.tsx'],
    fingerprint: FP,
    stamp: null,
    ...over,
  });

it('asks for /review when code changed and there is no matching stamp', () => {
  const d = decideStop({}, {}, state());
  assert.equal(d.block, true);
  assert.equal(d.reason, REVIEW_MESSAGE);
  assert.equal(decideStop({}, {}, state({ stamp: { ...passing, reviewId: '0000000000000000' } })).block, true);
});

it('lets the agent stop otherwise', () => {
  assert.equal(decideStop({ stop_hook_active: true }, {}, state()).block, false);
  assert.equal(decideStop({}, { DEVHUB_SKIP_REVIEW_HOOK: '1' }, state()).block, false);
  assert.equal(decideStop({}, {}, state({ branch: 'main' })).block, false);
  assert.equal(decideStop({}, {}, state({ branch: null })).block, false);
  assert.equal(decideStop({}, {}, state({ ahead: 0 })).block, false);
  assert.equal(decideStop({}, {}, state({ changed: ['docs/x.md'] })).block, false);
  assert.equal(decideStop({}, {}, state({ stamp: passing })).block, false);
  assert.equal(decideStop({}, {}, state({ base: null })).block, false);
});
