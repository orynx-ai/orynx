import assert from 'node:assert/strict';
import { it } from 'node:test';
import { checkLearnPage, parseLearnSources } from './learn-freshness.ts';

const exists = (p: string): boolean => p !== 'src/gone.ts';

it('parses learn-sources', () => {
  assert.deepEqual(parseLearnSources('# x\n<!-- learn-sources: src/a.ts  src/b.ts -->\n'), ['src/a.ts', 'src/b.ts']);
  assert.equal(parseLearnSources('# x'), null);
});

it('warns about missing comments, missing sources and newer sources', () => {
  const times: Record<string, number> = { 'learn/p.md': 100, 'src/a.ts': 90, 'src/b.ts': 200 };
  const time = (p: string): number | null => times[p] ?? null;
  assert.deepEqual(
    checkLearnPage('learn/p.md', '# none', exists, time).map((f) => f.rule),
    ['no-sources'],
  );
  assert.deepEqual(
    checkLearnPage('learn/p.md', '<!-- learn-sources: src/a.ts src/b.ts src/gone.ts -->', exists, time).map(
      (f) => f.rule,
    ),
    ['may-be-stale', 'missing-source'],
  );
});

it('skips pages and sources that were never committed', () => {
  const time = (): number | null => null;
  assert.deepEqual(checkLearnPage('learn/p.md', '<!-- learn-sources: src/a.ts -->', exists, time), []);
});
