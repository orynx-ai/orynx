import assert from 'node:assert/strict';
import { it } from 'node:test';
import { findMissingCompanions } from './component-coverage.ts';

it('requires stories and tests for ui components, tests for app screens, components and shell', () => {
  const findings = findMissingCompanions([
    'packages/ui/src/components/button.tsx',
    'packages/ui/src/components/button.test.tsx',
    'packages/ui/src/components/pill.tsx',
    'packages/ui/src/components/pill.stories.tsx',
    'packages/ui/src/components/pill.test.tsx',
    'packages/app/src/features/home/home-screen.tsx',
    'packages/app/src/features/home/components/inbox-row.tsx',
    'packages/app/src/features/home/components/inbox-row.test.tsx',
    'packages/app/src/shell/sidebar.tsx',
    'packages/app/src/features/home/queries.ts',
  ]);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.rule}`),
    [
      'packages/ui/src/components/button.tsx:missing-story',
      'packages/app/src/features/home/home-screen.tsx:missing-test',
      'packages/app/src/shell/sidebar.tsx:missing-test',
    ],
  );
  assert.match(findings[0]?.fix ?? '', /button\.stories\.tsx/);
});
