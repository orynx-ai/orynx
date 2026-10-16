import assert from 'node:assert/strict';
import { it } from 'node:test';
import { globToRegExp, toRepoPath } from './repo.ts';

it('globToRegExp handles ** and *', () => {
  assert.equal(globToRegExp('packages/**/*.tsx').test('packages/ui/src/a.tsx'), true);
  assert.equal(globToRegExp('packages/**/*.tsx').test('packages/a.tsx'), true);
  assert.equal(globToRegExp('packages/*.tsx').test('packages/ui/a.tsx'), false);
  assert.equal(globToRegExp('a.ts').test('abts'), false);
});

it('toRepoPath keeps paths inside the repo only', () => {
  assert.equal(toRepoPath('/repo/packages/ui/a.tsx', '/repo'), 'packages/ui/a.tsx');
  assert.equal(toRepoPath('packages/ui/a.tsx', '/repo'), 'packages/ui/a.tsx');
  assert.equal(toRepoPath('/elsewhere/a.tsx', '/repo'), null);
  assert.equal(toRepoPath('/repo', '/repo'), null);
});
