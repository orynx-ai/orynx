// Shows what the pinned Claude Agent SDK hands Claude Code for a session (specs 011 and 012), so the e2e
// fake can speak the same protocol. A stand-in program records its arguments and the first message the
// SDK sends, then exits: nothing reaches Claude. Run it after bumping the SDK, and compare with the
// record in learn/sessions-and-worktrees.md:
//
//   node e2e/fake-claude/probe.ts
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Query = (params: { prompt: AsyncIterable<unknown>; options: Record<string, unknown> }) => AsyncIterable<unknown>;

// The SDK is core's dependency, so it's found from there.
const fromCore = createRequire(new URL('../../packages/core/package.json', import.meta.url));
const sdk = (await import(pathToFileURL(fromCore.resolve('@anthropic-ai/claude-agent-sdk')).href)) as { query: Query };

const folder = mkdtempSync(join(tmpdir(), 'devhub-sdk-probe-'));
const record = join(folder, 'record.txt');
const program = join(folder, 'claude');
writeFileSync(
  program,
  `#!/bin/sh\nprintf '%s\\n' "$@" > '${record}'\necho --- >> '${record}'\nhead -n 1 >> '${record}'\n`,
);
chmodSync(program, 0o755);

async function* brief() {
  yield { type: 'user', message: { role: 'user', content: 'probe' }, parent_tool_use_id: null };
  await new Promise((resolve) => setTimeout(resolve, 2_000));
}

// The options a session passes (claude-adapter.ts), with a sandbox for this folder (sandbox.ts).
const run = sdk.query({
  prompt: brief(),
  options: {
    cwd: folder,
    pathToClaudeCodeExecutable: program,
    env: { PATH: '/usr/bin:/bin', HOME: folder },
    permissionMode: 'default',
    tools: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'NotebookEdit', 'TodoWrite', 'Bash'],
    settingSources: [],
    settings: { disableAllHooks: true },
    strictMcpConfig: true,
    mcpServers: {},
    systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Probe.' },
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: false,
      allowUnsandboxedCommands: true,
      network: { allowedDomains: [], strictAllowlist: true, allowLocalBinding: false, allowAllUnixSockets: false },
      filesystem: { allowWrite: [folder], denyRead: ['/probe/devhub-home'], allowRead: [folder] },
    },
    canUseTool: () => Promise.resolve({ behavior: 'allow' }),
  },
});
try {
  // The messages say nothing the probe needs: it reads what the stand-in recorded.
  for await (const _message of run);
} catch {
  // The stand-in exits without answering, which the SDK reports as an error.
}
console.log(readFileSync(record, 'utf8'));
rmSync(folder, { recursive: true, force: true });
