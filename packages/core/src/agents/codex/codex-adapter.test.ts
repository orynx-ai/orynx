import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CreateOrynxTicketSchema, defaultPreferences } from '@devhub/contracts';
import { createEventBus } from '../../events/event-bus.ts';
import { createOrynxTicketService } from '../../orynx-tickets/ticket-service.ts';
import { createOrynxTicketStore } from '../../orynx-tickets/ticket-store.ts';
import { ticketTools } from '../../orynx-tickets/tools.ts';
import { createMemorySessionStore } from '../../sessions/session-store.ts';
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

/** Codex asks Orynx before a command, as `untrusted` makes it. */
function askToRun(codex: CodexPeer, command: string, fields: Record<string, unknown> = {}) {
  return codex.ask('item/commandExecution/requestApproval', {
    kind: 'command',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: fields['itemId'] ?? 'item-1',
    startedAtMs: 0,
    approvalId: null,
    command,
    cwd: '/',
    commandActions: [],
    reason: null,
    ...fields,
  });
}

describe.skipIf(process.platform === 'win32')("the Codex adapter's commands (spec 052)", () => {
  async function running(overrides: Partial<AgentPermissions> = {}, options: Partial<CodexAdapterOptions> = {}) {
    const { fake, adapter, worktree } = await setup(options);
    const id = await adapter.startSession(brief, worktree, permissionsFrom(overrides), '');
    const events = heard(adapter, id);
    const { codex } = await answerStart(fake);
    return { adapter, id, events, codex, worktree };
  }

  it('AC-8: Commands on Ask first waits for you, and Allow once runs it, in the sandbox', async () => {
    const { adapter, id, events, codex } = await running();
    const answer = askToRun(codex, 'npm test');
    await until(() => events.some((event) => event.type === 'approval'));
    const approval = events.find((event) => event.type === 'approval');
    expect(approval).toMatchObject({
      ask: { kind: 'command', command: 'npm test', description: null, alwaysAsk: null, alwaysAllow: null },
    });
    if (approval?.type !== 'approval') throw new Error('no approval');

    expect(await adapter.respond(id, approval.approvalId, 'allow')).toBe(true);
    expect((await answer).result).toEqual({ decision: 'accept' });
    expect(events.slice(-2)).toEqual([
      { type: 'answered', sessionId: id, approvalId: approval.approvalId, allowed: true },
      { type: 'work', sessionId: id, work: { kind: 'command', id: 'item-1', command: 'npm test' } },
    ]);
  });

  it('AC-8: with Allowed only, a command off the list offers Always allow, which runs it as Allow does', async () => {
    const { adapter, id, events, codex } = await running({ commands: 'allowed_list' });
    const answer = askToRun(codex, 'npm test');
    await until(() => events.some((event) => event.type === 'approval'));
    const approval = events.find((event) => event.type === 'approval');
    expect(approval).toMatchObject({ ask: { kind: 'command', alwaysAllow: 'npm test' } });
    if (approval?.type !== 'approval') throw new Error('no approval');
    await adapter.respond(id, approval.approvalId, 'always');
    expect((await answer).result).toEqual({ decision: 'accept' });
  });

  it('AC-8: Deny declines it, and says so as a step', async () => {
    const { adapter, id, events, codex } = await running();
    const answer = askToRun(codex, 'npm test');
    await until(() => events.some((event) => event.type === 'approval'));
    const approval = events.find((event) => event.type === 'approval');
    if (approval?.type !== 'approval') throw new Error('no approval');
    await adapter.respond(id, approval.approvalId, 'deny');

    expect((await answer).result).toEqual({ decision: 'decline' });
    expect(events.at(-1)).toEqual({
      type: 'work',
      sessionId: id,
      work: { kind: 'denied', about: 'command', text: 'npm test' },
    });
  });

  it('AC-9: a command on the allow list runs without asking, inside the sandbox', async () => {
    const { events, codex, id } = await running({ commands: 'allowed_list', allowedCommands: ['npm test'] });
    expect((await askToRun(codex, 'npm test')).result).toEqual({ decision: 'accept' });
    expect(events.some((event) => event.type === 'approval')).toBe(false);
    expect(events.at(-1)).toEqual({
      type: 'work',
      sessionId: id,
      work: { kind: 'command', id: 'item-1', command: 'npm test' },
    });
  });

  it("AC-12: a push its row doesn't allow is refused with a step, even inside Codex's shell", async () => {
    const { events, codex, id } = await running({ commands: 'any' });
    expect((await askToRun(codex, "/bin/zsh -lc 'git push origin main'")).result).toEqual({ decision: 'decline' });
    expect(events.at(-1)).toMatchObject({
      sessionId: id,
      work: { kind: 'refused', refusal: { access: 'run', reason: 'push', path: 'git push origin main' } },
    });
  });

  it('AC-10: a network command asks with Allow once and Deny only, and Allow runs it in the sandbox', async () => {
    const { adapter, id, events, codex } = await running({ commands: 'any' });
    const answer = askToRun(codex, 'npm install');
    await until(() => events.some((event) => event.type === 'approval'));
    const approval = events.find((event) => event.type === 'approval');
    expect(approval).toMatchObject({ ask: { kind: 'command', alwaysAsk: 'network', alwaysAllow: null } });
    if (approval?.type !== 'approval') throw new Error('no approval');
    await adapter.respond(id, approval.approvalId, 'allow');
    expect((await answer).result).toEqual({ decision: 'accept' });
  });

  it('AC-11: Codex asking for more than its sandbox gives goes to the Commands outside the sandbox row', async () => {
    const { events, codex } = await running({ commands: 'any' });
    void askToRun(codex, 'npm test', { reason: 'Needs to write ~/.npm' });
    await until(() => events.some((event) => event.type === 'approval'));
    expect(events.find((event) => event.type === 'approval')).toMatchObject({
      ask: { kind: 'command', command: 'npm test', description: 'Needs to write ~/.npm', alwaysAsk: 'unsandboxed' },
    });
  });

  it("AC-7: a plain read inside the worktree runs as Claude's reads do, without asking, and shows as a read", async () => {
    const { events, codex, id, worktree } = await running();
    expect((await askToRun(codex, 'cat src/a.ts', { itemId: 'item-2' })).result).toEqual({ decision: 'accept' });
    expect(events.some((event) => event.type === 'approval')).toBe(false);
    codex.notify('item/completed', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      item: {
        type: 'commandExecution',
        id: 'item-2',
        command: 'cat src/a.ts',
        status: 'completed',
        exitCode: 0,
        commandActions: [{ type: 'read', command: 'cat src/a.ts', name: 'a.ts', path: `${worktree}/src/a.ts` }],
      },
    });
    await until(() => events.at(-1)?.type === 'work');
    expect(events.at(-1)).toEqual({ type: 'work', sessionId: id, work: { kind: 'explore', file: 'src/a.ts' } });
  });

  it('AC-8: a read outside the worktree asks, as any command does', async () => {
    const { events, codex } = await running();
    void askToRun(codex, 'cat /etc/hosts');
    await until(() => events.some((event) => event.type === 'approval'));
    expect(events.find((event) => event.type === 'approval')).toMatchObject({ ask: { command: 'cat /etc/hosts' } });
  });

  it('an Ask runs no command, and says so as a step; a plain read still runs', async () => {
    const { events, codex, id } = await running({ readOnly: true, commands: 'any' });
    expect((await askToRun(codex, 'npm test')).result).toEqual({ decision: 'decline' });
    expect(events.at(-1)).toMatchObject({
      sessionId: id,
      work: { kind: 'refused', refusal: { access: 'run', reason: 'ask_session', path: 'npm test' } },
    });
    expect((await askToRun(codex, 'ls src', { itemId: 'item-3' })).result).toEqual({ decision: 'accept' });
  });

  it('with no sandbox on this computer, no command runs, and nothing asks', async () => {
    const { events, codex } = await running({ commands: 'any' }, { runsCommands: false });
    expect((await askToRun(codex, 'npm test')).result).toEqual({ decision: 'decline' });
    expect((await askToRun(codex, 'cat src/a.ts')).result).toEqual({ decision: 'decline' });
    expect(events.some((event) => event.type === 'approval')).toBe(false);
  });

  it("declines writing to a command's input, which Orynx never asks you about", async () => {
    const { events, codex } = await running({ commands: 'any' });
    expect((await askToRun(codex, 'y', { kind: 'writeStdin' })).result).toEqual({ decision: 'decline' });
    expect(events.some((event) => event.type === 'approval')).toBe(false);
  });

  it('Stop declines a command that waits for you', async () => {
    const { adapter, id, events, codex } = await running();
    const answer = askToRun(codex, 'npm test');
    await until(() => events.some((event) => event.type === 'approval'));
    const stopping = adapter.stop(id);

    expect((await answer).result).toEqual({ decision: 'decline' });
    codex.reply((await codex.expectRequest('turn/interrupt')).id, {});
    await stopping;
    expect(events).toContainEqual(expect.objectContaining({ type: 'answered', allowed: false }));
  });
});

/** Codex starts an edit, with its diff, then asks Orynx before it goes in. */
function askToEdit(codex: CodexPeer, changes: { path: string; kind: string; diff: string; movePath?: string }[]) {
  codex.notify('item/started', {
    threadId: 'thread-1',
    turnId: 'turn-1',
    startedAtMs: 0,
    item: {
      type: 'fileChange',
      id: 'edit-1',
      status: 'inProgress',
      changes: changes.map(({ path, kind, diff, movePath }) => ({
        path,
        kind: kind === 'update' ? { type: 'update', movePath: movePath ?? null } : { type: kind },
        diff,
      })),
    },
  });
  return codex.ask('item/fileChange/requestApproval', {
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'edit-1',
    startedAtMs: 0,
    reason: null,
    grantRoot: null,
  });
}

describe.skipIf(process.platform === 'win32')("the Codex adapter's edits (spec 052)", () => {
  async function running(overrides: Partial<AgentPermissions> = {}, onEdit?: () => Promise<string | null>) {
    const { fake, adapter, worktree } = await setup();
    const id = await adapter.startSession(brief, worktree, permissionsFrom(overrides), '', { onEdit });
    const events = heard(adapter, id);
    const { codex } = await answerStart(fake);
    return { adapter, id, events, codex, worktree };
  }

  it('AC-13: Edit files on Ask first shows the change, and the edit goes in only after Allow', async () => {
    let branches = 0;
    const { adapter, id, events, codex, worktree } = await running({ edits: 'ask' }, () => {
      branches += 1;
      return Promise.resolve(null);
    });
    let answered = false;
    const answer = askToEdit(codex, [
      { path: `${worktree}/src/a.ts`, kind: 'update', diff: '@@ -3,2 +3,2 @@\n keep\n-old\n+new\n' },
    ]).then((reply) => {
      answered = true;
      return reply;
    });
    await until(() => events.some((event) => event.type === 'approval'));
    const approval = events.find((event) => event.type === 'approval');
    expect(approval).toMatchObject({
      ask: {
        kind: 'edit',
        path: 'src/a.ts',
        creates: false,
        lines: [
          { kind: 'removed', number: 4, text: 'old' },
          { kind: 'added', number: 4, text: 'new' },
        ],
        moreLines: 0,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(answered).toBe(false);
    if (approval?.type !== 'approval') throw new Error('no approval');

    await adapter.respond(id, approval.approvalId, 'allow');
    expect((await answer).result).toEqual({ decision: 'accept' });
    // The session makes its branch before the first edit it lets in (spec 042).
    expect(branches).toBe(1);
  });

  it('AC-13: a new file shows its lines, the first 20 and a count of the rest', async () => {
    const { events, codex, worktree } = await running({ edits: 'ask' });
    const content = Array.from({ length: 25 }, (_, line) => `+line ${String(line + 1)}`).join('\n');
    void askToEdit(codex, [{ path: `${worktree}/src/new.ts`, kind: 'add', diff: `${content}\n` }]);
    await until(() => events.some((event) => event.type === 'approval'));
    const approval = events.find((event) => event.type === 'approval');
    if (approval?.type !== 'approval' || approval.ask.kind !== 'edit') throw new Error('no edit approval');
    expect(approval.ask).toMatchObject({ path: 'src/new.ts', creates: true, moreLines: 5 });
    expect(approval.ask.lines).toHaveLength(20);
    expect(approval.ask.lines[0]).toEqual({ kind: 'added', number: 1, text: 'line 1' });
  });

  it('Edit files on Allow lets the edit in without asking', async () => {
    const { events, codex, worktree } = await running({ edits: 'allow' });
    const reply = await askToEdit(codex, [
      { path: `${worktree}/src/a.ts`, kind: 'update', diff: '@@ -1 +1 @@\n-a\n+b\n' },
    ]);
    expect(reply.result).toEqual({ decision: 'accept' });
    expect(events.some((event) => event.type === 'approval')).toBe(false);
  });

  it('AC-14: an edit outside the worktree is refused with a step, whatever the row says', async () => {
    const { events, codex, id, worktree } = await running({ edits: 'allow' });
    const reply = await askToEdit(codex, [
      { path: `${worktree}/src/a.ts`, kind: 'update', diff: '' },
      { path: '/etc/hosts', kind: 'update', diff: '' },
    ]);
    expect(reply.result).toEqual({ decision: 'decline' });
    expect(events.at(-1)).toEqual({
      type: 'work',
      sessionId: id,
      work: { kind: 'refused', refusal: { access: 'edit', reason: 'outside_worktree', path: '/etc/hosts' } },
    });
  });

  it('AC-14: a move out of the worktree is refused too', async () => {
    const { codex, worktree } = await running({ edits: 'allow' });
    const reply = await askToEdit(codex, [
      { path: `${worktree}/src/a.ts`, kind: 'update', diff: '', movePath: '/Users/you/elsewhere.ts' },
    ]);
    expect(reply.result).toEqual({ decision: 'decline' });
  });

  it('Deny keeps the edit out, and says so as a step', async () => {
    const { adapter, id, events, codex, worktree } = await running({ edits: 'ask' });
    const answer = askToEdit(codex, [{ path: `${worktree}/src/a.ts`, kind: 'update', diff: '@@ -1 +1 @@\n-a\n+b\n' }]);
    await until(() => events.some((event) => event.type === 'approval'));
    const approval = events.find((event) => event.type === 'approval');
    if (approval?.type !== 'approval') throw new Error('no approval');
    await adapter.respond(id, approval.approvalId, 'deny');

    expect((await answer).result).toEqual({ decision: 'decline' });
    expect(events.at(-1)).toEqual({
      type: 'work',
      sessionId: id,
      work: { kind: 'denied', about: 'edit', text: 'src/a.ts' },
    });
  });

  it('an Ask edits nothing, and says so as a step', async () => {
    const { events, codex, id, worktree } = await running({ readOnly: true, edits: 'allow' });
    const reply = await askToEdit(codex, [{ path: `${worktree}/src/a.ts`, kind: 'update', diff: '' }]);
    expect(reply.result).toEqual({ decision: 'decline' });
    expect(events.at(-1)).toMatchObject({
      sessionId: id,
      work: { kind: 'refused', refusal: { access: 'edit', reason: 'ask_session', path: 'src/a.ts' } },
    });
  });

  it("an edit the session can't make its branch for, or one Orynx never saw start, is declined", async () => {
    const { codex, worktree } = await running({ edits: 'allow' }, () =>
      Promise.resolve("Orynx couldn't make the session's branch."),
    );
    const reply = await askToEdit(codex, [{ path: `${worktree}/src/a.ts`, kind: 'update', diff: '' }]);
    expect(reply.result).toEqual({ decision: 'decline' });

    const unseen = await codex.ask('item/fileChange/requestApproval', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'nope',
    });
    expect(unseen.result).toEqual({ decision: 'decline' });
  });
});

describe.skipIf(process.platform === 'win32')("the Codex adapter's Orynx tools (spec 052)", () => {
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

  async function running(run: AgentRunOptions, overrides: Partial<AgentPermissions> = {}) {
    const { fake, adapter, worktree } = await setup();
    const id = await adapter.startSession(brief, worktree, permissionsFrom(overrides), '', run);
    const events = heard(adapter, id);
    const started = await answerStart(fake);
    return { adapter, id, events, ...started };
  }

  const call = (codex: CodexPeer, tool: string, args: unknown) =>
    codex.ask('item/tool/call', {
      threadId: 'thread-1',
      turnId: 'turn-1',
      callId: 'call-1',
      namespace: null,
      tool,
      arguments: args,
    });

  it("AC-17: offers Orynx's tools as Codex's own, each with its input's JSON schema", async () => {
    const { thread, events } = await running({ tools: ticketTools(await tickets(), inSession) });
    const offered = (thread as { dynamicTools: { type: string; name: string; inputSchema: { type: string } }[] })
      .dynamicTools;
    expect(offered.map((tool) => tool.name)).toEqual([
      'list_tickets',
      'get_ticket',
      'create_ticket',
      'update_ticket',
      'delete_ticket',
    ]);
    expect(offered[2]).toMatchObject({ type: 'function', inputSchema: { type: 'object' } });
    await until(() => events.length > 0);
    expect(events[0]).toMatchObject({ type: 'started', loaded: { tools: 5 } });
  });

  it('AC-17: makes and changes tickets without asking, and each call that did something is a step', async () => {
    const service = await tickets();
    const { codex, events, id } = await running({ tools: ticketTools(service, inSession) });

    const made = await call(codex, 'create_ticket', { title: 'Flaky date test', type: 'Bug' });
    expect(made.result).toMatchObject({ success: true, contentItems: [{ type: 'inputText' }] });
    expect(await service.get('ORX-2')).toMatchObject({ title: 'Flaky date test', createdBy: inSession });
    expect(events.at(-1)).toEqual({
      type: 'work',
      sessionId: id,
      work: { kind: 'ticket', done: { action: 'created', key: 'ORX-2', title: 'Flaky date test' } },
    });
  });

  it('AC-17: deleting a ticket waits for you, and Deny keeps it', async () => {
    const service = await tickets();
    const { adapter, codex, events, id } = await running({ tools: ticketTools(service, inSession) });
    const answer = call(codex, 'delete_ticket', { key: 'ORX-1' });
    await until(() => events.some((event) => event.type === 'approval'));
    const approval = events.find((event) => event.type === 'approval');
    expect(approval).toMatchObject({ ask: { kind: 'ticket', key: 'ORX-1', title: 'Fix the date test' } });
    if (approval?.type !== 'approval') throw new Error('no approval');
    await adapter.respond(id, approval.approvalId, 'deny');

    expect((await answer).result).toMatchObject({ success: false });
    expect(await service.get('ORX-1')).not.toBeNull();
    expect(events.at(-1)).toEqual({
      type: 'work',
      sessionId: id,
      work: { kind: 'denied', about: 'ticket', text: 'ORX-1' },
    });
  });

  it('an Ask reads tickets and changes none', async () => {
    const service = await tickets();
    const { codex } = await running({ tools: ticketTools(service, inSession) }, { readOnly: true });
    expect((await call(codex, 'get_ticket', { key: 'ORX-1' })).result).toMatchObject({ success: true });
    expect((await call(codex, 'update_ticket', { key: 'ORX-1', status: 'done' })).result).toMatchObject({
      success: false,
    });
    expect(await service.get('ORX-1')).toMatchObject({ status: 'in_progress' });
  });

  it('AC-17: a session tool asks as it says, runs on Allow, and one it turns down runs nothing', async () => {
    let ran = 0;
    const { adapter, codex, events, id } = await running({
      orynxTools: [
        {
          name: 'start_server',
          description: 'Starts a server.',
          input: z.object({ command: z.string() }),
          asks: (input) =>
            Promise.resolve(
              input['command'] === 'rm'
                ? { refused: 'Only servers.' }
                : { kind: 'server', command: String(input['command']), folder: '.', alwaysAllow: 'server:repo' },
            ),
          run: () => {
            ran += 1;
            return Promise.resolve({ text: 'Started on port 5173.' });
          },
        },
      ],
    });
    const answer = call(codex, 'start_server', { command: 'npm run dev' });
    await until(() => events.some((event) => event.type === 'approval'));
    const approval = events.find((event) => event.type === 'approval');
    expect(approval).toMatchObject({ ask: { kind: 'server', command: 'npm run dev' } });
    if (approval?.type !== 'approval') throw new Error('no approval');
    await adapter.respond(id, approval.approvalId, 'allow');
    expect((await answer).result).toEqual({
      contentItems: [{ type: 'inputText', text: 'Started on port 5173.' }],
      success: true,
    });

    expect((await call(codex, 'start_server', { command: 'rm' })).result).toEqual({
      contentItems: [{ type: 'inputText', text: 'Only servers.' }],
      success: false,
    });
    expect(ran).toBe(1);
  });

  it('a tool Orynx never offered runs nothing', async () => {
    const { codex } = await running({});
    expect((await call(codex, 'shell', { command: 'rm -rf /' })).result).toMatchObject({ success: false });
  });
});

describe.skipIf(process.platform === 'win32')("the Codex adapter's follow-ups and text (spec 052)", () => {
  it('AC-18: a follow-up while Codex works goes into its turn', async () => {
    const { fake, adapter, worktree } = await setup();
    const id = await adapter.startSession(brief, worktree, permissionsFrom(), '');
    const { codex } = await answerStart(fake);

    const sending = adapter.sendMessage(id, 'Also add a test');
    const steer = await codex.expectRequest('turn/steer');
    expect(steer.params).toEqual({
      threadId: 'thread-1',
      expectedTurnId: 'turn-1',
      input: [{ type: 'text', text: 'Also add a test' }],
    });
    codex.reply(steer.id, { turnId: 'turn-1' });
    expect(await sending).toBe(true);
  });

  it('AC-18: a follow-up that comes as the turn ends, or after, is left for the session to resume with', async () => {
    const { fake, adapter, worktree } = await setup();
    const id = await adapter.startSession(brief, worktree, permissionsFrom(), '');
    const events = heard(adapter, id);
    const { codex } = await answerStart(fake);

    const sending = adapter.sendMessage(id, 'Also add a test');
    codex.fail((await codex.expectRequest('turn/steer')).id, -32600, 'no active turn');
    expect(await sending).toBe(false);

    finishTurn(codex, 'Done.');
    await until(() => events.at(-1)?.type === 'ended');
    expect(await adapter.sendMessage(id, 'One more')).toBe(false);
  });

  it("AC-19: after Done or Stop, a follow-up resumes Codex's own thread with your message", async () => {
    const { fake, adapter, worktree } = await setup();
    const id = await adapter.startSession({ message: 'Now add a test', context: [] }, worktree, permissionsFrom(), '', {
      resume: 'thread-1',
    });
    const events = heard(adapter, id);
    const codex = await fake.next();
    codex.reply((await codex.expectRequest('initialize')).id, {});
    await codex.read();
    codex.reply((await codex.expectRequest('config/read')).id, { config: {} });
    const resumed = await codex.expectRequest('thread/resume');
    expect(resumed.params).toMatchObject({ threadId: 'thread-1', cwd: worktree });
    codex.reply(resumed.id, { thread: { id: 'thread-1' } });
    const turn = await codex.expectRequest('turn/start');
    expect(turn.params).toMatchObject({ threadId: 'thread-1', input: [{ type: 'text', text: 'Now add a test' }] });
    codex.reply(turn.id, { turn: { id: 'turn-2' } });

    await until(() => events.length > 0);
    expect(events[0]).toMatchObject({ type: 'started', agentSessionId: 'thread-1' });
  });

  it('AC-19: a thread Codex no longer has is the resume problem', async () => {
    const { fake, adapter, worktree } = await setup();
    const id = await adapter.startSession(brief, worktree, permissionsFrom(), '', { resume: 'thread-gone' });
    const events = heard(adapter, id);
    const codex = await fake.next();
    codex.reply((await codex.expectRequest('initialize')).id, {});
    await codex.read();
    codex.reply((await codex.expectRequest('config/read')).id, { config: {} });
    codex.fail((await codex.expectRequest('thread/resume')).id, -32600, 'no rollout found for thread id thread-gone');

    await until(() => events.at(-1)?.type === 'ended');
    expect(events).toEqual([
      { type: 'problem', sessionId: id, kind: 'resume', code: 'no_conversation' },
      { type: 'ended', sessionId: id },
    ]);
  });

  /** Plays Codex for one `write()`: answers its start, and gives `answer` once the turn has started. */
  async function answerWrite(fake: FakeCodex, answer: (codex: CodexPeer) => void) {
    const codex = await fake.next();
    codex.reply((await codex.expectRequest('initialize')).id, {});
    await codex.read();
    codex.reply((await codex.expectRequest('config/read')).id, { config: {} });
    const thread = await codex.expectRequest('thread/start');
    codex.reply(thread.id, { thread: { id: 'thread-w' } });
    const turn = await codex.expectRequest('turn/start');
    codex.reply(turn.id, { turn: { id: 'turn-w' } });
    answer(codex);
    return { codex, thread: thread.params, turn: turn.params };
  }

  it("AC-22: writes text alone, from an empty folder it can only read, in a thread that isn't kept", async () => {
    const { fake, adapter } = await setup();
    const writing = adapter.write('Draft the pull request.', 'Write a title and a body.', {
      model: 'gpt-5.5-codex',
      effort: 'low',
    });
    let declined: unknown = null;
    const { thread, turn } = await answerWrite(fake, (codex) => {
      void codex
        .ask('item/commandExecution/requestApproval', { kind: 'command', itemId: 'c', command: 'ls ~' })
        .then((reply) => {
          declined = reply.result;
          codex.notify('item/completed', { item: { type: 'agentMessage', id: 'm', text: 'Add bulk archive' } });
          codex.notify('turn/completed', { threadId: 'thread-w', turn: { id: 'turn-w', status: 'completed' } });
        });
    });

    expect(await writing).toEqual({ ok: true, text: 'Add bulk archive' });
    expect(declined).toEqual({ decision: 'decline' });
    expect(thread).toMatchObject({
      ephemeral: true,
      developerInstructions: 'Write a title and a body.',
      model: 'gpt-5.5-codex',
    });
    expect(thread).not.toHaveProperty('dynamicTools');
    expect(turn).toMatchObject({ input: [{ type: 'text', text: 'Draft the pull request.' }], effort: 'low' });
    const [run] = await fake.runs();
    expect(run?.cwd).toMatch(/orynx-codex-write-/);
    expect(run?.args.join(' ')).toMatch(/orynx-codex-write-[^"]*"="read"/);
  });

  it('AC-22: gives up after its time, and says the login or limit problem when the turn fails', async () => {
    const { fake, adapter } = await setup();
    const late = adapter.write('Draft it.', '', { timeoutMs: 1500 });
    await answerWrite(fake, () => undefined);
    expect(await late).toEqual({ ok: false, problem: 'timeout' });

    const failing = adapter.write('Draft it.', '');
    await answerWrite(fake, (codex) => {
      codex.notify('turn/completed', {
        threadId: 'thread-w',
        turn: { id: 'turn-w', status: 'failed', error: { message: 'x', codexErrorInfo: 'usageLimitExceeded' } },
      });
    });
    expect(await failing).toEqual({ ok: false, problem: 'limit' });

    expect(await (await setup({ program: null })).adapter.write('Draft it.', '')).toEqual({
      ok: false,
      problem: 'other',
    });
  });
});
