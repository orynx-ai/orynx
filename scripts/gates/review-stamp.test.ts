import assert from 'node:assert/strict';
import { it } from 'node:test';
import { evaluateStamp, fingerprintOf, touchesReviewedCode, type ReviewStamp } from '../lib/review.ts';
import { memoryContext } from '../lib/gate.ts';
import gate from './review-stamp.ts';

const stamp = (over: Partial<ReviewStamp> = {}): ReviewStamp => ({
  verdict: 'pass',
  model: 'claude-opus-5-5',
  effort: 'xhigh',
  findings: { critical: 0, important: 1, suggestion: 2 },
  reviewId: fingerprintOf('diff'),
  branch: 'feat/001-shell',
  createdAt: '2026-10-16T12:00:00Z',
  ...over,
});

it('fingerprints are short, stable and change with the diff', () => {
  assert.equal(fingerprintOf('diff').length, 16);
  assert.equal(fingerprintOf('diff'), fingerprintOf('diff'));
  assert.notEqual(fingerprintOf('diff'), fingerprintOf('diff\n+one more line'));
});

it('accepts only a passing stamp for this exact diff', () => {
  const current = fingerprintOf('diff');
  assert.equal(evaluateStamp(stamp(), current).ok, true);
  assert.match(evaluateStamp(null, current).reason, /no review stamp/);
  assert.match(evaluateStamp('invalid', current).reason, /not a valid/);
  assert.match(evaluateStamp(stamp({ verdict: 'fail' }), current).reason, /failed/);
  assert.match(evaluateStamp(stamp(), fingerprintOf('other')).reason, /changed after the review/);
});

it('knows which paths need review', () => {
  assert.equal(touchesReviewedCode(['docs/x.md', 'README.md']), false);
  assert.equal(touchesReviewedCode(['docs/x.md', 'packages/ui/src/a.tsx']), true);
});

it('never runs in CI', async () => {
  assert.deepEqual(await gate.run(memoryContext({}, { ci: true })), []);
  assert.equal(gate.when, 'push');
});
