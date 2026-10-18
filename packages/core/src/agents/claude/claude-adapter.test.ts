import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SandboxSettings } from '@anthropic-ai/claude-agent-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const editFreely = fixed({ mode: 'edit_freely_ask_commands', allowedCommands: [] });
const env = { HOME: '/Users/you', PATH: '/usr/bin' };

function sandboxFor(path: string): SandboxSettings {
  return sandboxSettings({ platform: 'darwin', worktree: path, devhubHome: root, home: root, temporary: tmpdir() });
}

interface SetUpOptions {
  stopGraceMs?: number;
  sandbox?: ((worktree: string) => SandboxSettings) | null;
}

function setUp(script: readonly FakeTurn[], { stopGraceMs = 5_000, sandbox = sandboxFor }: SetUpOptions = {}) {
  const sdk = fakeClaudeSdk(script);
  const adapter = createClaudeAdapter({
    query: sdk.query,
    program: '/opt/claude/claude',
    env,
    home: root,
    stopGraceMs,
    sandbox,
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
      { type: 'work', sessionId: session.id, work: { kind: 'command', command: 'npm test -- content-list' } },
    ]);
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
    const session = await watch(adapter, fixed({ mode: 'edit_and_run_allowed', allowedCommands: ['npm test'] }));
    const [approval] = await session.approvals();
    expect(approval?.ask).toMatchObject({ alwaysAsk: null, alwaysAllow: 'npm run lint' });
    await adapter.respond(session.id, approval?.approvalId ?? '', 'always');
    await session.ended();
    expect(sdk.runs[0]?.decisions[0]?.result.behavior).toBe('allow');
  });

  it('AC-4: runs a command on the list without asking, and shows it', async () => {
    const { sdk, adapter } = setUp([{ tool: 'Bash', input: npmTest }, { finish: 'Ran the tests.' }]);
    const { events } = await runToEnd(adapter, fixed({ mode: 'edit_and_run_allowed', allowedCommands: ['npm test'] }));
    expect(events.some((event) => event.type === 'approval')).toBe(false);
    expect(sdk.runs[0]?.decisions[0]?.result).toEqual({ behavior: 'allow', updatedInput: npmTest });
    // Shown once: when Orynx allowed it, not again when its result comes.
    expect(works(events)).toEqual([
      { kind: 'command', command: 'npm test -- content-list' },
      { kind: 'finished', summary: 'Ran the tests.' },
    ]);
  });

  it('AC-6: an always-ask command you allow runs once outside the sandbox', async () => {
    const curl = { command: 'curl -fsS https://registry.npmjs.org/react' };
    const { sdk, adapter } = setUp([{ tool: 'Bash', input: curl }, { finish: 'Fetched.' }]);
    const session = await watch(adapter, fixed({ mode: 'edit_and_run_allowed', allowedCommands: ['curl'] }));
    const [approval] = await session.approvals();
    expect(approval?.ask).toMatchObject({ alwaysAsk: 'network', alwaysAllow: null });
    await adapter.respond(session.id, approval?.approvalId ?? '', 'allow');
    await session.ended();
    expect(sdk.runs[0]?.decisions[0]?.result).toEqual({
      behavior: 'allow',
      updatedInput: { ...curl, dangerouslyDisableSandbox: true },
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
    let permissions: AgentPermissions = { mode: 'edit_freely_ask_commands', allowedCommands: [] };
    const { sdk, adapter } = setUp([
      { tool: 'Bash', input: { command: 'npm test' } },
      { tool: 'Bash', input: { command: 'npm test' } },
      { finish: 'Ran the tests twice.' },
    ]);
    const session = await watch(adapter, () => Promise.resolve(permissions));
    const [first] = await session.approvals();
    permissions = { mode: 'edit_and_run_allowed', allowedCommands: ['npm test'] };
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
    const session = await watch(adapter, fixed({ mode: 'ask_everything', allowedCommands: [] }));
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
      return { mode: 'edit_freely_ask_commands', allowedCommands: [] };
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
