import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRunArgs, selectGates, type RunOptions } from './run-options.ts';

const GATES = [
  { id: 'style-policy', when: 'always' as const },
  { id: 'secrets', when: 'always' as const },
  { id: 'review-stamp', when: 'push' as const },
];

function opts(argv: string[]): RunOptions {
  const parsed = parseRunArgs(argv);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.options;
}

describe('parseRunArgs', () => {
  it('parses every flag', () => {
    assert.deepEqual(opts(['--only', 'secrets,style-policy', '--push', '--ci', '--skip-self-test']), {
      only: ['secrets', 'style-policy'],
      push: true,
      ci: true,
      list: false,
      skipSelfTest: true,
    });
    assert.deepEqual(opts(['--only', 'a', 'b']).only, ['a', 'b']);
    assert.deepEqual(opts(['--only=a']).only, ['a']);
  });

  it('rejects unknown arguments and a bare --only', () => {
    assert.equal(parseRunArgs(['--nope']).ok, false);
    assert.equal(parseRunArgs(['--only']).ok, false);
  });
});

describe('selectGates', () => {
  const ids = (argv: string[]): string[] => {
    const s = selectGates(GATES, opts(argv));
    if (!s.ok) throw new Error(s.error);
    return s.gates.map((g) => g.id);
  };

  it('runs push gates only with --push or --only, never in CI', () => {
    assert.deepEqual(ids([]), ['style-policy', 'secrets']);
    assert.deepEqual(ids(['--push']), ['style-policy', 'secrets', 'review-stamp']);
    assert.deepEqual(ids(['--only', 'review-stamp']), ['review-stamp']);
    assert.deepEqual(ids(['--push', '--ci']), ['style-policy', 'secrets']);
  });

  it('rejects unknown ids and lists the real ones', () => {
    const s = selectGates(GATES, opts(['--only', 'nope']));
    assert.ok(!s.ok);
    assert.match(s.error, /style-policy, secrets, review-stamp/);
  });
});
