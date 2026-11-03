import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultPreferences } from '@devhub/contracts';
import { useFakeCodex, type CodexPeer, type FakeCodex } from '../../test/fake-codex.ts';
import type { AgentEvent, AgentPermissions, AgentRunOptions } from '../agent-adapter.ts';
import { createCodexAdapter, type CodexAdapterOptions } from './codex-adapter.ts';

const fakeCodex = useFakeCodex();
/** The shell's own variables a test passes in; tests never read process.env (CLAUDE.md rule 9). */
const env = { PATH: '/usr/bin:/bin', HOME: '/Users/you' };
const brief = { message: 'Add a bulk archive button', context: [] };

async function setup(options: Partial<CodexAdapterOptions> = {}) {
  const fake = await fakeCodex();
  const worktree = await realpath(await mkdtemp(join(tmpdir(), 'orynx-codex-worktree-')));
  const adapter = createCodexAdapter({
    program: fake.program,
    env,
    home: '/Users/you',
    devhubHome: '/Users/you/.devhub',
    temporary: tmpdir(),
    platform: 'darwin',
    runsCommands: true,
    stopGraceMs: 300,
    ...options,
  });
  return { fake, adapter, worktree };
}

function permissionsFrom(overrides: Partial<AgentPermissions> = {}): () => Promise<AgentPermissions> {
  return () => Promise.resolve({ ...defaultPreferences.permissions, allowedCommands: [], ...overrides });
}

/** Plays Codex as a session starts: `initialize`, `config/read`, then the thread and its first turn. */
async function answerStart(
  fake: FakeCodex,
  { mcpServers = {}, threadId = 'thread-1' }: { mcpServers?: Record<string, unknown>; threadId?: string } = {},
) {
  const codex = await fake.next();
  codex.reply((await codex.expectRequest('initialize')).id, {});
  expect(await codex.read()).toEqual({ method: 'initialized' });
  const config = await codex.expectRequest('config/read');
  codex.reply(config.id, { config: { model: 'gpt-5.5-codex', mcp_servers: mcpServers }, origins: {} });
  const thread = await codex.expectRequest('thread/start');
  codex.reply(thread.id, { thread: { id: threadId }, model: 'gpt-5.5-codex', modelProvider: 'openai', cwd: '/' });
  const turn = await codex.expectRequest('turn/start');
  codex.reply(turn.id, { turn: { id: 'turn-1', status: 'inProgress', items: [] } });
  return { codex, thread: thread.params, turn: turn.params };
}

/** Every event of a session, as they come. */
function heard(adapter: ReturnType<typeof createCodexAdapter>, sessionId: string): AgentEvent[] {
  const events: AgentEvent[] = [];
  adapter.onEvent(sessionId, (event) => events.push(event));
  return events;
}

async function until(check: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function finishTurn(codex: CodexPeer, summary: string) {
  codex.notify('item/completed', {
    item: { type: 'agentMessage', id: 'm-1', text: summary },
    threadId: 'thread-1',
    turnId: 'turn-1',
  });
  codex.notify('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed', items: [] } });
}

describe.skipIf(process.platform === 'win32')('the Codex adapter (spec 052)', () => {
  it('AC-5: starts Codex in the worktree with its sandbox, the model, the instructions and the brief', async () => {
    const { fake, adapter, worktree } = await setup();
    const run: AgentRunOptions = { model: 'gpt-5.5-codex', effort: 'high' };
    const id = await adapter.startSession(brief, worktree, permissionsFrom(), 'Work on PROJ-1423.', run);
    const events = heard(adapter, id);
    const { thread, turn } = await answerStart(fake);

    const [appServer] = await fake.runs();
    expect(appServer?.cwd).toBe(worktree);
    expect(appServer?.args[0]).toBe('app-server');
    expect(appServer?.args.join(' ')).toContain(`"${worktree}"="write"`);
    expect(thread).toMatchObject({
      cwd: worktree,
      model: 'gpt-5.5-codex',
      developerInstructions: 'Work on PROJ-1423.',
      approvalPolicy: 'untrusted',
      approvalsReviewer: 'user',
    });
    expect(turn).toMatchObject({
      threadId: 'thread-1',
      input: [{ type: 'text', text: 'Add a bulk archive button' }],
      effort: 'high',
    });
    await until(() => events.length > 0);
    expect(events[0]).toEqual({
      type: 'started',
      sessionId: id,
      agentSessionId: 'thread-1',
      loaded: { tools: 0, mcpServers: 0, plugins: 0 },
    });
  });

  it("AC-16: turns off every MCP server Codex's own config names, so it gets none", async () => {
    const { fake, adapter, worktree } = await setup();
    await adapter.startSession(brief, worktree, permissionsFrom(), '');
    const { thread } = await answerStart(fake, { mcpServers: { github: { command: 'gh-mcp' }, linear: {} } });

    expect(thread).toMatchObject({
      config: { 'mcp_servers.github.enabled': false, 'mcp_servers.linear.enabled': false },
    });
  });

  it("AC-7: gives Codex's plan as a step, then the summary when its turn ends, and ends Codex", async () => {
    const { fake, adapter, worktree } = await setup();
    const id = await adapter.startSession(brief, worktree, permissionsFrom(), '');
    const events = heard(adapter, id);
    const { codex } = await answerStart(fake);
    codex.notify('turn/plan/updated', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      plan: [{ step: 'Add the button', status: 'inProgress' }],
    });
    finishTurn(codex, 'Added the button.');

    await codex.closed;
    await until(() => events.at(-1)?.type === 'ended');
    expect(events.slice(1)).toEqual([
      { type: 'work', sessionId: id, work: { kind: 'plan', items: ['Add the button'], statuses: ['in_progress'] } },
      { type: 'usage', sessionId: id, turns: 1, costUsd: null },
      { type: 'work', sessionId: id, work: { kind: 'finished', summary: 'Added the button.' } },
      { type: 'ended', sessionId: id },
    ]);
  });

  it('keeps the events that come before anyone listens, for the first handler', async () => {
    const { fake, adapter, worktree } = await setup();
    const id = await adapter.startSession(brief, worktree, permissionsFrom(), '');
    const { codex } = await answerStart(fake);
    finishTurn(codex, 'Done.');
    await codex.closed;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const events = heard(adapter, id);
    expect(events.map((event) => event.type)).toEqual(['started', 'usage', 'work', 'ended']);
  });

  it('says commands can not run when there is no sandbox on this computer (spec 012, Q2b)', async () => {
    const { fake, adapter, worktree } = await setup({ runsCommands: false });
    const id = await adapter.startSession(brief, worktree, permissionsFrom(), '');
    const events = heard(adapter, id);
    await answerStart(fake);

    await until(() => events.length >= 2);
    expect(events[1]).toEqual({ type: 'work', sessionId: id, work: { kind: 'no_commands' } });
    expect(adapter.runsCommands).toBe(false);
  });

  it('AC-20: Stop interrupts the turn, and Codex has ended within the grace, with no problem', async () => {
    const { fake, adapter, worktree } = await setup();
    const id = await adapter.startSession(brief, worktree, permissionsFrom(), '');
    const events = heard(adapter, id);
    const { codex } = await answerStart(fake);

    const stopping = adapter.stop(id);
    const interrupt = await codex.expectRequest('turn/interrupt');
    expect(interrupt.params).toEqual({ threadId: 'thread-1', turnId: 'turn-1' });
    codex.reply(interrupt.id, {});
    codex.notify('turn/completed', { threadId: 'thread-1', turn: { id: 'turn-1', status: 'interrupted', items: [] } });
    await stopping;

    await codex.closed;
    expect(events.map((event) => event.type)).toEqual(['started', 'usage', 'ended']);
  });

  it('AC-20: a Codex that never answers Stop is ended anyway', async () => {
    const { fake, adapter, worktree } = await setup();
    await fake.ignoresStop();
    const id = await adapter.startSession(brief, worktree, permissionsFrom(), '');
    const events = heard(adapter, id);
    const { codex } = await answerStart(fake);

    const startedAt = Date.now();
    await adapter.stop(id);

    await codex.closed;
    expect(Date.now() - startedAt).toBeLessThan(3000);
    expect(events.at(-1)).toEqual({ type: 'ended', sessionId: id });
  });

  it("AC-21: a failed turn says Codex's problem, then ends", async () => {
    const { fake, adapter, worktree } = await setup();
    const id = await adapter.startSession(brief, worktree, permissionsFrom(), '');
    const events = heard(adapter, id);
    const { codex } = await answerStart(fake);
    codex.notify('turn/completed', {
      threadId: 'thread-1',
      turn: { id: 'turn-1', status: 'failed', items: [], error: { message: 'no', codexErrorInfo: 'unauthorized' } },
    });

    await until(() => events.at(-1)?.type === 'ended');
    expect(events.slice(1)).toEqual([
      { type: 'usage', sessionId: id, turns: 1, costUsd: null },
      { type: 'problem', sessionId: id, kind: 'login', code: 'unauthorized' },
      { type: 'ended', sessionId: id },
    ]);
  });

  it('a Codex that dies says only that it ended, never what it printed', async () => {
    const { fake, adapter, worktree } = await setup();
    const id = await adapter.startSession(brief, worktree, permissionsFrom(), '');
    const events = heard(adapter, id);
    const { codex } = await answerStart(fake);
    codex.exit(1);

    await until(() => events.at(-1)?.type === 'ended');
    expect(events.slice(1)).toEqual([
      { type: 'problem', sessionId: id, kind: 'other', code: 'exited' },
      { type: 'ended', sessionId: id },
    ]);
  });

  it('a Codex that is missing, or fails to start a thread, is a problem the session can show', async () => {
    const missing = await setup({ program: null });
    const id = await missing.adapter.startSession(brief, missing.worktree, permissionsFrom(), '');
    const events = heard(missing.adapter, id);
    await until(() => events.at(-1)?.type === 'ended');
    expect(events).toEqual([
      { type: 'problem', sessionId: id, kind: 'other', code: 'no_codex' },
      { type: 'ended', sessionId: id },
    ]);

    const { fake, adapter, worktree } = await setup();
    const second = await adapter.startSession(brief, worktree, permissionsFrom(), '');
    const said = heard(adapter, second);
    const codex = await fake.next();
    codex.reply((await codex.expectRequest('initialize')).id, {});
    await codex.read();
    codex.reply((await codex.expectRequest('config/read')).id, { config: {} });
    codex.fail((await codex.expectRequest('thread/start')).id, -32600, 'model not found');
    await until(() => said.at(-1)?.type === 'ended');
    expect(said).toEqual([
      { type: 'problem', sessionId: second, kind: 'other', code: 'thread_start' },
      { type: 'ended', sessionId: second },
    ]);
  });

  it("AC-4: lists Codex's models with the efforts Orynx knows, leaving out hidden ones, from a folder of its own", async () => {
    const { fake, adapter } = await setup();
    const listing = adapter.models();
    const codex = await fake.next();
    codex.reply((await codex.expectRequest('initialize')).id, {});
    await codex.read();
    const list = await codex.expectRequest('model/list');
    codex.reply(list.id, {
      data: [
        {
          id: 'gpt-5.5-codex',
          model: 'gpt-5.5-codex',
          displayName: 'GPT-5.5 Codex',
          description: 'Best for coding',
          hidden: false,
          isDefault: true,
          supportedReasoningEfforts: [
            { reasoningEffort: 'minimal', description: '' },
            { reasoningEffort: 'low', description: '' },
            { reasoningEffort: 'high', description: '' },
            { reasoningEffort: 'xhigh', description: '' },
          ],
          defaultReasoningEffort: 'medium',
        },
        { id: 'old', model: 'old', displayName: 'Old', description: '', hidden: true, supportedReasoningEfforts: [] },
        {
          id: 'bad',
          model: '--model',
          displayName: 'Bad',
          description: '',
          hidden: false,
          supportedReasoningEfforts: [],
        },
      ],
      nextCursor: null,
    });

    expect(await listing).toEqual({
      state: 'ready',
      models: [
        {
          value: 'gpt-5.5-codex',
          displayName: 'GPT-5.5 Codex',
          description: 'Best for coding',
          efforts: ['low', 'high', 'xhigh'],
        },
      ],
    });
    const [appServer] = await fake.runs();
    expect(appServer?.cwd).toMatch(/orynx-codex-models-/);
    // Kept for a while: the picker asks again without starting Codex.
    expect(await adapter.models()).toMatchObject({ state: 'ready' });
    expect((await fake.runs()).filter((run) => run.args[0] === 'app-server')).toHaveLength(1);
  });

  it('AC-4: no models while Codex is missing or fails to say', async () => {
    expect(await (await setup({ program: null })).adapter.models()).toEqual({ state: 'unavailable' });
    const { fake, adapter } = await setup();
    const listing = adapter.models();
    const codex = await fake.next();
    codex.reply((await codex.expectRequest('initialize')).id, {});
    await codex.read();
    codex.fail((await codex.expectRequest('model/list')).id, -32600, 'restart Codex');
    expect(await listing).toEqual({ state: 'unavailable' });
  });
});
