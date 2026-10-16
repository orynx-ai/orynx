import assert from 'node:assert/strict';
import { it } from 'node:test';
import { renderAgentFiles } from '../lib/agent-rules.ts';
import { memoryContext } from '../lib/gate.ts';
import gate from './agent-rules.ts';

const CLAUDE = '# H\n\n<!-- agent-rules:start -->\n## Rules\n\n1. Be good.\n<!-- agent-rules:end -->\n';

it('renders every agent file from the CLAUDE.md block', () => {
  const files = renderAgentFiles(CLAUDE);
  assert.deepEqual(Object.keys(files).sort(), [
    '.cursor/rules/00-core.mdc',
    '.github/copilot-instructions.md',
    'AGENTS.md',
  ]);
  assert.match(files['AGENTS.md'] ?? '', /Do not edit by hand[\s\S]*1\. Be good\./);
  assert.match(
    files['.cursor/rules/00-core.mdc'] ?? '',
    /^---\ndescription: DevHub core rules \(generated\)\nalwaysApply: true\n---/,
  );
});

it('agent-rules passes when files match and fails when stale or missing', async () => {
  const fresh = renderAgentFiles(CLAUDE);
  assert.deepEqual(await gate.run(memoryContext({ 'CLAUDE.md': CLAUDE, ...fresh })), []);
  const stale = await gate.run(memoryContext({ 'CLAUDE.md': CLAUDE, 'AGENTS.md': 'old' }));
  assert.deepEqual(
    stale.map((f) => `${f.file}:${f.message}`),
    [
      'AGENTS.md:does not match the rules in CLAUDE.md',
      '.github/copilot-instructions.md:is missing',
      '.cursor/rules/00-core.mdc:is missing',
    ],
  );
});

it('agent-rules fails when the markers are gone', async () => {
  const findings = await gate.run(memoryContext({ 'CLAUDE.md': '# no markers' }));
  assert.deepEqual(
    findings.map((f) => f.rule),
    ['missing-markers'],
  );
});
