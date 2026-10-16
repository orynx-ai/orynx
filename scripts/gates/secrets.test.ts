import assert from 'node:assert/strict';
import { it } from 'node:test';
import { memoryContext } from '../lib/gate.ts';
import gate from './secrets.ts';

it('secrets flags secret files and token values, skips binaries', async () => {
  const token = 'gh' + 'p_' + 'Z'.repeat(40);
  const ctx = memoryContext({
    '.env': 'X=1',
    '.env.example': 'X=',
    'packages/core/src/x.ts': `const t = "${token}";`,
    'docs/design/screens/home-dark.png': token,
  });
  const findings = await gate.run(ctx);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.rule}`),
    ['.env:secret-file', 'packages/core/src/x.ts:secret-value'],
  );
});
