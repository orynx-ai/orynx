import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { lintShards } from './lint-shards.ts';

const root = mkdtempSync(join(tmpdir(), 'lint-shards-'));
after(() => {
  rmSync(root, { recursive: true, force: true });
});

function addFolder(path: string, withPackageJson: boolean): void {
  mkdirSync(join(root, path), { recursive: true });
  if (withPackageJson) writeFileSync(join(root, path, 'package.json'), '{}');
}

describe('lintShards', () => {
  it('gives each workspace package its own shard and leaves the rest to the root shard', () => {
    addFolder('packages/ui', true);
    addFolder('packages/core', true);
    addFolder('apps/web', true);
    addFolder('packages/notes', false);

    assert.deepEqual(lintShards(root), [
      { name: 'apps/web', args: ['apps/web'] },
      { name: 'packages/core', args: ['packages/core'] },
      { name: 'packages/ui', args: ['packages/ui'] },
      {
        name: 'root',
        args: [
          '.',
          '--ignore-pattern',
          'apps/web/**',
          '--ignore-pattern',
          'packages/core/**',
          '--ignore-pattern',
          'packages/ui/**',
        ],
      },
    ]);
  });

  it('lints everything in one shard when there are no workspace packages', () => {
    const empty = mkdtempSync(join(tmpdir(), 'lint-shards-empty-'));
    try {
      assert.deepEqual(lintShards(empty), [{ name: 'root', args: ['.'] }]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
