import assert from 'node:assert/strict';
import { it } from 'node:test';
import { applyIgnores, formatFinding, makeLineLookup, type Finding } from './gate.ts';

const finding = (line: number): Finding => ({ file: 'a.ts', line, rule: 'r', message: 'm', fix: 'f' });

it('maps offsets to lines', () => {
  const lineOf = makeLineLookup('a\nbc\n\nd');
  assert.deepEqual([0, 1, 2, 4, 5, 6].map(lineOf), [1, 1, 2, 2, 3, 4]);
});

it('formats a finding with its location and fix', () => {
  assert.equal(formatFinding(finding(3)), '  a.ts:3  r: m\n    fix: f');
  assert.equal(formatFinding(finding(0)), '  a.ts  r: m\n    fix: f');
});

it('applies reasoned ignores in any comment syntax and reports reason-less ones', () => {
  const content = [
    '// g-ignore-next-line: shortcut, not a word',
    'x',
    '{/* g-ignore-next-line: ok */}',
    'y',
    '/* g-ignore-next-line */',
    'z',
  ].join('\n');
  const result = applyIgnores('g', 'a.ts', content, [finding(2), finding(4), finding(6)]);
  assert.deepEqual(
    result.map((f) => `${f.rule}@${f.line}`),
    ['r@6', 'ignore-without-reason@5'],
  );
});
