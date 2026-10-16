import assert from 'node:assert/strict';
import { it } from 'node:test';
import { memoryContext } from '../lib/gate.ts';
import gate from './boundaries.ts';

it('boundaries checks source, package.json and unknown packages', async () => {
  const ctx = memoryContext({
    'packages/ui/src/button.tsx': `import { x } from "@devhub/app";`,
    'packages/ui/package.json': JSON.stringify({ dependencies: { '@devhub/contracts': 'workspace:*' } }),
    'packages/extra/package.json': '{}',
    'packages/ui/vite.config.ts': `import { readFile } from "node:fs";`,
  });
  const findings = await gate.run(ctx);
  assert.deepEqual(findings.map((f) => `${f.file}:${f.rule}`).sort(), [
    'packages/extra/package.json:unknown-package',
    'packages/ui/package.json:layering',
    'packages/ui/src/button.tsx:layering',
  ]);
});
