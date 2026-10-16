import assert from 'node:assert/strict';
import { it } from 'node:test';
import { formatTarget } from './post-edit-format.ts';

it('formats only repo files touched by file tools', () => {
  assert.equal(
    formatTarget({ tool_name: 'Edit', tool_input: { file_path: '/repo/packages/ui/a.tsx' } }, '/repo'),
    '/repo/packages/ui/a.tsx',
  );
  assert.equal(formatTarget({ tool_name: 'Bash', tool_input: { command: 'ls' } }, '/repo'), null);
  assert.equal(formatTarget({ tool_name: 'Write', tool_input: { file_path: '/tmp/a.ts' } }, '/repo'), null);
  assert.equal(formatTarget({ tool_name: 'Write' }, '/repo'), null);
});
