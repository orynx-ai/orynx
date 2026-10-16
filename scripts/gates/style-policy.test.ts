import assert from 'node:assert/strict';
import { it } from 'node:test';
import { memoryContext } from '../lib/gate.ts';
import gate from './style-policy.ts';

it('style-policy checks in-scope files and skips the theme', async () => {
  const ctx = memoryContext({
    'packages/ui/src/components/button.tsx': `export const c = "bg-gray-100";`,
    'packages/ui/src/styles/theme.css': `:root { --x: #fff; }`,
    'packages/core/src/x.ts': `const c = "text-sm";`,
  });
  const findings = await gate.run(ctx);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.rule}`),
    ['packages/ui/src/components/button.tsx:default-palette'],
  );
});
