import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'node:test';
import { gates } from './index.ts';

it('registers every gate once, each with a test file', () => {
  const ids = gates.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.ok(existsSync(join(import.meta.dirname, `${id}.test.ts`)), `scripts/gates/${id}.test.ts is missing`);
  }
});
