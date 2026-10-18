import assert from 'node:assert/strict';
import { it } from 'node:test';
import { memoryContext } from '../lib/gate.ts';
import gate from './icon-buttons.ts';

const rail = 'packages/app/src/shell/sidebar.tsx';

it('icon-buttons passes IconButton and icon sizes where they are defined', async () => {
  const ctx = memoryContext({
    [rail]: '<IconButton label="Collapse sidebar" size="sm"><Icon icon={SidebarLeftIcon} /></IconButton>\n',
    'packages/ui/src/components/button.tsx': "size: { icon: 'size-10 p-0', 'icon-sm': 'size-8 p-0' },\n",
    'packages/ui/src/components/icon-button.tsx': "<Button size={size === 'sm' ? 'icon-sm' : 'icon'} />\n",
    // A test may press Button's own sizes.
    'packages/ui/src/components/button.test.tsx': '<Button size="icon" aria-label="Refresh" />\n',
    // Outside the browser packages.
    'packages/core/src/x.tsx': '<Button size="icon" />\n',
  });
  assert.deepEqual(await gate.run(ctx), []);
});

it('icon-buttons fails each icon-size button outside IconButton, in JSX and in buttonVariants, with its line', async () => {
  const ctx = memoryContext({
    [rail]: 'const a = 1;\n<Button size="icon-sm" aria-label="Collapse sidebar" />\n',
    'packages/ui/src/components/menu.stories.tsx': '<Button size={\'icon\'} aria-label="Add context" />\n',
    'packages/ui/src/components/pagination.tsx': "buttonVariants({ variant: 'ghost', size: 'icon-sm' })\n",
  });
  const findings = await gate.run(ctx);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${String(f.line)}:${f.rule}`),
    [
      'packages/app/src/shell/sidebar.tsx:2:icon-button-without-tooltip',
      'packages/ui/src/components/menu.stories.tsx:1:icon-button-without-tooltip',
      'packages/ui/src/components/pagination.tsx:1:icon-button-without-tooltip',
    ],
  );
  assert.match(findings[0]?.fix ?? '', /IconButton label/);
});

it('icon-buttons takes an ignore comment with a reason; one without suppresses nothing and is reported', async () => {
  const ctx = memoryContext({
    'packages/ui/src/components/pagination.tsx':
      "// icon-buttons-ignore-next-line: a page number shows its words\nbuttonVariants({ size: 'icon-sm' })\n",
    [rail]: '// icon-buttons-ignore-next-line\n<Button size="icon" />\n',
  });
  const findings = await gate.run(ctx);
  assert.deepEqual(
    findings.map((f) => `${f.file}:${f.rule}`),
    [`${rail}:icon-button-without-tooltip`, `${rail}:ignore-without-reason`],
  );
});
