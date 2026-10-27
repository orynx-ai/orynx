import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it } from 'node:test';
import { globToRegExp, listFiles, toRepoPath } from './repo.ts';

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

it('listFiles leaves out an untracked link to a folder, which no gate can read', () => {
  const root = mkdtempSync(join(tmpdir(), 'devhub-repo-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(join(root, 'skills', 'brag'), { recursive: true });
    writeFileSync(join(root, 'skills', 'brag', 'SKILL.md'), '# brag\n');
    writeFileSync(join(root, 'a.ts'), 'export {};\n');
    symlinkSync('skills/brag', join(root, 'brag'));
    symlinkSync('a.ts', join(root, 'b.ts'));
    assert.deepEqual(listFiles(root), ['a.ts', 'b.ts', 'skills/brag/SKILL.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
