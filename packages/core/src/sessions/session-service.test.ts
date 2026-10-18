import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createNetServer, type Server } from 'node:net';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ServerEvent } from '@devhub/contracts';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { createClaudeAdapter } from '../agents/claude/claude-adapter.ts';
import { createClaudeCode } from '../agents/claude/claude-code.ts';
import { createClaudeLogin } from '../agents/claude/claude-login.ts';
import { createEventBus } from '../events/event-bus.ts';
import { createJiraClient } from '../integrations/jira/client.ts';
import { createJiraConnection } from '../integrations/jira/connection.ts';
import { createPreferencesService } from '../preferences/preferences-service.ts';
import { createRepositoryService } from '../repositories/repository-service.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createTokenStore } from '../secrets/token-store.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';
import { useFakeClaudeFolder } from '../test/fake-claude.ts';
import { fakeClaudeSdk, type FakeTurn } from '../test/fake-claude-sdk.ts';
import { acceptingIssue, goodToken, issueUrl, jiraEmail, jiraSite } from '../test/fake-jira.ts';
import { useTestRepositories } from '../test/git-repository.ts';
import { http, HttpResponse } from 'msw';
import { openFileSessionStore, sessionsFolder } from './file-session-store.ts';
import type { SessionRecords } from './session-store.ts';
import { createSessionService, type SessionReport } from './session-service.ts';

// Real git, a real Claude Code login check and a real Jira client behind a fake Jira: each test does a lot.
vi.setConfig({ testTimeout: 15_000 });

/** Jira, the outside service, faked for this file only. */
const jira = setupServer();
beforeAll(() => {
  jira.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  jira.resetHandlers();
});
afterAll(() => {
  jira.close();
});

const repositories = useTestRepositories();
const claudeFolder = useFakeClaudeFolder();
const homes: string[] = [];
const services: { close(): Promise<void> }[] = [];
afterEach(async () => {
  // Every change still being saved lands before its folder goes.
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

const clock = Date.parse('2026-10-18T09:56:00.000Z');

interface SetUpOptions {
  /** How Claude Code's login check answers. */
  login?: 'signed_in' | 'signed_out';
  /** Folders for PROJ beyond the first. */
  moreFolders?: number;
  /** A folder for PROJ at all. */
  folder?: boolean;
  script?: readonly FakeTurn[];
  cached?: { title: string; sprint: string | null } | null;
  /** Build the server without Claude Code. */
  noClaude?: boolean;
  mode?: 'ask_everything' | 'edit_freely_ask_commands';
}

async function setUp({
  login = 'signed_in',
  moreFolders = 0,
  folder = true,
  script = [{ finish: 'Done.' }],
  cached = { title: 'Add bulk archive', sprint: 'Sprint 42' },
  noClaude = false,
  mode = 'edit_freely_ask_commands',
}: SetUpOptions = {}) {
  const repos = await repositories();
  const home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-session-home-')));
  homes.push(home);
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));

  const settings = createMemorySettingsStore({
    jira: { site: jiraSite, email: jiraEmail },
    agent: { permissionMode: mode },
  });
  const tokens = createTokenStore({ keychain: createMemoryKeychain({ jira: goodToken }), events });
  const connection = createJiraConnection({ settings, tokens, jira: createJiraClient(), events, envToken: false });
  const folders = createRepositoryService({ settings, events, home: repos.root, devhubHome: home });
  const added = [];
  if (folder) added.push(await folders.add({ path: repos.clone, jiraProject: 'PROJ' }));
  for (let n = 0; n < moreFolders; n++) {
    const other = join(repos.root, `other-${String(n)}`);
    await repos.git(repos.root, 'clone', repos.origin, other);
    added.push(await folders.add({ path: other, jiraProject: 'PROJ' }));
  }

  const fakeClaude = await claudeFolder();
  await fakeClaude.install({ kind: login });
  const claude = createClaudeLogin({
    claudeCode: createClaudeCode({ program: fakeClaude.program, env: {}, workFolder: fakeClaude.workFolder }),
    events,
  });

  const sdk = fakeClaudeSdk(script);
  const records = await openFileSessionStore(home, { now: () => clock });
  const reports: SessionReport[] = [];
  let ids = 0;
  const service = createSessionService({
    records,
    repositories: folders,
    claude,
    connection,
    jira: createJiraClient({ timeoutMs: 500 }),
    describeTicket: () => Promise.resolve(cached),
    preferences: createPreferencesService({ settings, events }),
    worktrees: { env: gitEnvironment(repos.env), root: join(home, 'worktrees'), fetchTimeoutMs: 2_000 },
    stepEventMs: 250,
    adapter: noClaude
      ? null
      : createClaudeAdapter({ query: sdk.query, program: '/opt/claude/claude', env: {}, home: repos.root }),
    events,
    onReport: (report) => reports.push(report),
    now: () => clock,
    newId: () => {
      ids += 1;
      return ids.toString(16).padStart(16, '0');
    },
  });
  services.push(service);
  jira.use(acceptingIssue({ key: 'PROJ-1423', summary: 'Add bulk archive to the content list' }));
  return { service, records, repos, home, heard, reports, sdk, folders: added, settings };
}

/** Waits until the session has sent Claude its brief: from there a hanging Claude writes nothing more. */
async function briefed(records: SessionRecords, id: string) {
  for (let tries = 0; tries < 500; tries++) {
    const record = await records.get(id);
    if (record?.session.activities.some((activity) => activity.kind === 'brief') === true) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The session never sent its brief');
}

/** Waits until the session isn't Working any more. */
async function settled(records: SessionRecords, id = '0000000000000001') {
  for (let tries = 0; tries < 500; tries++) {
    const record = await records.get(id);
    if (record !== null && record.session.state !== 'working') return record;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The session is still working');
}

const kinds = (record: { session: { activities: readonly { kind: string; state: string }[] } }) =>
  record.session.activities.map((activity) => `${activity.kind}:${activity.state}`);

describe('starting a session', () => {
  it('AC-1: starts a session on a ticket whose project has one folder, and tells every tab', async () => {
    const { service, records, home, heard, folders } = await setUp();

    const answer = await service.start({ ticketKey: 'PROJ-1423' });

    expect(answer).toEqual({ result: 'started', sessionId: '0000000000000001' });
    const record = await records.get('0000000000000001');
    expect(record).toMatchObject({
      repository: { id: folders[0]?.id, path: folders[0]?.path },
      worktree: join(home, 'worktrees', '0000000000000001'),
      session: {
        id: '0000000000000001',
        title: 'Add bulk archive',
        source: { kind: 'jira', key: 'PROJ-1423' },
        folder: { name: 'web-app', displayPath: folders[0]?.displayPath },
        startedAt: '2026-10-18T09:56:00.000Z',
        jiraUrl: `https://${jiraSite}/browse/PROJ-1423`,
        sprint: 'Sprint 42',
        discardedAt: null,
      },
    });
    expect(heard).toContainEqual({ type: 'sessions.changed' });
    await settled(records);
  });

  it('AC-1: uses the key as the title when neither the cache nor Jira knows the ticket', async () => {
    const { service, records } = await setUp({ cached: null });
    jira.use(http.get(issueUrl('PROJ-1423'), () => HttpResponse.json({}, { status: 404 })));
    await service.start({ ticketKey: 'PROJ-1423' });
    expect((await settled(records)).session).toMatchObject({ title: 'PROJ-1423', sprint: null });
  });

  it('AC-11 (Q3): asks which folder when the project has several, and starts in the one picked', async () => {
    const { service, records, folders } = await setUp({ moreFolders: 1 });
    expect(await service.start({ ticketKey: 'PROJ-1423' })).toEqual({
      result: 'cannot_start',
      reason: 'choose_folder',
    });

    const picked = folders[1];
    if (picked === undefined) throw new Error('no second folder');
    expect(await service.start({ ticketKey: 'PROJ-1423', repositoryId: picked.id })).toMatchObject({
      result: 'started',
    });
    expect((await records.get('0000000000000001'))?.repository.id).toBe(picked.id);
    await settled(records);
  });

  it('AC-11: refuses a folder that isn’t one of the project’s', async () => {
    const { service } = await setUp();
    expect(await service.start({ ticketKey: 'PROJ-1423', repositoryId: 'ffffffffffffffff' })).toEqual({
      result: 'cannot_start',
      reason: 'choose_folder',
    });
  });

  it.each([
    ['no_folder', { folder: false }],
    ['signed_out', { login: 'signed_out' }],
  ] as const)('AC-12 (Q4): says %s and creates nothing', async (reason, options) => {
    const { service, records, heard } = await setUp(options);
    expect(await service.start({ ticketKey: 'PROJ-1423' })).toEqual({ result: 'cannot_start', reason });
    expect(await records.list()).toEqual([]);
    expect(heard).not.toContainEqual({ type: 'sessions.changed' });
  });

  it('AC-12 (Q11): lets three sessions work at once, and no fourth', async () => {
    const { service, records } = await setUp({ script: [{ hang: true }] });
    jira.use(acceptingIssue([{ key: 'PROJ-1' }, { key: 'PROJ-2' }, { key: 'PROJ-3' }, { key: 'PROJ-4' }]));
    for (const key of ['PROJ-1', 'PROJ-2', 'PROJ-3']) {
      const started = await service.start({ ticketKey: key });
      expect(started).toMatchObject({ result: 'started' });
      await briefed(records, started.result === 'started' ? started.sessionId : '');
    }
    expect(await service.start({ ticketKey: 'PROJ-4' })).toEqual({ result: 'cannot_start', reason: 'too_many' });
    expect(await records.list()).toHaveLength(3);
    await service.close();
  });

  it('AC-1: opens the ticket’s live session instead of starting a second one', async () => {
    const { service, records } = await setUp({ script: [{ hang: true }] });
    const first = await service.start({ ticketKey: 'PROJ-1423' });
    await briefed(records, '0000000000000001');
    expect(await service.start({ ticketKey: 'PROJ-1423' })).toEqual({
      result: 'existing',
      sessionId: first.result === 'started' ? first.sessionId : '',
    });
    expect(await records.list()).toHaveLength(1);
    await service.close();
  });

  it('AC-1: starts only one session when two tabs press Build at once', async () => {
    const { service, records } = await setUp({ script: [{ hang: true }] });
    const [a, b] = await Promise.all([
      service.start({ ticketKey: 'PROJ-1423' }),
      service.start({ ticketKey: 'PROJ-1423' }),
    ]);
    expect([a.result, b.result].sort()).toEqual(['existing', 'started']);
    expect(await records.list()).toHaveLength(1);
    await briefed(records, '0000000000000001');
    await service.close();
  });
});

describe('running a session', () => {
  const work: FakeTurn[] = [
    { tool: 'Read', input: { file_path: 'README.md' } },
    { tool: 'TodoWrite', input: { todos: [{ content: 'Add a toolbar button', status: 'pending', activeForm: 'x' }] } },
    { tool: 'Write', input: { file_path: 'src/toolbar.ts', content: 'export const toolbar = true;\n' } },
    { finish: 'Added a toolbar button.' },
  ];

  it('AC-2, AC-3, AC-8: reads the ticket, makes the worktree, sends the brief, and follows Claude to the end', async () => {
    const { service, records, repos, home, sdk } = await setUp({ script: work });
    const before = await repos.git(repos.clone, 'status', '--porcelain=v1', '--branch');

    await service.start({ ticketKey: 'PROJ-1423' });
    const record = await settled(records);

    expect(record.session).toMatchObject({
      title: 'Add bulk archive to the content list',
      state: 'done',
      branch: 'feat/PROJ-1423',
      step: 'review',
      problem: null,
      endedAt: '2026-10-18T09:56:00.000Z',
    });
    expect(record.session.activities).toEqual([
      { id: 'step-1', state: 'done', kind: 'worktree', branch: 'feat/PROJ-1423', base: 'origin/main', fetched: true },
      { id: 'step-2', state: 'done', kind: 'brief', key: 'PROJ-1423' },
      { id: 'step-3', state: 'done', kind: 'explore', files: ['README.md'] },
      { id: 'step-4', state: 'done', kind: 'plan', items: ['Add a toolbar button'] },
      { id: 'step-5', state: 'done', kind: 'edit', files: ['src/toolbar.ts'] },
      { id: 'step-6', state: 'done', kind: 'finished', summary: 'Added a toolbar button.' },
    ]);
    expect(record.claudeSessionId).toBe('b2c7e0f4-0000-4000-8000-000000000001');

    const worktree = join(home, 'worktrees', '0000000000000001');
    expect(await repos.git(worktree, 'branch', '--show-current')).toBe('feat/PROJ-1423');
    expect(await repos.git(repos.clone, 'status', '--porcelain=v1', '--branch')).toBe(before);

    const brief = await readFile(join(sessionsFolder(home), '0000000000000001', 'brief.md'), 'utf8');
    expect(sdk.runs[0]?.prompts).toEqual([brief]);
    expect(brief).toMatch(/^Jira ticket PROJ-1423 \(Story\): Add bulk archive to the content list\n\n/);
    expect(sdk.runs[0]?.options.cwd).toBe(worktree);
    expect(sdk.runs[0]?.options.systemPrompt).toMatchObject({
      append: expect.stringContaining('feat/PROJ-1423') as unknown,
    });
  });

  it('AC-6: refuses edits when Settings says Ask before everything', async () => {
    const { service, records } = await setUp({
      mode: 'ask_everything',
      script: [{ tool: 'Write', input: { file_path: 'a.ts', content: 'x' } }, { finish: 'Described it.' }],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    const record = await settled(records);
    expect(record.session.activities).toContainEqual(
      expect.objectContaining({ kind: 'refused', reason: 'ask_everything', path: 'a.ts' }) as unknown,
    );
    expect(record.session.step).toBe('review');
  });

  it('AC-4: tells the Session screen about new steps at most every 250 ms, and the lists about state at once', async () => {
    const burst: FakeTurn[] = Array.from({ length: 30 }, (_, n) => ({
      tool: 'Read',
      input: { file_path: n % 2 === 0 ? 'README.md' : 'missing.md' },
    }));
    const { service, records, heard } = await setUp({ script: [...burst, { finish: 'Read a lot.' }] });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const stepEvents = heard.filter((event) => event.type === 'session.changed');
    expect(stepEvents.length).toBeGreaterThan(0);
    expect(stepEvents.length).toBeLessThan(8);
    expect(stepEvents.every((event) => event.sessionId === '0000000000000001')).toBe(true);
    // Started, and done.
    expect(heard.filter((event) => event.type === 'sessions.changed').length).toBeGreaterThanOrEqual(2);
  });

  describe('when something fails', () => {
    it('AC-13: Jira can’t be read: Stopped, couldn’t start, no worktree', async () => {
      const { service, records, home, reports } = await setUp();
      jira.use(http.get(issueUrl('PROJ-1423'), () => HttpResponse.json({ errorMessages: ['gone'] }, { status: 404 })));
      await service.start({ ticketKey: 'PROJ-1423' });
      const record = await settled(records);
      expect(record.session).toMatchObject({
        state: 'stopped',
        problem: { kind: 'jira', stage: 'starting' },
        branch: null,
      });
      expect(reports).toContainEqual({
        what: 'failed',
        session: '0000000000000001',
        ticket: 'PROJ-1423',
        problem: 'jira',
        code: 'not_found',
      });
      await expect(readFile(join(home, 'worktrees', '0000000000000001', 'README.md'))).rejects.toThrow();
    });

    it('AC-13: the folder isn’t a git repository any more', async () => {
      const { service, records, repos } = await setUp();
      await rm(join(repos.clone, '.git'), { recursive: true, force: true });
      await service.start({ ticketKey: 'PROJ-1423' });
      expect((await settled(records)).session.problem).toEqual({ kind: 'folder', stage: 'starting' });
    });

    it('AC-13: git can’t make the worktree', async () => {
      const { service, records, home } = await setUp();
      const inTheWay = join(home, 'worktrees', '0000000000000001');
      await mkdir(inTheWay, { recursive: true });
      await writeFile(join(inTheWay, 'file.txt'), 'x');
      await service.start({ ticketKey: 'PROJ-1423' });
      const record = await settled(records);
      expect(record.session.problem).toEqual({ kind: 'git', stage: 'starting' });
      expect(kinds(record)).toEqual(['worktree:done']);
    });

    it('AC-13: Claude Code refuses the login before Claude does anything: couldn’t start', async () => {
      const { service, records, reports } = await setUp({
        script: [
          {
            message: {
              type: 'assistant',
              parent_tool_use_id: null,
              error: 'authentication_failed',
              message: { content: [] },
            },
          },
        ],
      });
      await service.start({ ticketKey: 'PROJ-1423' });
      await settled(records);
      await service.close();
      const record = await records.get('0000000000000001');
      if (record === null) throw new Error('no session');
      expect(record.session).toMatchObject({ state: 'stopped', problem: { kind: 'login', stage: 'starting' } });
      expect(kinds(record)).toEqual(['worktree:done', 'brief:done']);
      expect(reports).toContainEqual(
        expect.objectContaining({ problem: 'login', code: 'authentication_failed' }) as unknown,
      );
    });

    it('AC-13: a limit after Claude has worked: stopped with an error, its steps kept', async () => {
      const { service, records } = await setUp({
        script: [
          { tool: 'Read', input: { file_path: 'README.md' } },
          { message: { type: 'assistant', parent_tool_use_id: null, error: 'rate_limit', message: { content: [] } } },
        ],
      });
      await service.start({ ticketKey: 'PROJ-1423' });
      const record = await settled(records);
      expect(record.session.problem).toEqual({ kind: 'limit', stage: 'working' });
      expect(kinds(record)).toEqual(['worktree:done', 'brief:done', 'explore:done']);
    });

    it('AC-13: Claude Code’s process dies', async () => {
      const { service, records } = await setUp({ script: [{ crash: 'boom' }] });
      await service.start({ ticketKey: 'PROJ-1423' });
      expect((await settled(records)).session.problem).toEqual({ kind: 'other', stage: 'starting' });
    });

    it('AC-22: with no Claude Code, the session can’t start and nothing runs', async () => {
      const { service, records, sdk } = await setUp({ noClaude: true });
      await service.start({ ticketKey: 'PROJ-1423' });
      expect((await settled(records)).session.problem).toEqual({ kind: 'other', stage: 'starting' });
      expect(sdk.runs).toEqual([]);
    });

    it('AC-21: never tells the terminal the ticket’s text or Claude’s words', async () => {
      const { service, records, reports } = await setUp({ script: work });
      jira.use(
        acceptingIssue({
          key: 'PROJ-1423',
          summary: 'Secret summary',
          description: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Secret description' }] }],
          },
        }),
      );
      await service.start({ ticketKey: 'PROJ-1423' });
      await settled(records);
      await service.close();
      const told = JSON.stringify(reports);
      expect(told).not.toMatch(/Secret|toolbar|README/);
      expect(reports).toContainEqual({
        what: 'started',
        session: '0000000000000001',
        ticket: 'PROJ-1423',
        loaded: { tools: 7, mcpServers: 0, plugins: 0 },
      });
    });
  });
});

/** Waits until a session's steps hold one of this kind. */
async function hasStep(records: SessionRecords, kind: string, id = '0000000000000001') {
  for (let tries = 0; tries < 500; tries++) {
    const record = await records.get(id);
    if (record?.session.activities.some((activity) => activity.kind === kind) === true) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`The session never had a ${kind} step`);
}

describe('stopping a session', () => {
  it('AC-9: stops Claude while it works: Stopped, every step done, the worktree kept', async () => {
    const { service, records, home, sdk, heard } = await setUp({
      script: [{ tool: 'Read', input: { file_path: 'README.md' } }, { hang: true }],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    await hasStep(records, 'explore');

    expect(await service.stop('0000000000000001')).toBe('stopped');

    const record = await records.get('0000000000000001');
    expect(record?.session.state).toBe('stopped');
    expect(record?.session.problem).toBeNull();
    expect(record && kinds(record)).toEqual(['worktree:done', 'brief:done', 'explore:done', 'stopped:done']);
    expect(sdk.runs[0]?.interrupts).toBe(1);
    expect(await readFile(join(home, 'worktrees', '0000000000000001', 'README.md'), 'utf8')).toBe('# web-app\n');
    expect(heard.filter((event) => event.type === 'sessions.changed').length).toBeGreaterThanOrEqual(2);
  });

  describe('while the worktree is being made', () => {
    let silent: Server | undefined;
    afterEach(() => {
      silent?.close();
    });

    it('AC-9: stops git, keeps whatever was made, and never starts Claude', async () => {
      const { service, records, repos, sdk } = await setUp();
      silent = createNetServer(() => {
        // Never answers, so the fetch waits.
      });
      await new Promise<void>((resolve) => silent?.listen(0, '127.0.0.1', resolve));
      const address = silent.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      await repos.git(repos.clone, 'remote', 'set-url', 'origin', `http://127.0.0.1:${String(port)}/web-app.git`);

      await service.start({ ticketKey: 'PROJ-1423' });
      await hasStep(records, 'worktree');
      const started = Date.now();
      expect(await service.stop('0000000000000001')).toBe('stopped');
      await service.close();

      expect(Date.now() - started).toBeLessThan(5_000);
      const record = await records.get('0000000000000001');
      expect(record?.session.state).toBe('stopped');
      expect(record && kinds(record)).toEqual(['worktree:done', 'stopped:done']);
      expect(sdk.runs).toEqual([]);
    });
  });

  it('AC-9: a session that isn’t working stays as it is, and an unknown one is not found', async () => {
    const { service, records } = await setUp();
    await service.start({ ticketKey: 'PROJ-1423' });
    const done = await settled(records);
    expect(await service.stop('0000000000000001')).toBe('stopped');
    expect((await records.get('0000000000000001'))?.session).toEqual(done.session);
    expect(await service.stop('fedcba9876543210')).toBe('not_found');
  });
});

describe('discarding a session', () => {
  it('AC-10: deletes a finished session’s worktree and branch, and keeps the session, Stopped', async () => {
    const { service, records, repos, home } = await setUp();
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);

    expect(await service.discard('0000000000000001')).toBe('discarded');

    const record = await records.get('0000000000000001');
    expect(record?.session).toMatchObject({ state: 'stopped', discardedAt: '2026-10-18T09:56:00.000Z' });
    expect(record?.session.activities.at(-1)).toMatchObject({ kind: 'discarded', branch: 'feat/PROJ-1423' });
    await expect(readFile(join(home, 'worktrees', '0000000000000001', 'README.md'))).rejects.toThrow();
    expect(await repos.git(repos.clone, 'branch', '--list', 'feat/PROJ-1423')).toBe('');
  });

  it('AC-10: stops a working session first', async () => {
    const { service, records } = await setUp({ script: [{ hang: true }] });
    await service.start({ ticketKey: 'PROJ-1423' });
    await hasStep(records, 'brief');
    expect(await service.discard('0000000000000001')).toBe('discarded');
    const record = await records.get('0000000000000001');
    expect(record && kinds(record)).toEqual(['worktree:done', 'brief:done', 'stopped:done', 'discarded:done']);
  });

  it('AC-10: discards a session that never got a worktree', async () => {
    const { service, records } = await setUp();
    jira.use(http.get(issueUrl('PROJ-1423'), () => HttpResponse.json({}, { status: 404 })));
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    expect(await service.discard('0000000000000001')).toBe('discarded');
    expect((await records.get('0000000000000001'))?.session).toMatchObject({
      discardedAt: '2026-10-18T09:56:00.000Z',
      activities: [],
    });
  });

  it('AC-10: discarding twice changes nothing, and an unknown session is not found', async () => {
    const { service, records } = await setUp();
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    await service.discard('0000000000000001');
    const once = await records.get('0000000000000001');
    expect(await service.discard('0000000000000001')).toBe('discarded');
    expect(await records.get('0000000000000001')).toEqual(once);
    expect(await service.discard('fedcba9876543210')).toBe('not_found');
  });
});

describe('closing the server', () => {
  it('AC-14: stops every working session as closed, not as stopped by you', async () => {
    const { service, records, sdk } = await setUp({ script: [{ hang: true }] });
    await service.start({ ticketKey: 'PROJ-1423' });
    await hasStep(records, 'brief');
    await service.close();
    const record = await records.get('0000000000000001');
    expect(record?.session.state).toBe('stopped');
    expect(record && kinds(record)).toEqual(['worktree:done', 'brief:done', 'interrupted:done']);
    expect(sdk.runs[0]?.interrupts).toBe(1);
  });
});
