import assert from 'node:assert/strict';
import { it } from 'node:test';
import { memoryContext } from '../lib/gate.ts';
import gate from './design-source.ts';

it('design-source needs a note whose reference exists', async () => {
  const ctx = memoryContext({
    'docs/design/screens/home.html': '<html></html>',
    'packages/app/src/features/home/home-screen.tsx': '// Design: docs/design/screens/home.html — greeting\n',
    'packages/app/src/features/tickets/tickets-screen.tsx': '// Design: docs/design/screens/tickets-v2.html — board\n',
    'packages/app/src/features/settings/settings-screen.tsx': 'export {};\n',
  });
  const findings = await gate.run(ctx);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.rule}`),
    [
      'packages/app/src/features/settings/settings-screen.tsx:missing-design-note',
      'packages/app/src/features/tickets/tickets-screen.tsx:missing-reference',
    ],
  );
});
