import assert from 'node:assert/strict';
import { it } from 'node:test';
import { memoryContext } from '../lib/gate.ts';
import gate from './test-policy.ts';

it('test-policy checks packages and e2e, not scripts', async () => {
  const ctx = memoryContext({
    'packages/app/src/a.test.tsx': `screen.getByTestId("x");`,
    'e2e/smoke.spec.ts': `test.only("x", async () => {});`,
    'scripts/gates/fixture.test.ts': `screen.getByTestId("x");`,
  });
  const findings = await gate.run(ctx);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.rule}`),
    ['e2e/smoke.spec.ts:focused-test', 'packages/app/src/a.test.tsx:test-id-query'],
  );
});
