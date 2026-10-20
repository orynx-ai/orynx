import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SandboxSettings } from '@anthropic-ai/claude-agent-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrynxTicketSchema, defaultPermissions } from '@devhub/contracts';
import { createEventBus } from '../../events/event-bus.ts';
import { createOrynxTicketService } from '../../orynx-tickets/ticket-service.ts';
import { createOrynxTicketStore } from '../../orynx-tickets/ticket-store.ts';
import { ticketTools } from '../../orynx-tickets/tools.ts';
import { createMemorySessionStore } from '../../sessions/session-store.ts';
import { fakeClaudeSdk, freshSessionId, type FakeTurn } from '../../test/fake-claude-sdk.ts';
import type { AgentAdapter, AgentEvent, AgentPermissions } from '../agent-adapter.ts';
import { createClaudeAdapter } from './claude-adapter.ts';
import { sandboxSettings } from './sandbox.ts';
import { sessionTools, sessionToolsWithoutCommands } from './tool-decision.ts';

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
const fixed = (permissions: AgentPermissions) => () => Promise.resolve(permissions);
const editFreely = fixed({ ...defaultPermissions, allowedCommands: [] });
const env = { HOME: '/Users/you', PATH: '/usr/bin' };

function sandboxFor(path: string): SandboxSettings {
  return sandboxSettings({ platform: 'darwin', worktree: path, devhubHome: root, home: root, temporary: tmpdir() });
}

interface SetUpOptions {
  stopGraceMs?: number;
  sandbox?: ((worktree: string) => SandboxSettings) | null;
  modelsTimeoutMs?: number;
  now?: () => number;
}

function setUp(
  script: readonly FakeTurn[],
  { stopGraceMs = 5_000, sandbox = sandboxFor, modelsTimeoutMs, now }: SetUpOptions = {},
) {
  const sdk = fakeClaudeSdk(script);
  const adapter = createClaudeAdapter({
    query: sdk.query,
    program: '/opt/claude/claude',
    env,
    home: root,
    stopGraceMs,
    sandbox,
    ...(modelsTimeoutMs === undefined ? {} : { modelsTimeoutMs }),
    ...(now === undefined ? {} : { now }),
  });
  return { sdk, adapter };
}

/** Starts a session and gathers its events until `ended`. */
async function runToEnd(adapter: AgentAdapter, permissions = editFreely) {
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

/** Starts a session and keeps its events as they come, for a test that answers calls while Claude waits. */
async function watch(adapter: AgentAdapter, permissions = editFreely) {
  const id = await adapter.startSession(brief, worktree, permissions, 'x');
  const events: AgentEvent[] = [];
  adapter.onEvent(id, (event) => events.push(event));
  const approvals = async (count = 1) => {
    await vi.waitFor(() => {
      expect(events.filter((event) => event.type === 'approval')).toHaveLength(count);
    });
    return events.flatMap((event) => (event.type === 'approval' ? [event] : []));
  };
  const ended = () =>
    vi.waitFor(() => {
      expect(events.at(-1)?.type).toBe('ended');
    });
  return { id, events, approvals, ended };
}

const npmTest = { command: 'npm test -- content-list', description: 'Run the content list tests' };
const deniedMessage =
  "The user denied this. Don't try it another way. Carry on without it, or say in your summary what you needed.";

describe('the Claude adapter', () => {
  it('AC-20: starts Claude Code in the worktree with only Orynx’s options: no settings files, hooks off, the tools and the sandbox', async () => {
    const { sdk, adapter } = setUp([{ finish: 'Done.' }]);
    await runToEnd(adapter);

    const options = sdk.runs[0]?.options;
    expect(options).toMatchObject({
      cwd: worktree,
      pathToClaudeCodeExecutable: '/opt/claude/claude',
      env: { HOME: '/Users/you', PATH: '/usr/bin', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      permissionMode: 'default',
      tools: [...sessionTools],
      sandbox: sandboxFor(worktree),
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
      loaded: { tools: 8, mcpServers: 0, plugins: 0 },
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

  it('AC-20, Q2b: without a sandbox, Claude gets no commands, and says so after it starts', async () => {
    const { sdk, adapter } = setUp([{ finish: 'Done.' }], { sandbox: null });
    const { events } = await runToEnd(adapter);
    expect(sdk.runs[0]?.options.tools).toEqual([...sessionToolsWithoutCommands]);
    expect(sdk.runs[0]?.options).not.toHaveProperty('sandbox');
    expect(events[0]?.type).toBe('started');
    expect(works(events)).toEqual([{ kind: 'no_commands' }, { kind: 'finished', summary: 'Done.' }]);
  });

  it('AC-1, AC-2: a command waits for your answer, then runs when you allow it once', async () => {
    const { sdk, adapter } = setUp([{ tool: 'Bash', input: npmTest }, { finish: 'Ran the tests.' }]);
    const session = await watch(adapter);
    const [approval] = await session.approvals();

    expect(approval).toMatchObject({
      type: 'approval',
      sessionId: session.id,
      ask: { kind: 'command', ...npmTest, alwaysAsk: null, alwaysAllow: null },
    });
    expect(sdk.runs[0]).toMatchObject({ waiting: 1, decisions: [] });

    expect(await adapter.respond(session.id, approval?.approvalId ?? '', 'allow')).toBe(true);
    await session.ended();
    expect(sdk.runs[0]?.decisions[0]?.result).toEqual({ behavior: 'allow', updatedInput: npmTest });
    const after = session.events.slice(session.events.indexOf(approval as AgentEvent) + 1);
    expect(after.slice(0, 2)).toEqual([
      { type: 'answered', sessionId: session.id, approvalId: approval?.approvalId, allowed: true },
      {
        type: 'work',
        sessionId: session.id,
        work: { kind: 'command', id: 'toolu_1', command: 'npm test -- content-list' },
      },
    ]);
  });

  it('AC-19 (036): says when a command you allowed ended, with its output and the time since you allowed it', async () => {
    let at = 1_000;
    const { adapter } = setUp(
      [{ tool: 'Bash', input: npmTest, output: 'Tests: 1 failed', fails: true }, { finish: 'Ran the tests.' }],
      { now: () => at },
    );
    const session = await watch(adapter);
    const [approval] = await session.approvals();
    // A minute waiting for you isn't the command's time: it runs from your answer.
    at = 61_000;
    await adapter.respond(session.id, approval?.approvalId ?? '', 'allow');
    await session.ended();

    expect(session.events).toContainEqual({
      type: 'command_ended',
      sessionId: session.id,
      id: 'toolu_1',
      output: 'Tests: 1 failed',
      failed: true,
      ms: 0,
    });
  });

  it('AC-19 (036): says nothing of the end of a command you denied, which never ran', async () => {
    const { adapter } = setUp([{ tool: 'Bash', input: npmTest }, { finish: 'Skipped the tests.' }]);
    const session = await watch(adapter);
    const [approval] = await session.approvals();
    await adapter.respond(session.id, approval?.approvalId ?? '', 'deny');
    await session.ended();

    expect(session.events.some((event) => event.type === 'command_ended')).toBe(false);
  });

  it('AC-3: Deny tells Claude and it carries on, and shows what you denied', async () => {
    const { sdk, adapter } = setUp([{ tool: 'Bash', input: npmTest }, { finish: 'Skipped the tests.' }]);
    const session = await watch(adapter);
    const [approval] = await session.approvals();
    await adapter.respond(session.id, approval?.approvalId ?? '', 'deny');
    await session.ended();

    expect(sdk.runs[0]?.decisions[0]?.result).toEqual({ behavior: 'deny', message: deniedMessage });
    expect(works(session.events)).toEqual([
      { kind: 'denied', about: 'command', text: 'npm test -- content-list' },
      { kind: 'finished', summary: 'Skipped the tests.' },
    ]);
  });

  it('AC-5: offers Always allow in Edit files and run allowed commands, which runs the call as Allow once does', async () => {
    const { sdk, adapter } = setUp([
      { tool: 'Bash', input: { command: 'npm run lint -- --fix' } },
      { finish: 'Linted.' },
    ]);
    const session = await watch(
      adapter,
      fixed({ ...defaultPermissions, commands: 'allowed_list', allowedCommands: ['npm test'] }),
    );
    const [approval] = await session.approvals();
    expect(approval?.ask).toMatchObject({ alwaysAsk: null, alwaysAllow: 'npm run lint' });
    await adapter.respond(session.id, approval?.approvalId ?? '', 'always');
    await session.ended();
    expect(sdk.runs[0]?.decisions[0]?.result.behavior).toBe('allow');
  });

  it('AC-4: runs a command on the list without asking, and shows it', async () => {
    const { sdk, adapter } = setUp([{ tool: 'Bash', input: npmTest }, { finish: 'Ran the tests.' }]);
    const { events } = await runToEnd(
      adapter,
      fixed({ ...defaultPermissions, commands: 'allowed_list', allowedCommands: ['npm test'] }),
    );
    expect(events.some((event) => event.type === 'approval')).toBe(false);
    expect(sdk.runs[0]?.decisions[0]?.result).toEqual({ behavior: 'allow', updatedInput: npmTest });
    // Shown once: when Orynx allowed it, not again when its result comes.
    expect(works(events)).toEqual([
      { kind: 'command', id: 'toolu_1', command: 'npm test -- content-list' },
      { kind: 'finished', summary: 'Ran the tests.' },
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'command_ended', id: 'toolu_1', output: 'ok' }));
  });

  it('AC-6: an always-ask command you allow runs once outside the sandbox', async () => {
    const curl = { command: 'curl -fsS https://registry.npmjs.org/react' };
    const { sdk, adapter } = setUp([{ tool: 'Bash', input: curl }, { finish: 'Fetched.' }]);
    const session = await watch(
      adapter,
      fixed({ ...defaultPermissions, commands: 'allowed_list', allowedCommands: ['curl'] }),
    );
    const [approval] = await session.approvals();
    expect(approval?.ask).toMatchObject({ alwaysAsk: 'network', alwaysAllow: null });
    await adapter.respond(session.id, approval?.approvalId ?? '', 'allow');
    await session.ended();
    expect(sdk.runs[0]?.decisions[0]?.result).toEqual({
      behavior: 'allow',
      updatedInput: { ...curl, dangerouslyDisableSandbox: true },
    });
  });

  it('spec 026: with Push the branch on Allow, pushes the session branch without asking, outside the sandbox', async () => {
    const push = { command: 'git push -u origin feat/PROJ-1423' };
    const { sdk, adapter } = setUp([{ tool: 'Bash', input: push }, { finish: 'Pushed.' }]);
    const { events } = await runToEnd(
      adapter,
      fixed({ ...defaultPermissions, push: 'allow', branch: 'feat/PROJ-1423', allowedCommands: [] }),
    );
    expect(events.some((event) => event.type === 'approval')).toBe(false);
    expect(sdk.runs[0]?.decisions[0]?.result).toEqual({
      behavior: 'allow',
      updatedInput: { ...push, dangerouslyDisableSandbox: true },
    });
  });

  it('AC-7: refuses a push without asking, and shows it as a step', async () => {
    const { sdk, adapter } = setUp([{ tool: 'Bash', input: { command: 'git push origin HEAD' } }, { finish: 'x' }]);
    const { events } = await runToEnd(adapter);
    expect(events.some((event) => event.type === 'approval')).toBe(false);
    expect(sdk.runs[0]?.decisions[0]?.result.behavior).toBe('deny');
    expect(works(events)[0]).toEqual({
      kind: 'refused',
      refusal: { access: 'run', reason: 'push', path: 'git push origin HEAD' },
    });
  });

  it('AC-11: reads the mode and the allow list again for every call', async () => {
    let permissions: AgentPermissions = { ...defaultPermissions, allowedCommands: [] };
    const { sdk, adapter } = setUp([
      { tool: 'Bash', input: { command: 'npm test' } },
      { tool: 'Bash', input: { command: 'npm test' } },
      { finish: 'Ran the tests twice.' },
    ]);
    const session = await watch(adapter, () => Promise.resolve(permissions));
    const [first] = await session.approvals();
    permissions = { ...defaultPermissions, commands: 'allowed_list', allowedCommands: ['npm test'] };
    await adapter.respond(session.id, first?.approvalId ?? '', 'allow');
    await session.ended();
    expect(session.events.filter((event) => event.type === 'approval')).toHaveLength(1);
    expect(sdk.runs[0]?.decisions.map((decision) => decision.result.behavior)).toEqual(['allow', 'allow']);
  });

  it('AC-8: an edit waits while Ask before everything is on, with the change, and is made once allowed', async () => {
    const { sdk, adapter } = setUp([
      { tool: 'Edit', input: { file_path: 'src/a.ts', old_string: 'a = 1', new_string: 'a = 2' } },
      { finish: 'Changed a.' },
    ]);
    const session = await watch(adapter, fixed({ ...defaultPermissions, edits: 'ask', allowedCommands: [] }));
    const [approval] = await session.approvals();
    expect(approval?.ask).toEqual({
      kind: 'edit',
      path: 'src/a.ts',
      creates: false,
      lines: [
        { kind: 'removed', number: 1, text: 'export const a = 1;' },
        { kind: 'added', number: 1, text: 'export const a = 2;' },
      ],
      moreLines: 0,
    });
    await adapter.respond(session.id, approval?.approvalId ?? '', 'allow');
    await session.ended();
    expect(sdk.runs[0]?.decisions[0]?.result.behavior).toBe('allow');
    expect(works(session.events)).toEqual([
      { kind: 'edit', file: 'src/a.ts' },
      { kind: 'finished', summary: 'Changed a.' },
    ]);
  });

  it('AC-10: calls asked together wait together, and each is answered on its own', async () => {
    const { sdk, adapter } = setUp([
      {
        together: [
          { tool: 'Bash', input: { command: 'npm test' } },
          { tool: 'Bash', input: { command: 'npm run lint' } },
        ],
      },
      { finish: 'Done.' },
    ]);
    const session = await watch(adapter);
    const [first, second] = await session.approvals(2);
    expect(sdk.runs[0]?.waiting).toBe(2);
    await adapter.respond(session.id, second?.approvalId ?? '', 'deny');
    await vi.waitFor(() => {
      expect(sdk.runs[0]?.waiting).toBe(1);
    });
    await adapter.respond(session.id, first?.approvalId ?? '', 'allow');
    await session.ended();
    expect(sdk.runs[0]?.decisions.map(({ result }) => result.behavior)).toEqual(['deny', 'allow']);
  });

  it('AC-10: calls asked together wait in the order asked, even when reading Settings for the first is slower', async () => {
    const { adapter } = setUp([
      {
        together: [
          { tool: 'Bash', input: { command: 'npm test' } },
          { tool: 'Bash', input: { command: 'npm run lint' } },
        ],
      },
      { finish: 'Done.' },
    ]);
    let reads = 0;
    const slowFirst = async (): Promise<AgentPermissions> => {
      reads += 1;
      if (reads === 1) await new Promise((resolve) => setTimeout(resolve, 50));
      return { ...defaultPermissions, allowedCommands: [] };
    };
    const session = await watch(adapter, slowFirst);
    const [first, second] = await session.approvals(2);
    expect([first?.ask, second?.ask].map((ask) => ask?.kind === 'command' && ask.command)).toEqual([
      'npm test',
      'npm run lint',
    ]);
    await adapter.stop(session.id);
  });

  it('AC-12: Stop denies a waiting call, then stops Claude', async () => {
    const { sdk, adapter } = setUp([{ tool: 'Bash', input: npmTest }, { finish: 'never' }]);
    const session = await watch(adapter);
    const [approval] = await session.approvals();
    await adapter.stop(session.id);
    await session.ended();

    expect(sdk.runs[0]?.decisions[0]?.result).toEqual({
      behavior: 'deny',
      message: 'The user stopped the session.',
      interrupt: true,
    });
    expect(session.events).toContainEqual({
      type: 'answered',
      sessionId: session.id,
      approvalId: approval?.approvalId,
      allowed: false,
    });
    expect(works(session.events)).toEqual([]);
    expect(await adapter.respond(session.id, approval?.approvalId ?? '', 'allow')).toBe(false);
  });

  it('a call Claude Code drops is answered as not allowed, and asks nothing more', async () => {
    const { sdk, adapter } = setUp([{ tool: 'Bash', input: npmTest }, { finish: 'Moved on.' }]);
    const session = await watch(adapter);
    const [approval] = await session.approvals();
    sdk.runs[0]?.cancelAsks();
    await session.ended();
    expect(sdk.runs[0]?.decisions[0]?.result.behavior).toBe('deny');
    expect(session.events).toContainEqual({
      type: 'answered',
      sessionId: session.id,
      approvalId: approval?.approvalId,
      allowed: false,
    });
    expect(await adapter.respond(session.id, approval?.approvalId ?? '', 'allow')).toBe(false);
  });

  it('answers false for a call that isn’t waiting: answered already, unknown, or in a session it never started', async () => {
    const { adapter } = setUp([{ tool: 'Bash', input: npmTest }, { finish: 'Done.' }]);
    const session = await watch(adapter);
    const [approval] = await session.approvals();
    expect(await adapter.respond(session.id, 'no-such-call', 'allow')).toBe(false);
    expect(await adapter.respond('never-started', approval?.approvalId ?? '', 'allow')).toBe(false);
    expect(await adapter.respond(session.id, approval?.approvalId ?? '', 'allow')).toBe(true);
    expect(await adapter.respond(session.id, approval?.approvalId ?? '', 'deny')).toBe(false);
    await session.ended();
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

  it('013 AC-12: a message sent while Claude works reaches it as the next thing to read, with an id of its own', async () => {
    const { sdk, adapter } = setUp([
      { tool: 'Read', input: { file_path: 'src/a.ts' } },
      { waitForMessage: true },
      { tool: 'Edit', input: { file_path: join(worktree, 'src', 'a.ts'), old_string: '1', new_string: '2' } },
      { finish: 'Used the existing hook.' },
    ]);
    const { id, events, ended } = await watch(adapter);
    await vi.waitFor(() => {
      expect(works(events)).toContainEqual({ kind: 'explore', file: 'src/a.ts' });
    });

    expect(await adapter.sendMessage(id, 'Use the existing useSelection hook instead')).toBe(true);
    await ended();

    expect(sdk.runs[0]?.messages[1]).toEqual({
      text: 'Use the existing useSelection hook instead',
      uuid: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      priority: 'next',
    });
    expect(works(events).filter((work) => work.kind === 'finished')).toEqual([
      { kind: 'finished', summary: 'Used the existing hook.' },
    ]);
  });

  it('013 AC-12: Claude finishes only once it has answered a message that came too late for its turn', async () => {
    const { adapter } = setUp([
      { tool: 'Read', input: { file_path: 'src/a.ts' } },
      { waitForMessage: true },
      { finish: 'The first part.' },
      { tool: 'Edit', input: { file_path: join(worktree, 'src', 'a.ts'), old_string: '1', new_string: '2' } },
      { finish: 'And the part you asked for.' },
    ]);
    const { id, events, ended } = await watch(adapter);
    await vi.waitFor(() => {
      expect(works(events)).toHaveLength(1);
    });
    await adapter.sendMessage(id, 'Also change a to 2');
    await ended();
    expect(works(events)).toEqual([
      { kind: 'explore', file: 'src/a.ts' },
      { kind: 'edit', file: 'src/a.ts' },
      { kind: 'finished', summary: 'And the part you asked for.' },
    ]);
  });

  it('013: a message answers false once Claude’s input is over, or in a session it never started', async () => {
    const { adapter } = setUp([{ finish: 'Done.' }]);
    const { id } = await runToEnd(adapter);
    expect(await adapter.sendMessage(id, 'More')).toBe(false);
    expect(await adapter.sendMessage('never-started', 'More')).toBe(false);
  });

  it('013 AC-17: Stop ends Claude Code at once while it holds a message it hasn’t read, so it never acts on it', async () => {
    const { sdk, adapter } = setUp(
      [{ tool: 'Read', input: { file_path: 'src/a.ts' } }, { waitForMessage: true }, { hang: true }],
      { stopGraceMs: 60_000 },
    );
    sdk.ignoreInterrupt = true;
    const { id, events, ended } = await watch(adapter);
    await vi.waitFor(() => {
      expect(works(events)).toHaveLength(1);
    });
    await adapter.sendMessage(id, 'Use the hook');
    await vi.waitFor(() => {
      expect(sdk.runs[0]?.messages).toHaveLength(2);
    });

    const started = Date.now();
    await adapter.stop(id);
    await ended();
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(sdk.runs[0]).toMatchObject({ interrupts: 1, closes: 1 });
  });

  it('013 AC-17: once you press Stop, every call Claude asks for is refused', async () => {
    let letGo: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    const { sdk, adapter } = setUp([
      { tool: 'Read', input: { file_path: 'src/a.ts' } },
      { gate },
      { tool: 'Edit', input: { file_path: join(worktree, 'src', 'a.ts'), old_string: '1', new_string: '2' } },
      { finish: 'Done.' },
    ]);
    sdk.ignoreInterrupt = true;
    const { id, events, ended } = await watch(adapter);
    await vi.waitFor(() => {
      expect(works(events)).toHaveLength(1);
    });

    const stopping = adapter.stop(id);
    letGo();
    await stopping;
    await ended();

    expect(sdk.runs[0]?.decisions.map((decision) => [decision.tool, decision.result.behavior])).toEqual([
      ['Read', 'allow'],
      ['Edit', 'deny'],
    ]);
    expect(works(events).some((work) => work.kind === 'edit')).toBe(false);
  });

  it('013 AC-11, AC-13: resumes Claude Code’s own session with the follow-up, and every other option as at the start', async () => {
    const { sdk, adapter } = setUp([{ finish: 'Used the hook.' }]);
    await runToEnd(adapter);
    const conversation = 'b2c7e0f4-0000-4000-8000-000000000001';
    const followUp = { message: 'Use the existing useSelection hook instead', context: [] };
    const id = await adapter.startSession(followUp, worktree, editFreely, 'Work in the worktree.', {
      resume: conversation,
    });
    const events: AgentEvent[] = [];
    await new Promise<void>((resolve) => {
      adapter.onEvent(id, (event) => {
        events.push(event);
        if (event.type === 'ended') resolve();
      });
    });

    const [first, resumed] = sdk.runs;
    expect(resumed?.options.resume).toBe(conversation);
    expect(first?.options.resume).toBeUndefined();
    const { resume: _resume, canUseTool: _ask, stderr: _err, ...same } = resumed?.options ?? {};
    const { canUseTool: _ask2, stderr: _err2, ...atStart } = first?.options ?? {};
    expect(same).toEqual(atStart);
    expect(resumed?.prompts).toEqual(['Use the existing useSelection hook instead']);
    expect(works(events)).toEqual([{ kind: 'finished', summary: 'Used the hook.' }]);
  });

  it('starts Claude Code with the model and effort the composer picked, and with its own default otherwise', async () => {
    const { sdk, adapter } = setUp([{ finish: 'Done.' }]);
    await runToEnd(adapter);
    const id = await adapter.startSession(brief, worktree, editFreely, 'x', { model: 'opus', effort: 'high' });
    await new Promise<void>((resolve) => {
      adapter.onEvent(id, (event) => {
        if (event.type === 'ended') resolve();
      });
    });

    const [plain, picked] = sdk.runs;
    expect(plain?.options).not.toHaveProperty('model');
    expect(plain?.options).not.toHaveProperty('effort');
    expect(picked?.options).toMatchObject({ model: 'opus', effort: 'high' });
    expect(picked?.options.resume).toBeUndefined();
  });

  it('013 AC-16: a resume that ends before Claude Code starts is Claude Code missing the conversation', async () => {
    const { sdk, adapter } = setUp([{ finish: 'Never.' }]);
    sdk.onResume = 'no_conversation';
    const id = await adapter.startSession({ message: 'More', context: [] }, worktree, editFreely, 'x', {
      resume: 'b2c7e0f4-0000-4000-8000-000000000001',
    });
    const events: AgentEvent[] = [];
    await new Promise<void>((resolve) => {
      adapter.onEvent(id, (event) => {
        events.push(event);
        if (event.type === 'ended') resolve();
      });
    });
    expect(events).toEqual([
      { type: 'problem', sessionId: id, kind: 'resume', code: 'no_conversation' },
      { type: 'ended', sessionId: id },
    ]);
  });

  it('013 AC-16: a resume that starts a new conversation is stopped at once, before Claude does anything', async () => {
    const { sdk, adapter } = setUp([
      { tool: 'Edit', input: { file_path: join(worktree, 'src', 'a.ts'), old_string: '1', new_string: '2' } },
      { finish: 'Done without its history.' },
    ]);
    sdk.onResume = 'starts_afresh';
    const id = await adapter.startSession({ message: 'More', context: [] }, worktree, editFreely, 'x', {
      resume: 'b2c7e0f4-0000-4000-8000-000000000001',
    });
    const events: AgentEvent[] = [];
    await new Promise<void>((resolve) => {
      adapter.onEvent(id, (event) => {
        events.push(event);
        if (event.type === 'ended') resolve();
      });
    });
    expect(events.filter((event) => event.type !== 'ended')).toEqual([
      { type: 'problem', sessionId: id, kind: 'resume', code: 'new_conversation' },
    ]);
    expect(JSON.stringify(events)).not.toContain(freshSessionId);
    expect(sdk.runs[0]?.decisions).toEqual([]);
  });

  it('013 AC-2: says files may have changed after an edit and after a command, so the Changes tab can look', async () => {
    const { adapter } = setUp([
      { tool: 'Read', input: { file_path: 'src/a.ts' } },
      { tool: 'Edit', input: { file_path: join(worktree, 'src', 'a.ts'), old_string: '1', new_string: '2' } },
      { finish: 'Done.' },
    ]);
    const { id, events } = await runToEnd(adapter);
    const kinds = events.map((event) => (event.type === 'work' ? event.work.kind : event.type));
    expect(kinds).toEqual(['started', 'explore', 'edit', 'files_changed', 'finished', 'ended']);
    expect(events).toContainEqual({ type: 'files_changed', sessionId: id });
  });

  it('stopping a session that has ended, or one it never started, is fine', async () => {
    const { adapter } = setUp([{ finish: 'Done.' }]);
    const { id } = await runToEnd(adapter);
    await expect(adapter.stop(id)).resolves.toBeUndefined();
    await expect(adapter.stop('never-started')).resolves.toBeUndefined();
  });
});

describe('writing text with no tools (spec 014)', () => {
  const instructions = "You write a pull request's title and description.";
  const prompt = 'The ticket, PROJ-1423, as Claude got it\n\nAdd bulk archive';

  it('AC-1 (spec 042): the quick read uses the model and effort the composer picked, and Claude Code’s own without them', async () => {
    const picked = setUp([{ finish: '{}' }]);
    await picked.adapter.write(prompt, instructions, { model: 'claude-opus-5-5', effort: 'high' });
    expect(picked.sdk.runs[0]?.options).toMatchObject({ model: 'claude-opus-5-5', effort: 'high' });
    const unpicked = setUp([{ finish: '{}' }]);
    await unpicked.adapter.write(prompt, instructions);
    expect(unpicked.sdk.runs[0]?.options).not.toHaveProperty('model');
    expect(unpicked.sdk.runs[0]?.options).not.toHaveProperty('effort');
  });

  it('AC-15: answers Claude’s text, from a query that can read, edit and run nothing and is never saved', async () => {
    const { sdk, adapter } = setUp([{ finish: 'PROJ-1423: Add bulk archive\n\nWhat changed.' }]);
    expect(await adapter.write(prompt, instructions)).toEqual({
      ok: true,
      text: 'PROJ-1423: Add bulk archive\n\nWhat changed.',
    });
    const [run] = sdk.runs;
    expect(run?.prompts).toEqual([prompt]);
    expect(run?.options).toMatchObject({
      pathToClaudeCodeExecutable: '/opt/claude/claude',
      env: { ...env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      tools: [],
      maxTurns: 1,
      persistSession: false,
      settingSources: [],
      settings: { disableAllHooks: true },
      strictMcpConfig: true,
      mcpServers: {},
      systemPrompt: instructions,
    });
    expect(run?.options.sandbox).toBeUndefined();
    expect(run?.options.resume).toBeUndefined();
    // Its folder is an empty one of its own, gone once Claude has answered: there's nothing there to read.
    const cwd = run?.options.cwd ?? '';
    expect(cwd).not.toBe(worktree);
    await expect(realpath(cwd)).rejects.toThrow();
    const ask = await run?.options.canUseTool?.('Read', { file_path: join(worktree, 'src', 'a.ts') }, {
      signal: new AbortController().signal,
      toolUseID: 'toolu_1',
    } as Parameters<NonNullable<NonNullable<typeof run>['options']['canUseTool']>>[2]);
    expect(ask).toMatchObject({ behavior: 'deny' });
  });

  it('AC-6: says when the login or a limit stops Claude, or Claude Code fails', async () => {
    const login = setUp([{ message: { type: 'assistant', error: 'authentication_failed', message: { content: [] } } }]);
    expect(await login.adapter.write(prompt, instructions)).toEqual({ ok: false, problem: 'login' });
    const limit = setUp([
      { message: { type: 'result', subtype: 'error_during_execution', is_error: true, api_error_status: 429 } },
    ]);
    expect(await limit.adapter.write(prompt, instructions)).toEqual({ ok: false, problem: 'limit' });
    const crash = setUp([{ crash: 'Claude Code exited' }]);
    expect(await crash.adapter.write(prompt, instructions)).toEqual({ ok: false, problem: 'other' });
  });

  it('AC-6: gives up when Claude doesn’t answer in time, and ends Claude Code', async () => {
    const { sdk, adapter } = setUp([{ hang: true }]);
    expect(await adapter.write(prompt, instructions, { timeoutMs: 50 })).toEqual({ ok: false, problem: 'timeout' });
    expect(sdk.runs[0]?.interrupts).toBe(1);
    expect(sdk.runs[0]?.closes).toBe(1);
  });
});

describe('listing models', () => {
  const opus = {
    value: 'opus',
    displayName: 'Opus',
    description: 'Most capable',
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] as ('low' | 'medium' | 'high' | 'xhigh' | 'max')[],
  };
  const haiku = { value: 'haiku', displayName: 'Haiku', description: 'Fastest' };

  it('lists what Claude Code offers with each model’s effort levels, from a Claude Code that is sent nothing', async () => {
    const { sdk, adapter } = setUp([]);
    sdk.models = [opus, haiku, { value: '--not-a-model', displayName: 'Odd', description: '' }];

    expect(await adapter.models()).toEqual({
      state: 'ready',
      models: [
        { value: 'opus', displayName: 'Opus', description: 'Most capable', efforts: opus.supportedEffortLevels },
        { value: 'haiku', displayName: 'Haiku', description: 'Fastest', efforts: [] },
      ],
    });
    const [run] = sdk.runs;
    expect(run?.prompts).toEqual([]);
    expect(run?.closes).toBe(1);
    expect(run?.options).toMatchObject({
      pathToClaudeCodeExecutable: '/opt/claude/claude',
      env: { ...env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      tools: [],
      persistSession: false,
      settingSources: [],
      settings: { disableAllHooks: true },
      strictMcpConfig: true,
      mcpServers: {},
    });
    // An empty folder of its own, gone once Claude Code has answered.
    await expect(realpath(run?.options.cwd ?? '')).rejects.toThrow();
  });

  it('keeps the list for 10 minutes, and shares a read under way', async () => {
    let at = 0;
    const { sdk, adapter } = setUp([], { now: () => at });
    sdk.models = [opus];

    const [first, second] = await Promise.all([adapter.models(), adapter.models()]);
    expect(second).toEqual(first);
    at = 9 * 60_000;
    await adapter.models();
    expect(sdk.runs).toHaveLength(1);
    at = 10 * 60_000;
    sdk.models = [haiku];
    expect(await adapter.models()).toMatchObject({ models: [{ value: 'haiku' }] });
    expect(sdk.runs).toHaveLength(2);
  });

  it('is unavailable when Claude Code fails or doesn’t answer in time, and asks again next time', async () => {
    const { sdk, adapter } = setUp([], { modelsTimeoutMs: 20 });
    sdk.models = 'fails';
    expect(await adapter.models()).toEqual({ state: 'unavailable' });
    sdk.models = 'hangs';
    expect(await adapter.models()).toEqual({ state: 'unavailable' });
    expect(sdk.runs[1]?.closes).toBe(1);
    sdk.models = [haiku];
    expect(await adapter.models()).toMatchObject({ state: 'ready' });
    expect(sdk.runs).toHaveLength(3);
  });
});

describe('Orynx’s ticket tools in a session (spec 037)', () => {
  const inSession = { kind: 'session', sessionId: 's-1', title: 'Fix the date test' } as const;

  async function tickets() {
    const service = createOrynxTicketService({
      store: createOrynxTicketStore(),
      sessions: createMemorySessionStore(),
      events: createEventBus(),
    });
    await service.create(CreateOrynxTicketSchema.parse({ title: 'Fix the date test', status: 'in_progress' }), {
      kind: 'you',
    });
    return service;
  }

  async function runWithTools(
    script: readonly FakeTurn[],
    tools: Parameters<AgentAdapter['startSession']>[4],
    permissions = editFreely,
  ) {
    const { sdk, adapter } = setUp(script);
    const id = await adapter.startSession(brief, worktree, permissions, 'x', tools);
    const events: AgentEvent[] = [];
    await new Promise<void>((resolve) => {
      adapter.onEvent(id, (event) => {
        events.push(event);
        if (event.type === 'ended') resolve();
      });
    });
    return { sdk, events };
  }

  it('AC-28, AC-29: Claude makes and moves tickets through Orynx’s own MCP server, and each call is a step', async () => {
    const service = await tickets();
    const { sdk, events } = await runWithTools(
      [
        { tool: 'mcp__orynx__create_ticket', input: { title: 'Flaky date test', type: 'Bug' } },
        { tool: 'mcp__orynx__update_ticket', input: { key: 'ORX-1', status: 'in_review' } },
        { finish: 'Filed ORX-2.' },
      ],
      { tools: ticketTools(service, inSession) },
    );

    expect(Object.keys(sdk.runs[0]?.options.mcpServers ?? {})).toEqual(['orynx']);
    expect(sdk.runs[0]?.decisions).toEqual([
      {
        tool: 'mcp__orynx__create_ticket',
        result: { behavior: 'allow', updatedInput: { title: 'Flaky date test', type: 'Bug' } },
      },
      {
        tool: 'mcp__orynx__update_ticket',
        result: { behavior: 'allow', updatedInput: { key: 'ORX-1', status: 'in_review' } },
      },
    ]);
    expect(await service.get('ORX-2')).toMatchObject({ title: 'Flaky date test', type: 'Bug', createdBy: inSession });
    expect(await service.get('ORX-1')).toMatchObject({ status: 'in_review' });
    expect(works(events).filter((work) => work.kind === 'ticket')).toEqual([
      { kind: 'ticket', done: { action: 'created', key: 'ORX-2', title: 'Flaky date test' } },
      {
        kind: 'ticket',
        done: { action: 'updated', key: 'ORX-1', title: 'Fix the date test', fields: ['status'], status: 'in_review' },
      },
    ]);
  });

  it('AC-31: an Ask session may read tickets and change none, whatever tools it was given', async () => {
    const service = await tickets();
    const { sdk, events } = await runWithTools(
      [
        { tool: 'mcp__orynx__get_ticket', input: { key: 'ORX-1' } },
        { tool: 'mcp__orynx__update_ticket', input: { key: 'ORX-1', status: 'done' } },
        { finish: 'Read it.' },
      ],
      { tools: ticketTools(service, inSession) },
      fixed({ ...defaultPermissions, allowedCommands: [], readOnly: true }),
    );

    expect(sdk.runs[0]?.decisions.map((decision) => decision.result.behavior)).toEqual(['allow', 'deny']);
    expect(await service.get('ORX-1')).toMatchObject({ status: 'in_progress', version: 1 });
    expect(works(events).filter((work) => work.kind === 'ticket')).toEqual([
      { kind: 'ticket', done: { action: 'read', key: 'ORX-1', title: 'Fix the date test' } },
    ]);
  });

  it('a call the tool turns down is no step: Claude hears why', async () => {
    const service = await tickets();
    const { events } = await runWithTools(
      [{ tool: 'mcp__orynx__update_ticket', input: { key: 'ORX-9', status: 'done' } }, { finish: 'No such ticket.' }],
      { tools: ticketTools(service, inSession) },
    );
    expect(works(events).filter((work) => work.kind === 'ticket')).toEqual([]);
  });

  it('AC-30: deleting a ticket waits for you; Deny keeps it, and Allow once deletes it', async () => {
    const service = await tickets();
    await service.create(CreateOrynxTicketSchema.parse({ title: 'Flaky date test' }), { kind: 'you' });
    const { sdk, adapter } = setUp([
      { tool: 'mcp__orynx__delete_ticket', input: { key: 'ORX-2' } },
      { tool: 'mcp__orynx__delete_ticket', input: { key: 'ORX-2' } },
      { finish: 'Deleted it.' },
    ]);
    const id = await adapter.startSession(brief, worktree, editFreely, 'x', { tools: ticketTools(service, inSession) });
    const events: AgentEvent[] = [];
    adapter.onEvent(id, (event) => events.push(event));
    const asked = () => events.flatMap((event) => (event.type === 'approval' ? [event] : []));

    await vi.waitFor(() => {
      expect(asked()).toHaveLength(1);
    });
    expect(asked()[0]?.ask).toEqual({ kind: 'ticket', key: 'ORX-2', title: 'Flaky date test' });
    await adapter.respond(id, asked()[0]?.approvalId ?? '', 'deny');
    await vi.waitFor(() => {
      expect(asked()).toHaveLength(2);
    });
    expect(await service.get('ORX-2')).not.toBeNull();
    await adapter.respond(id, asked()[1]?.approvalId ?? '', 'allow');
    await vi.waitFor(() => {
      expect(events.at(-1)?.type).toBe('ended');
    });

    expect(await service.get('ORX-2')).toBeNull();
    expect(sdk.runs[0]?.decisions.map((decision) => decision.result)).toEqual([
      { behavior: 'deny', message: deniedMessage },
      { behavior: 'allow', updatedInput: { key: 'ORX-2' } },
    ]);
    expect(works(events).filter((work) => work.kind === 'denied' || work.kind === 'ticket')).toEqual([
      { kind: 'denied', about: 'ticket', text: 'ORX-2' },
      { kind: 'ticket', done: { action: 'deleted', key: 'ORX-2', title: 'Flaky date test' } },
    ]);
  });

  it('with no tools, Claude Code gets no MCP server at all', async () => {
    const { sdk } = await runWithTools([{ finish: 'Done.' }], { tools: [] });
    expect(sdk.runs[0]?.options.mcpServers).toEqual({});
  });
});
