import assert from 'node:assert/strict';
import { it } from 'node:test';
import { memoryContext } from '../lib/gate.ts';
import gate from './env-policy.ts';

it('env-policy fails without .env.example', async () => {
  const findings = await gate.run(memoryContext({ 'apps/server/src/config.ts': '' }));
  assert.deepEqual(
    findings.map((f) => f.rule),
    ['missing-example'],
  );
});

it('env-policy checks reads against .env.example', async () => {
  const ctx = memoryContext({
    '.env.example': 'DEVHUB_PORT=4317\n',
    'apps/server/src/config.ts': `const Env = z.object({\n  DEVHUB_PORT: z.coerce.number(),\n  DEVHUB_NEW: z.string(),\n});`,
    'packages/core/src/x.ts': 'const a = process.env.DEVHUB_PORT;',
  });
  const findings = await gate.run(ctx);
  assert.deepEqual(findings.map((f) => `${f.file}:${f.rule}`).sort(), [
    'apps/server/src/config.ts:env-not-in-example',
    'packages/core/src/x.ts:env-outside-config',
  ]);
});
