import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeClaudeSdk, type FakeTurn } from '../../test/fake-claude-sdk.ts';
import type { AgentEvent, AgentPermissions } from '../agent-adapter.ts';
import { createClaudeAdapter } from './claude-adapter.ts';
import { sessionToolsWithoutCommands } from './tool-decision.ts';

let root: string;
let worktree: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'devhub-claude-adapter-')));
  worktree = join(root, 'worktrees', '0123456789abcdef');
  await mkdir(join(worktree, 'src'), { recursive: true });
  await writeFile(join(worktree, 'src', 'a.ts'), 'export const a = 1;\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const brief = {
  message: '',
  context: [
    { kind: 'jira' as const, title: 'Jira ticket PROJ-1423 (Story): Add bulk archive', body: 'No description.' },
  ],
};
const editFreely: AgentPermissions = { mode: 'edit_freely_ask_commands', allowedCommands: [] };
const env = { HOME: '/Users/you', PATH: '/usr/bin' };

function setUp(script: readonly FakeTurn[], { stopGraceMs = 5_000 }: { stopGraceMs?: number } = {}) {
  const sdk = fakeClaudeSdk(script);
  const adapter = createClaudeAdapter({
    query: sdk.query,
    program: '/opt/claude/claude',
    env,
    home: root,
    stopGraceMs,
  });
  return { sdk, adapter };
}

/** Starts a session and gathers its events until `ended`. */
async function runToEnd(adapter: ReturnType<typeof setUp>['adapter'], permissions = editFreely) {
  const id = await adapter.startSession(brief, worktree, permissions, 'Work in the worktree.');
  const events: AgentEvent[] = [];
  await new Promise<void>((resolve) => {
    adapter.onEvent(id, (event) => {
      events.push(event);
      if (event.type === 'ended') resolve();
    });
  });
  return { id, events };
}

const works = (events: readonly AgentEvent[]) => events.flatMap((event) => (event.type === 'work' ? [event.work] : []));

describe('the Claude adapter', () => {
  it('AC-20: starts Claude Code in the worktree with only Orynx’s options: no settings files, hooks off, Q6’s tools', async () => {
    const { sdk, adapter } = setUp([{ finish: 'Done.' }]);
    await runToEnd(adapter);

    const options = sdk.runs[0]?.options;
    expect(options).toMatchObject({
      cwd: worktree,
      pathToClaudeCodeExecutable: '/opt/claude/claude',
      env: { HOME: '/Users/you', PATH: '/usr/bin', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      permissionMode: 'default',
      tools: [...sessionToolsWithoutCommands],
      settingSources: [],
      settings: { disableAllHooks: true },
      strictMcpConfig: true,
      mcpServers: {},
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Work in the worktree.' },
    });
    expect(Object.keys(options?.env ?? {}).sort()).toEqual([
      'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
      'HOME',
      'PATH',
    ]);
    expect(options?.persistSession).not.toBe(false);
    expect(options).not.toHaveProperty('allowedTools');
  });

  it('AC-3: sends exactly the brief as the first message', async () => {
    const { sdk, adapter } = setUp([{ finish: 'Done.' }]);
    await runToEnd(adapter);
    expect(sdk.runs[0]?.prompts).toEqual(['Jira ticket PROJ-1423 (Story): Add bulk archive\n\nNo description.']);
  });

  it('AC-4, AC-8: says it started, each piece of work, the finish, then that it ended', async () => {
    const { adapter } = setUp([
      { tool: 'Read', input: { file_path: join(worktree, 'src', 'a.ts') } },
      {
        tool: 'TodoWrite',
        input: { todos: [{ content: 'Add a toolbar button', status: 'pending', activeForm: 'x' }] },
      },
      { tool: 'Edit', input: { file_path: join(worktree, 'src', 'a.ts'), old_string: '1', new_string: '2' } },
      { finish: 'Changed a to 2.' },
    ]);
    const { id, events } = await runToEnd(adapter);

    expect(events[0]).toEqual({
      type: 'started',
      sessionId: id,
      agentSessionId: 'b2c7e0f4-0000-4000-8000-000000000001',
      loaded: { tools: 7, mcpServers: 0, plugins: 0 },
    });
    expect(works(events)).toEqual([
      { kind: 'explore', file: 'src/a.ts' },
      { kind: 'plan', items: ['Add a toolbar button'] },
      { kind: 'edit', file: 'src/a.ts' },
      { kind: 'finished', summary: 'Changed a to 2.' },
    ]);
    expect(events.at(-1)).toEqual({ type: 'ended', sessionId: id });
  });

  it('AC-5: refuses a call outside the worktree, tells Claude why, and shows the refusal instead of the work', async () => {
    const { sdk, adapter } = setUp([
      { tool: 'Write', input: { file_path: '/etc/hosts', content: 'x' } },
      { finish: 'Could not do it.' },
    ]);
    const { events } = await runToEnd(adapter);

    const decision = sdk.runs[0]?.decisions[0]?.result;
    expect(decision?.behavior).toBe('deny');
    expect(decision?.behavior === 'deny' && decision.message).toMatch(/worktree/);
    expect(works(events)).toEqual([
      { kind: 'refused', refusal: { access: 'edit', reason: 'outside_worktree', path: '/etc/hosts' } },
      { kind: 'finished', summary: 'Could not do it.' },
    ]);
  });

  it('AC-6: refuses every edit while Ask before everything is on', async () => {
    const { adapter } = setUp([
      { tool: 'Edit', input: { file_path: 'src/a.ts', old_string: '1', new_string: '2' } },
      { finish: 'Described the change instead.' },
    ]);
    const { events } = await runToEnd(adapter, { mode: 'ask_everything', allowedCommands: [] });
    expect(works(events)).toEqual([
      { kind: 'refused', refusal: { access: 'edit', reason: 'ask_everything', path: 'src/a.ts' } },
      { kind: 'finished', summary: 'Described the change instead.' },
    ]);
  });

  it('AC-5 (Q6): refuses a tool a session doesn’t have, without a step', async () => {
    const { sdk, adapter } = setUp([
      { tool: 'WebFetch', input: { url: 'https://example.com', prompt: 'x' } },
      { finish: 'Did not fetch.' },
    ]);
    const { events } = await runToEnd(adapter);
    expect(sdk.runs[0]?.decisions[0]?.result.behavior).toBe('deny');
    expect(works(events)).toEqual([{ kind: 'finished', summary: 'Did not fetch.' }]);
  });

  it('keeps the events that come before anyone listens, for the first listener', async () => {
    const { adapter } = setUp([{ finish: 'Done.' }]);
    const id = await adapter.startSession(brief, worktree, editFreely, 'x');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const events: AgentEvent[] = [];
    await new Promise<void>((resolve) => {
      adapter.onEvent(id, (event) => {
        events.push(event);
        if (event.type === 'ended') resolve();
      });
    });
    expect(events.map((event) => event.type)).toEqual(['started', 'work', 'ended']);
  });

  it('AC-9: Stop interrupts Claude, and resolves once it has ended', async () => {
    const { sdk, adapter } = setUp([{ tool: 'Read', input: { file_path: 'src/a.ts' } }, { hang: true }]);
    const id = await adapter.startSession(brief, worktree, editFreely, 'x');
    const events: AgentEvent[] = [];
    const ended = new Promise<void>((resolve) => {
      adapter.onEvent(id, (event) => {
        events.push(event);
        if (event.type === 'work') void adapter.stop(id).then(resolve);
      });
    });
    await ended;
    expect(sdk.runs[0]).toMatchObject({ interrupts: 1, closes: 0 });
    expect(events.at(-1)).toEqual({ type: 'ended', sessionId: id });
  });

  it('AC-9: says no problem for the failed result an interrupted turn ends with', async () => {
    const { adapter } = setUp([{ tool: 'Read', input: { file_path: 'src/a.ts' } }, { hang: true }]);
    const id = await adapter.startSession(brief, worktree, editFreely, 'x');
    const events: AgentEvent[] = [];
    await new Promise<void>((resolve) => {
      adapter.onEvent(id, (event) => {
        events.push(event);
        if (event.type === 'work') void adapter.stop(id).then(resolve);
      });
    });
    expect(events.filter((event) => event.type === 'problem')).toEqual([]);
  });

  it('AC-9: ends Claude Code’s process when it doesn’t stop in time', async () => {
    const { sdk, adapter } = setUp([{ hang: true }], { stopGraceMs: 50 });
    sdk.ignoreInterrupt = true;
    const id = await adapter.startSession(brief, worktree, editFreely, 'x');
    const ended = new Promise<void>((resolve) => {
      adapter.onEvent(id, (event) => {
        if (event.type === 'ended') resolve();
      });
    });
    await adapter.stop(id);
    await ended;
    expect(sdk.runs[0]).toMatchObject({ interrupts: 1, closes: 1 });
  });

  it('AC-13: says Claude Code ended with an error when its process dies, without its words', async () => {
    const { adapter } = setUp([{ crash: 'Claude Code process exited with code 1: secret stack' }]);
    const { id, events } = await runToEnd(adapter);
    expect(events.slice(-2)).toEqual([
      { type: 'problem', sessionId: id, kind: 'other', code: 'exited' },
      { type: 'ended', sessionId: id },
    ]);
    expect(JSON.stringify(events)).not.toContain('secret stack');
  });

  it('AC-13: passes on a refused login', async () => {
    const { adapter } = setUp([
      {
        message: {
          type: 'assistant',
          parent_tool_use_id: null,
          error: 'authentication_failed',
          message: { content: [] },
        },
      },
      { message: { type: 'result', subtype: 'success', is_error: true, api_error_status: 401, result: 'API Error' } },
    ]);
    const { id, events } = await runToEnd(adapter);
    expect(events.filter((event) => event.type === 'problem')).toEqual([
      { type: 'problem', sessionId: id, kind: 'login', code: 'authentication_failed' },
    ]);
  });

  it('answers approvals and follow-ups with an error until specs 012 and 013', async () => {
    const { adapter } = setUp([{ finish: 'Done.' }]);
    const { id } = await runToEnd(adapter);
    await expect(adapter.respond(id, 'a1', 'allow')).rejects.toThrow(/012/);
    await expect(adapter.sendMessage(id, 'More')).rejects.toThrow(/013/);
  });

  it('stopping a session that has ended, or one it never started, is fine', async () => {
    const { adapter } = setUp([{ finish: 'Done.' }]);
    const { id } = await runToEnd(adapter);
    await expect(adapter.stop(id)).resolves.toBeUndefined();
    await expect(adapter.stop('never-started')).resolves.toBeUndefined();
  });
});
