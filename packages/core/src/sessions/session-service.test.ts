import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as createNetServer, type Server } from 'node:net';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PermissionMode, ServerEvent } from '@devhub/contracts';
import { makeSessionPullRequest } from '@devhub/contracts/testing';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { createClaudeAdapter } from '../agents/claude/claude-adapter.ts';
import { sandboxSettings } from '../agents/claude/sandbox.ts';
import { createClaudeCode } from '../agents/claude/claude-code.ts';
import { createClaudeLogin } from '../agents/claude/claude-login.ts';
import { createEventBus } from '../events/event-bus.ts';
import { createGitHubClient } from '../integrations/github/client.ts';
import { createGitHubConnection } from '../integrations/github/connection.ts';
import { createGhCli } from '../integrations/github/gh.ts';
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
import {
  acceptingPulls,
  acceptingRepository,
  githubToken,
  pullsUrl,
  type FakeOpenedPull,
} from '../test/fake-github.ts';
import { useTestRepositories } from '../test/git-repository.ts';
import { createTerminalService } from '../terminal/terminal-service.ts';
import { http, HttpResponse } from 'msw';
import { openFileSessionStore, sessionsFolder } from './file-session-store.ts';
import type { SessionRecords } from './session-store.ts';
import { createChangesReader } from './changes.ts';
import { createContextReader } from './context-reader.ts';
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
  /** What Claude Code plays when a follow-up resumes it, run by run (spec 013). */
  later?: (readonly FakeTurn[])[];
  /** The clock, when a test needs it to move. */
  now?: () => number;
  cached?: {
    title: string;
    sprint: string | null;
    status?: { name: string; column: 'to_do' | 'in_progress' | 'in_review' | 'done' } | null;
    dueDate?: string | null;
  } | null;
  /** Build the server without Claude Code. */
  noClaude?: boolean;
  mode?: PermissionMode;
  /** The allow list in Settings › Coding agent. */
  allowedCommands?: string[];
  /** Saving settings fails, as a full disk would. */
  savesFail?: boolean;
  /** Holds the read of the permission mode, the run's last step before Claude starts, until it resolves. */
  preferencesGate?: Promise<void>;
  /** Holds every save of the settings until it resolves, as a slow disk would. */
  saveGate?: Promise<void>;
  /** How long the GitHub client waits for GitHub (spec 014). */
  githubTimeoutMs?: number;
}

async function setUp({
  login = 'signed_in',
  moreFolders = 0,
  folder = true,
  script = [{ finish: 'Done.' }],
  later = [],
  now = () => clock,
  cached = { title: 'Add bulk archive', sprint: 'Sprint 42' },
  noClaude = false,
  mode = 'edit_freely_ask_commands',
  allowedCommands = [],
  savesFail = false,
  preferencesGate,
  saveGate,
  githubTimeoutMs = 500,
}: SetUpOptions = {}) {
  const repos = await repositories();
  const home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-session-home-')));
  homes.push(home);
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));

  const settings = createMemorySettingsStore({
    jira: { site: jiraSite, email: jiraEmail },
    github: { method: 'token' },
    agent: { permissionMode: mode, allowedCommands },
  });
  const tokens = createTokenStore({ keychain: createMemoryKeychain({ jira: goodToken, github: githubToken }), events });
  const connection = createJiraConnection({ settings, tokens, jira: createJiraClient(), events, envToken: false });
  const githubConnection = createGitHubConnection({
    settings,
    tokens,
    github: createGitHubClient({ timeoutMs: 500 }),
    gh: createGhCli({ searchPath: '' }),
    events,
    envToken: false,
  });
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

  const sdk = fakeClaudeSdk(script, ...later);
  const records = await openFileSessionStore(home, { now });
  // Your shell tabs (spec 036), with /bin/sh and none of the real home's profile.
  const terminal = createTerminalService({
    events,
    env: { PATH: '/usr/bin:/bin', HOME: home, SHELL: '/bin/sh' },
    home,
  });
  services.push(terminal);
  const reports: SessionReport[] = [];
  const changes: { from: string; to: string; quiet: boolean }[] = [];
  let ids = 0;
  const service = createSessionService({
    records,
    repositories: folders,
    claude,
    connection,
    jira: createJiraClient({ timeoutMs: 500 }),
    // GitHub isn't connected here; spec 015's composer starts are tested in compose.test.ts.
    context: createContextReader({
      home: tmpdir(),
      jira: createJiraClient({ timeoutMs: 500 }),
      jiraConnection: connection,
      github: createGitHubClient(),
      githubConnection: createGitHubConnection({
        settings,
        tokens,
        github: createGitHubClient(),
        gh: createGhCli({ searchPath: '' }),
        events,
        envToken: false,
      }),
    }),
    describeTicket: () => Promise.resolve(cached === null ? null : { status: null, dueDate: null, ...cached }),
    preferences: createPreferencesService({
      // The settings file, slow to answer when the test says so.
      settings: {
        read: async () => {
          await preferencesGate;
          return settings.read();
        },
        update: async (change) => {
          await saveGate;
          if (savesFail) throw new Error('disk full');
          return settings.update(change);
        },
      },
      events,
    }),
    worktrees: { env: gitEnvironment(repos.env), root: join(home, 'worktrees'), fetchTimeoutMs: 2_000 },
    changes: createChangesReader({ env: gitEnvironment(repos.env) }),
    github: githubConnection,
    githubClient: createGitHubClient({ timeoutMs: githubTimeoutMs }),
    stepEventMs: 250,
    adapter: noClaude
      ? null
      : createClaudeAdapter({
          query: sdk.query,
          program: '/opt/claude/claude',
          env: {},
          home: repos.root,
          sandbox: (worktree) =>
            sandboxSettings({ platform: 'darwin', worktree, devhubHome: home, home: repos.root, temporary: tmpdir() }),
        }),
    events,
    terminal,
    onReport: (report) => reports.push(report),
    onChange: (before, after, { quiet }) => {
      if (before.state !== after.state) changes.push({ from: before.state, to: after.state, quiet });
    },
    now,
    newId: () => {
      ids += 1;
      return ids.toString(16).padStart(16, '0');
    },
  });
  services.push(service);
  jira.use(acceptingIssue({ key: 'PROJ-1423', summary: 'Add bulk archive to the content list' }));
  return { service, records, repos, home, heard, reports, changes, sdk, folders: added, settings, terminal };
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

/** Until Claude Code has said its session id: before that, a stopped session never started (spec 013). */
async function claudeStarted(records: SessionRecords, id: string) {
  for (let tries = 0; tries < 500; tries++) {
    if ((await records.get(id))?.claudeSessionId != null) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Claude Code never started');
}

/** Waits until the session isn't Working or waiting for you any more. */
async function settled(records: SessionRecords, id = '0000000000000001') {
  for (let tries = 0; tries < 500; tries++) {
    const record = await records.get(id);
    if (record !== null && record.session.state !== 'working' && record.session.state !== 'needs_you') return record;
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
        // Spec 025: Ship's ticket is all the session was sent.
        context: [{ kind: 'jira', key: 'PROJ-1423' }],
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
    expect((await records.get('0000000000000001'))?.repository?.id).toBe(picked.id);
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
      {
        id: 'step-2',
        state: 'done',
        kind: 'brief',
        key: 'PROJ-1423',
        tickets: [],
        message: false,
        pullRequests: [],
        files: [],
        skills: [],
      },
      { id: 'step-3', state: 'done', kind: 'explore', files: ['README.md'] },
      { id: 'step-4', state: 'done', kind: 'plan', items: ['Add a toolbar button'] },
      { id: 'step-5', state: 'done', kind: 'edit', files: ['src/toolbar.ts'] },
      { id: 'step-6', state: 'done', kind: 'finished', summary: 'Added a toolbar button.' },
    ]);
    expect(record.claudeSessionId).toBe('b2c7e0f4-0000-4000-8000-000000000001');
    // The Changes tab compares the worktree with this commit (spec 013, AC-4).
    expect(record.startCommit).toBe(await repos.git(repos.clone, 'rev-parse', 'origin/main'));

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

  it('012 AC-8: an edit waits when Settings says Ask before everything, and nothing is written meanwhile', async () => {
    const { service, home, sdk } = await setUp({
      mode: 'ask_everything',
      script: [{ tool: 'Write', input: { file_path: 'a.ts', content: 'x' } }, { finish: 'Wrote it.' }],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    // From the start: the worktree comes first, which takes longer than an answer does under pnpm verify.
    await vi.waitFor(
      () => {
        expect(sdk.runs[0]?.waiting).toBe(1);
      },
      { timeout: 10_000 },
    );
    await expect(readFile(join(home, 'worktrees', '0000000000000001', 'a.ts'))).rejects.toThrow();
    expect(await service.stop('0000000000000001')).toBe('stopped');
    expect(sdk.runs[0]?.decisions[0]?.result.behavior).toBe('deny');
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
      await service.close();
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
        loaded: { tools: 8, mcpServers: 0, plugins: 0 },
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

/** Waits until the session has this many calls waiting for an answer, and gives them. */
async function waitingCalls(records: SessionRecords, count = 1, id = '0000000000000001') {
  for (let tries = 0; tries < 500; tries++) {
    const record = await records.get(id);
    if (record !== null && record.session.approvals.length === count) return record.session.approvals;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`The session never had ${String(count)} calls waiting`);
}

describe('approvals (spec 012)', () => {
  const npmTest = { command: 'npm test -- content-list', description: 'Run the content list tests' };
  const asks: readonly FakeTurn[] = [{ tool: 'Bash', input: npmTest }, { finish: 'Ran the tests.' }];

  it('AC-1: a command waits: the session is Needs you, with the call, its step, and the lists told', async () => {
    const { service, records, heard, reports } = await setUp({ script: asks });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [approval] = await waitingCalls(records);

    expect(approval).toEqual({
      id: approval?.id,
      kind: 'command',
      command: 'npm test -- content-list',
      description: 'Run the content list tests',
      alwaysAsk: null,
      alwaysAllow: null,
      askedAt: '2026-10-18T09:56:00.000Z',
    });
    const record = await records.get('0000000000000001');
    expect(record?.session.state).toBe('needs_you');
    expect(record?.session.activities.at(-1)).toMatchObject({
      kind: 'waiting',
      state: 'running',
      approvalId: approval?.id,
      about: 'command',
      text: 'Run the content list tests',
    });
    expect(heard).toContainEqual({ type: 'sessions.changed' });
    // The terminal is told once the call is saved, so the report can come just after the saved call shows.
    await vi.waitFor(() => {
      expect(reports).toContainEqual({
        what: 'asked',
        session: '0000000000000001',
        ticket: 'PROJ-1423',
        about: 'command',
      });
    });
    await service.stop('0000000000000001');
  });

  it('AC-2: Allow once runs the command, and the session works on to the end', async () => {
    const { service, records, reports } = await setUp({ script: asks });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [approval] = await waitingCalls(records);

    expect(await service.respond('0000000000000001', approval?.id ?? '', 'allow_once')).toBe('answered');

    const record = await settled(records);
    expect(record.session.state).toBe('done');
    expect(record.session.approvals).toEqual([]);
    expect(kinds(record)).toEqual(['worktree:done', 'brief:done', 'command:done', 'finished:done']);
    expect(record.approvalLog).toEqual([
      {
        id: approval?.id,
        about: 'command',
        text: 'npm test -- content-list',
        askedAt: '2026-10-18T09:56:00.000Z',
        answer: 'allow_once',
        by: 'you',
        answeredAt: '2026-10-18T09:56:00.000Z',
      },
    ]);
    expect(reports).toContainEqual({
      what: 'answered',
      session: '0000000000000001',
      ticket: 'PROJ-1423',
      about: 'command',
      answer: 'allow_once',
      by: 'you',
    });
  });

  it('AC-3: Deny shows what you denied, and Claude works on', async () => {
    const { service, records } = await setUp({ script: asks });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [approval] = await waitingCalls(records);
    await service.respond('0000000000000001', approval?.id ?? '', 'deny');

    const record = await settled(records);
    expect(record.session.state).toBe('done');
    expect(record.session.activities).toContainEqual(
      expect.objectContaining({ kind: 'denied', about: 'command', text: 'npm test -- content-list' }) as unknown,
    );
    expect(record.approvalLog[0]).toMatchObject({ answer: 'deny', by: 'you' });
  });

  it('AC-5: Always allow saves the entry first, then runs the command', async () => {
    const { service, records, settings } = await setUp({
      mode: 'edit_and_run_allowed',
      allowedCommands: ['npm test'],
      script: [{ tool: 'Bash', input: { command: 'npm run lint -- --fix' } }, { finish: 'Linted.' }],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [approval] = await waitingCalls(records);
    expect(approval).toMatchObject({ alwaysAllow: 'npm run lint' });

    expect(await service.respond('0000000000000001', approval?.id ?? '', 'always_allow')).toBe('answered');

    expect((await settings.read()).agent).toMatchObject({ allowedCommands: ['npm test', 'npm run lint'] });
    expect((await settled(records)).approvalLog[0]).toMatchObject({ answer: 'always_allow', by: 'you' });
  });

  it('AC-14: when Always allow can’t save the list, nothing is decided and the call keeps waiting', async () => {
    const { service, records } = await setUp({
      mode: 'edit_and_run_allowed',
      savesFail: true,
      script: [{ tool: 'Bash', input: { command: 'npm run lint' } }, { finish: 'Linted.' }],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [approval] = await waitingCalls(records);

    expect(await service.respond('0000000000000001', approval?.id ?? '', 'always_allow')).toBe('not_saved');

    const record = await records.get('0000000000000001');
    expect(record?.session.state).toBe('needs_you');
    expect(record?.session.approvals.map((waiting) => waiting.id)).toEqual([approval?.id]);
    expect(await service.respond('0000000000000001', approval?.id ?? '', 'allow_once')).toBe('answered');
    await settled(records);
  });

  it('Q1: refuses Always allow where it isn’t offered, and decides nothing', async () => {
    const { service, records } = await setUp({ script: asks });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [approval] = await waitingCalls(records);
    expect(await service.respond('0000000000000001', approval?.id ?? '', 'always_allow')).toBe('not_offered');
    expect((await records.get('0000000000000001'))?.session.state).toBe('needs_you');
    await service.stop('0000000000000001');
  });

  it('AC-13: the first answer counts; a late one, or one for no such call, changes nothing', async () => {
    const { service, records } = await setUp({ script: asks });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [approval] = await waitingCalls(records);
    const id = approval?.id ?? '';

    const [first, second] = await Promise.all([
      service.respond('0000000000000001', id, 'allow_once'),
      service.respond('0000000000000001', id, 'deny'),
    ]);
    expect([first, second]).toEqual(['answered', 'already_answered']);
    await settled(records);
    expect(await service.respond('0000000000000001', id, 'deny')).toBe('already_answered');
    expect(await service.respond('0000000000000001', 'no-such-call', 'deny')).toBe('not_found');
    expect(await service.respond('ffffffffffffffff', id, 'deny')).toBe('not_found');
  });

  it('AC-13: an Always allow still saving counts first; a Deny from another tab changes nothing', async () => {
    let saved: () => void = () => undefined;
    const saveGate = new Promise<void>((resolve) => {
      saved = resolve;
    });
    const { service, records, settings } = await setUp({
      mode: 'edit_and_run_allowed',
      saveGate,
      script: [{ tool: 'Bash', input: { command: 'npm run lint' } }, { finish: 'Linted.' }],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [approval] = await waitingCalls(records);
    const id = approval?.id ?? '';

    const always = service.respond('0000000000000001', id, 'always_allow');
    expect(await service.respond('0000000000000001', id, 'deny')).toBe('already_answered');
    saved();
    expect(await always).toBe('answered');

    expect((await settings.read()).agent).toMatchObject({ allowedCommands: ['npm run lint'] });
    expect((await settled(records)).approvalLog[0]).toMatchObject({ answer: 'always_allow', by: 'you' });
  });

  it('AC-10: calls asked together wait in the order asked, and the session is Needs you until both are answered', async () => {
    const { service, records } = await setUp({
      script: [
        {
          together: [
            { tool: 'Bash', input: { command: 'npm test' } },
            { tool: 'Bash', input: { command: 'npm run lint' } },
          ],
        },
        { finish: 'Done.' },
      ],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [first, second] = await waitingCalls(records, 2);
    expect([first, second].map((call) => call?.kind === 'command' && call.command)).toEqual([
      'npm test',
      'npm run lint',
    ]);

    await service.respond('0000000000000001', second?.id ?? '', 'deny');
    await waitingCalls(records, 1);
    expect((await records.get('0000000000000001'))?.session.state).toBe('needs_you');

    await service.respond('0000000000000001', first?.id ?? '', 'allow_once');
    expect((await settled(records)).session.state).toBe('done');
  });

  it('AC-11: a change in Settings applies to Claude’s next call', async () => {
    const { service, records, settings } = await setUp({
      script: [
        { tool: 'Bash', input: { command: 'npm test' } },
        { tool: 'Bash', input: { command: 'npm test' } },
        { finish: 'Ran the tests twice.' },
      ],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [approval] = await waitingCalls(records);
    await settings.update((current) => ({
      ...current,
      agent: { permissionMode: 'edit_and_run_allowed', allowedCommands: ['npm test'] },
    }));
    await service.respond('0000000000000001', approval?.id ?? '', 'allow_once');
    const record = await settled(records);
    expect(record.approvalLog).toHaveLength(1);
    expect(record.session.activities).toContainEqual(
      expect.objectContaining({ kind: 'command', commands: ['npm test', 'npm test'] }) as unknown,
    );
  });

  it.each([
    ['AC-12: Stop', 'stopped'],
    ['AC-12: Discard', 'discarded'],
    ['AC-21: Orynx closing', 'closed'],
  ] as const)('%s answers the waiting call, and its step goes', async (_, by) => {
    const { service, records } = await setUp({ script: asks });
    await service.start({ ticketKey: 'PROJ-1423' });
    await waitingCalls(records);

    if (by === 'stopped') await service.stop('0000000000000001');
    else if (by === 'discarded') await service.discard('0000000000000001');
    else await service.close();

    const record = await records.get('0000000000000001');
    expect(record?.session.state).toBe('stopped');
    expect(record?.session.approvals).toEqual([]);
    expect(record?.session.activities.some((activity) => activity.kind === 'waiting')).toBe(false);
    expect(record?.approvalLog[0]).toMatchObject({ answer: null, by });
  });

  it('AC-22: the terminal hears only kinds and answers, never the command or Claude’s line about it', async () => {
    const { service, records, reports } = await setUp({ script: asks });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [approval] = await waitingCalls(records);
    await service.respond('0000000000000001', approval?.id ?? '', 'deny');
    await settled(records);
    const told = JSON.stringify(reports);
    expect(told).not.toContain('npm test');
    expect(told).not.toContain('content list');
  });
});

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

  it('AC-9: Stop just before Claude starts means Claude never starts', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, records, sdk } = await setUp({ script: [{ hang: true }], preferencesGate: gate });
    await service.start({ ticketKey: 'PROJ-1423' });
    await hasStep(records, 'brief');

    const stopping = service.stop('0000000000000001');
    release();
    expect(await stopping).toBe('stopped');
    await service.close();

    const record = await records.get('0000000000000001');
    expect(record && kinds(record)).toEqual(['worktree:done', 'brief:done', 'stopped:done']);
    expect(sdk.runs).toEqual([]);
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

describe('telling the notifications (spec 029)', () => {
  it('AC-19: each change of state reaches the hook; Stop by you is not quiet', async () => {
    const { service, records, changes } = await setUp({ script: [{ hang: true }] });
    await service.start({ ticketKey: 'PROJ-1423' });
    await hasStep(records, 'brief');

    await service.stop('0000000000000001');

    expect(changes).toContainEqual({ from: 'working', to: 'stopped', quiet: false });
  });

  it('Discard and closing Orynx stop a working session quietly', async () => {
    const discarded = await setUp({ script: [{ hang: true }] });
    await discarded.service.start({ ticketKey: 'PROJ-1423' });
    await hasStep(discarded.records, 'brief');
    await discarded.service.discard('0000000000000001');

    const closed = await setUp({ script: [{ hang: true }] });
    await closed.service.start({ ticketKey: 'PROJ-1423' });
    await hasStep(closed.records, 'brief');
    await closed.service.close();

    for (const { changes } of [discarded, closed]) {
      expect(changes.filter((change) => change.to === 'stopped').every((change) => change.quiet)).toBe(true);
      expect(changes.some((change) => change.to === 'stopped')).toBe(true);
    }
  });
});

describe('discarding a session', () => {
  it('AC-28 (036): ends every shell in the session’s Terminal before the worktree goes', async () => {
    const { service, records, terminal, home } = await setUp();
    await service.start({ ticketKey: 'PROJ-1423' });
    const worktree = (await settled(records)).worktree ?? '';
    terminal.read('0000000000000001', worktree);
    let screen = '';
    terminal.listen('0000000000000001', 'tab-1', (frame) => (screen += frame.data));
    // As the shell ends, it writes down whether its worktree was still there.
    terminal.write(
      '0000000000000001',
      'tab-1',
      `trap '[ -d "$PWD" ] && echo there > "$HOME/at-stop"; exit 1' HUP; echo re""ady\r`,
    );
    for (let tries = 0; tries < 500 && !screen.includes('ready\r\n'); tries++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(await service.discard('0000000000000001')).toBe('discarded');

    expect(await readFile(join(home, 'at-stop'), 'utf8')).toBe('there\n');
    expect(terminal.listen('0000000000000001', 'tab-1', () => undefined)).toBeNull();
  });

  it('AC-3 (036): says the Terminal opens on a Build with a worktree, and not once it’s discarded', async () => {
    const { service, records } = await setUp();
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    expect((await service.get('0000000000000001'))?.terminal).toBe(true);
    await service.discard('0000000000000001');
    expect((await service.get('0000000000000001'))?.terminal).toBe(false);
  });

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

  it('AC-6: says the files changed once the worktree is gone, so every Changes tab reads again', async () => {
    const { service, records, heard } = await setUp();
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    const before = heard.length;

    await service.discard('0000000000000001');

    expect(heard.slice(before)).toContainEqual({ type: 'session.files.changed', sessionId: '0000000000000001' });
    expect(await service.changes('0000000000000001')).toEqual({ state: 'discarded' });
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
    // Until Claude Code has started: closing before that means it never starts, which another test covers.
    for (let tries = 0; tries < 500 && sdk.runs.length === 0; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await service.close();
    const record = await records.get('0000000000000001');
    expect(record?.session.state).toBe('stopped');
    expect(record && kinds(record)).toEqual(['worktree:done', 'brief:done', 'interrupted:done']);
    expect(sdk.runs[0]?.interrupts).toBe(1);
  });
});

/** Waits until the session's steps include one of `kind`. */
async function reached(records: SessionRecords, kind: string, id = '0000000000000001') {
  for (let tries = 0; tries < 500; tries++) {
    const record = await records.get(id);
    if (record?.session.activities.some((activity) => activity.kind === kind) === true) return record;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`The session never reached ${kind}`);
}

const edit = (file: string): FakeTurn => ({ tool: 'Write', input: { file_path: file, content: 'x\n' } });

describe('follow-ups (spec 013)', () => {
  const id = '0000000000000001';

  it('AC-12: a message sent while Claude works reaches it, shows as a step, and leaves the state and stepper as they were', async () => {
    let letGo: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    const { service, records, sdk } = await setUp({
      script: [
        { tool: 'Read', input: { file_path: 'README.md' } },
        { waitForMessage: true },
        { gate },
        edit('src/a.ts'),
        { finish: 'Used it.' },
      ],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    await reached(records, 'explore');

    expect(await service.send(id, 'Use the existing useSelection hook instead')).toEqual({ result: 'sent' });
    const sent = await records.get(id);
    expect(sent?.session).toMatchObject({ state: 'working', step: 'plan' });
    expect(sent?.session.activities.at(-1)).toMatchObject({
      kind: 'message',
      text: 'Use the existing useSelection hook instead',
    });
    letGo();

    const done = await settled(records);
    expect(kinds(done)).toEqual([
      'worktree:done',
      'brief:done',
      'explore:done',
      'message:done',
      'edit:done',
      'finished:done',
    ]);
    expect(sdk.runs).toHaveLength(1);
    expect(sdk.runs[0]?.prompts.at(-1)).toBe('Use the existing useSelection hook instead');
  });

  it('AC-11: after Done, resumes Claude Code’s own session in the same worktree: Working, back to Build, then Done again', async () => {
    const { service, records, sdk, home, heard } = await setUp({
      script: [edit('src/a.ts'), { finish: 'First.' }],
      later: [[edit('src/b.ts'), { finish: 'Used the existing hook.' }]],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    const first = await settled(records);
    expect(first.session).toMatchObject({ state: 'done', step: 'review' });
    heard.length = 0;

    expect(await service.send(id, 'Use the existing useSelection hook instead')).toEqual({ result: 'sent' });
    const resumed = await records.get(id);
    expect(resumed?.session).toMatchObject({ state: 'working', step: 'build', problem: null, endedAt: null });
    expect(resumed?.session.runStartedAt).not.toBeNull();
    expect(heard).toContainEqual({ type: 'sessions.changed' });

    const again = await settled(records);
    expect(again.session).toMatchObject({ state: 'done', step: 'review' });
    expect(again.session.activities.slice(-3)).toEqual([
      {
        id: expect.any(String) as unknown,
        state: 'done',
        kind: 'message',
        text: 'Use the existing useSelection hook instead',
      },
      { id: expect.any(String) as unknown, state: 'done', kind: 'edit', files: ['src/b.ts'] },
      { id: expect.any(String) as unknown, state: 'done', kind: 'finished', summary: 'Used the existing hook.' },
    ]);
    expect(sdk.runs[1]?.options).toMatchObject({
      resume: 'b2c7e0f4-0000-4000-8000-000000000001',
      cwd: join(home, 'worktrees', id),
    });
    expect(sdk.runs[1]?.prompts).toEqual(['Use the existing useSelection hook instead']);
  });

  it('AC-13: carries on after you stopped Claude, and after it stopped with an error once it was working', async () => {
    const stopped = await setUp({
      script: [{ tool: 'Read', input: { file_path: 'README.md' } }, { hang: true }],
      later: [[{ finish: 'Carried on.' }]],
    });
    await stopped.service.start({ ticketKey: 'PROJ-1423' });
    await reached(stopped.records, 'explore');
    await stopped.service.stop(id);
    expect(await stopped.service.send(id, 'Carry on')).toEqual({ result: 'sent' });
    expect((await settled(stopped.records)).session).toMatchObject({ state: 'done', problem: null });

    const limited = await setUp({
      script: [
        { tool: 'Read', input: { file_path: 'README.md' } },
        { message: { type: 'assistant', parent_tool_use_id: null, error: 'rate_limit', message: { content: [] } } },
      ],
      later: [[{ finish: 'Carried on.' }]],
    });
    await limited.service.start({ ticketKey: 'PROJ-1423' });
    expect((await settled(limited.records)).session.problem).toEqual({ kind: 'limit', stage: 'working' });
    expect(await limited.service.send(id, 'Try again')).toEqual({ result: 'sent' });
    expect(await limited.records.get(id)).toMatchObject({ session: { problem: null } });
    expect((await settled(limited.records)).session).toMatchObject({ state: 'done', problem: null });
  });

  it('AC-14: refuses when the changes were discarded, Claude never started, or the ticket has a newer live session', async () => {
    const discarded = await setUp();
    await discarded.service.start({ ticketKey: 'PROJ-1423' });
    await settled(discarded.records);
    await discarded.service.discard(id);
    expect(await discarded.service.send(id, 'More')).toEqual({ result: 'cannot_send', reason: 'discarded' });

    const neverStarted = await setUp({ noClaude: true });
    await neverStarted.service.start({ ticketKey: 'PROJ-1423' });
    await settled(neverStarted.records);
    expect(await neverStarted.service.send(id, 'More')).toEqual({ result: 'cannot_send', reason: 'never_started' });

    const newer = await setUp({ script: [{ tool: 'Read', input: { file_path: 'README.md' } }, { hang: true }] });
    await newer.service.start({ ticketKey: 'PROJ-1423' });
    await reached(newer.records, 'explore');
    await newer.service.stop(id);
    await newer.service.start({ ticketKey: 'PROJ-1423' });
    expect(await newer.service.send(id, 'More')).toEqual({ result: 'cannot_send', reason: 'newer_session' });
    await newer.service.close();
  });

  it('AC-15: refuses a follow-up that would make a fourth working session, and sends nothing', async () => {
    const { service, records, sdk } = await setUp({ script: [{ hang: true }] });
    jira.use(acceptingIssue([{ key: 'PROJ-1' }, { key: 'PROJ-2' }, { key: 'PROJ-3' }, { key: 'PROJ-4' }]));
    const first = await service.start({ ticketKey: 'PROJ-1' });
    // Stopped once Claude has started, so it has something to carry on.
    await claudeStarted(records, id);
    await service.stop(id);
    for (const key of ['PROJ-2', 'PROJ-3', 'PROJ-4']) {
      const started = await service.start({ ticketKey: key });
      await briefed(records, started.result === 'started' ? started.sessionId : '');
    }
    expect(first).toMatchObject({ result: 'started' });
    const runs = sdk.runs.length;
    expect(await service.send(id, 'More')).toEqual({ result: 'cannot_send', reason: 'too_many' });
    expect(sdk.runs).toHaveLength(runs);
    await service.close();
  });

  it("AC-16: a follow-up Claude Code can't resume stops the session with the resume problem, keeping its steps", async () => {
    const { service, records, sdk } = await setUp({ script: [edit('src/a.ts'), { finish: 'First.' }] });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    sdk.onResume = 'no_conversation';
    expect(await service.send(id, 'More')).toEqual({ result: 'sent' });
    const record = await settled(records);
    expect(record.session).toMatchObject({ state: 'stopped', problem: { kind: 'resume', stage: 'working' } });
    expect(kinds(record).slice(0, 4)).toEqual(['worktree:done', 'brief:done', 'edit:done', 'finished:done']);
  });

  it("Q3: adds up Claude's working time over each run, and counts nothing while it waits for you to follow up", async () => {
    let time = clock;
    let letGo: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    const { service, records } = await setUp({
      now: () => time,
      script: [
        { tool: 'Read', input: { file_path: 'README.md' } },
        { waitForMessage: true },
        { tool: 'Read', input: { file_path: 'README.md' } },
        { finish: 'First.' },
      ],
      later: [[{ gate }, { finish: 'Second.' }]],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    await reached(records, 'explore');
    time += 60_000;
    await service.send(id, 'Finish up');
    expect((await settled(records)).session).toMatchObject({ workedMs: 60_000, runStartedAt: null });
    time += 600_000;
    await service.send(id, 'One more thing');
    expect((await records.get(id))?.session.runStartedAt).toBe(new Date(time).toISOString());
    time += 30_000;
    letGo();
    expect((await settled(records)).session).toMatchObject({ workedMs: 90_000, runStartedAt: null });
  });

  it('AC-2, AC-23: says the files changed at most once a second, with the session’s id only', async () => {
    const { service, records, heard } = await setUp({
      script: [edit('src/a.ts'), edit('src/b.ts'), edit('src/c.ts'), { finish: 'Done.' }],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    await vi.waitFor(
      () => {
        expect(heard.filter((event) => event.type === 'session.files.changed')).toHaveLength(2);
      },
      { timeout: 3_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(heard.filter((event) => event.type === 'session.files.changed')).toEqual([
      { type: 'session.files.changed', sessionId: id },
      { type: 'session.files.changed', sessionId: id },
    ]);
  });

  it('AC-23: the terminal hears that a follow-up went, never what it said', async () => {
    const { service, records, reports } = await setUp({
      script: [{ finish: 'First.' }],
      later: [[{ finish: 'Again.' }]],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    await service.send(id, 'a secret plan for the toolbar');
    await settled(records);
    expect(reports).toContainEqual({ what: 'followed_up', session: id, ticket: 'PROJ-1423', resumed: true });
    expect(JSON.stringify(reports)).not.toContain('secret plan');
  });

  it('answers not found for a session it has never heard of', async () => {
    const { service } = await setUp();
    expect(await service.send('ffffffffffffffff', 'More')).toEqual({ result: 'not_found' });
  });
});

describe('the session detail (spec 013)', () => {
  const id = '0000000000000001';

  it('AC-9: keeps the ticket as Claude got it, with its status and due date from the cache', async () => {
    const { service, records } = await setUp({
      cached: {
        title: 'Add bulk archive',
        sprint: 'Sprint 42',
        status: { name: 'In progress', column: 'in_progress' },
        dueDate: '2026-10-16',
      },
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    expect((await service.get(id))?.ticket).toEqual({
      type: 'Story',
      description: expect.stringContaining('Checkbox on each row') as unknown,
      status: { name: 'In progress', column: 'in_progress' },
      dueDate: '2026-10-16',
      deleted: false,
    });
    expect((await records.get(id))?.session.ticket).toMatchObject({ status: null, dueDate: null });
  });

  it('AC-9: leaves out the status and due date when the cache doesn’t have the ticket', async () => {
    const { service, records } = await setUp({ cached: null });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    expect((await service.get(id))?.ticket).toMatchObject({ type: 'Story', status: null, dueDate: null });
  });

  it('AC-9: reads the ticket back from brief.md for a session saved before spec 013', async () => {
    const { service, records } = await setUp();
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    await records.update(id, (record) => ({ ...record, session: { ...record.session, ticket: null } }));
    expect((await service.get(id))?.ticket).toMatchObject({
      type: 'Story',
      description: expect.stringContaining('Checkbox on each row') as unknown,
    });
  });

  it('says what the finished session is ready for, from what Claude did (spec 031)', async () => {
    const answered = await setUp();
    await answered.service.start({ ticketKey: 'PROJ-1423' });
    await settled(answered.records);
    expect(await answered.service.get(id)).toMatchObject({ state: 'done', ready: 'nothing' });

    const edited = await setUp({
      script: [{ tool: 'Write', input: { file_path: 'src/toolbar.ts', content: 'x\n' } }, { finish: 'Added it.' }],
    });
    await edited.service.start({ ticketKey: 'PROJ-1423' });
    await settled(edited.records);
    expect(await edited.service.get(id)).toMatchObject({ state: 'done', ready: 'pull_request' });
  });

  it('AC-14: says the follow-up box is open, or why not', async () => {
    const done = await setUp();
    await done.service.start({ ticketKey: 'PROJ-1423' });
    await settled(done.records);
    expect((await done.service.get(id))?.followUp).toEqual({ kind: 'open' });
    await done.service.discard(id);
    expect((await done.service.get(id))?.followUp).toEqual({ kind: 'discarded' });

    const neverStarted = await setUp({ noClaude: true });
    await neverStarted.service.start({ ticketKey: 'PROJ-1423' });
    await settled(neverStarted.records);
    expect((await neverStarted.service.get(id))?.followUp).toEqual({ kind: 'never_started' });

    const newer = await setUp({ script: [{ tool: 'Read', input: { file_path: 'README.md' } }, { hang: true }] });
    await newer.service.start({ ticketKey: 'PROJ-1423' });
    await reached(newer.records, 'explore');
    await newer.service.stop(id);
    await newer.service.start({ ticketKey: 'PROJ-1423' });
    expect((await newer.service.get(id))?.followUp).toEqual({ kind: 'newer_session', sessionId: '0000000000000002' });
    expect((await newer.service.get('0000000000000002'))?.followUp).toEqual({ kind: 'open' });
    await newer.service.close();
  });

  it('AC-20: gives the worktree’s path once it’s made, and none once the changes are discarded', async () => {
    const { service, records, home } = await setUp();
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    expect((await service.get(id))?.worktreePath).toBe(join(home, 'worktrees', id));
    await service.discard(id);
    expect((await service.get(id))?.worktreePath).toBeNull();
  });
});

describe('the pull request (spec 014)', () => {
  const id = '0000000000000001';
  const asked = { title: 'PROJ-1423: Add bulk archive to the content list', body: 'What changed.' };

  /** origin reads as github.com, a push goes to the bare repository, and git has your name. */
  async function onGitHub(repos: Awaited<ReturnType<typeof setUp>>['repos']) {
    await repos.git(repos.clone, 'remote', 'set-url', 'origin', 'git@github.com:acme/web-app.git');
    await repos.git(repos.clone, 'config', `url.${repos.origin}.pushInsteadOf`, 'git@github.com:acme/web-app.git');
    await writeFile(
      join(repos.root, '.gitconfig'),
      '[init]\n\tdefaultBranch = main\n[user]\n\tname = Rakesh D\n\temail = you@company.com\n',
    );
  }

  it('AC-2, AC-4: drafts and creates the pull request: PR open, heard by the lists and the Session screen', async () => {
    const { service, records, repos, home, heard, reports } = await setUp({
      script: [edit('src/a.ts'), { finish: 'Added row selection.' }],
      later: [[{ finish: 'Add bulk archive\n\nRow selection.' }]],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    await onGitHub(repos);
    await writeFile(join(home, 'worktrees', id, 'README.md'), '# web-app\n\nBulk archive.\n');
    const opened: FakeOpenedPull[] = [];
    jira.use(...acceptingPulls({ opened }), acceptingRepository());

    expect(await service.draftPullRequest(id)).toMatchObject({
      result: 'draft',
      title: 'PROJ-1423: Add bulk archive',
      byClaude: true,
      files: 1,
      repository: 'acme/web-app',
      base: 'main',
    });
    heard.length = 0;
    expect(await service.createPullRequest(id, asked)).toMatchObject({ result: 'opened', number: 2841 });
    expect(await service.get(id)).toMatchObject({
      state: 'pr_open',
      step: 'pull_request',
      pullRequest: { number: 2841, repository: 'acme/web-app' },
    });
    expect(heard).toContainEqual({ type: 'sessions.changed' });
    expect(heard).toContainEqual({ type: 'session.changed', sessionId: id });
    expect(reports).toContainEqual({
      what: 'pull_request',
      session: id,
      ticket: 'PROJ-1423',
      step: 'create',
      outcome: 'opened',
      number: 2841,
    });
  });

  it('AC-19: a follow-up once the pull request is open ends PR open, not Done', async () => {
    const { service, records } = await setUp({
      script: [edit('src/a.ts'), { finish: 'First.' }],
      later: [[edit('src/b.ts'), { finish: 'Used the existing hook.' }]],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    await records.update(id, (current) => ({
      ...current,
      session: {
        ...current.session,
        state: 'pr_open',
        step: 'pull_request',
        pullRequest: makeSessionPullRequest(),
      },
    }));

    expect(await service.send(id, 'Use the existing useSelection hook instead')).toEqual({ result: 'sent' });
    expect((await records.get(id))?.session).toMatchObject({ state: 'working', step: 'build' });
    expect((await settled(records)).session).toMatchObject({ state: 'pr_open', step: 'review' });
  });

  it('026: once a run ends, the pull request Claude opened from the branch is saved, linked, as PR open', async () => {
    const { service, records, repos } = await setUp({
      script: [edit('src/a.ts'), { finish: 'First.' }],
      later: [[{ finish: 'Opened the pull request.' }]],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    await onGitHub(repos);
    const branch = (await records.get(id))?.session.branch ?? '';
    const opened: FakeOpenedPull[] = [
      { owner: 'acme', repository: 'web-app', number: 2944, head: branch, base: 'main', title: 'Claude’s', body: '' },
    ];
    jira.use(...acceptingPulls({ opened }));

    expect(await service.send(id, 'Open the pull request')).toEqual({ result: 'sent' });
    await vi.waitFor(
      async () => {
        expect((await records.get(id))?.session).toMatchObject({ state: 'pr_open', pullRequest: { number: 2944 } });
      },
      { timeout: 5_000 },
    );
  });

  it('AC-14: Claude finishing, and a follow-up finishing, push nothing', async () => {
    const { service, records, repos } = await setUp({
      script: [edit('src/a.ts'), { finish: 'First.' }],
      later: [[{ finish: 'Again.' }]],
    });
    await onGitHub(repos);
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    await service.send(id, 'Carry on');
    await settled(records);
    expect(await repos.git(repos.origin, 'branch', '--list', 'feat/*')).toBe('');
  });

  it('AC-18: Discard waits for a push under way, then deletes only the worktree and the local branch', async () => {
    const { service, records, repos, home } = await setUp({
      script: [edit('src/a.ts'), { finish: 'First.' }],
      // GitHub is held longer than a discard that didn't wait would take.
      githubTimeoutMs: 10_000,
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    await onGitHub(repos);
    await writeFile(join(home, 'worktrees', id, 'README.md'), 'changed\n');
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    jira.use(
      acceptingRepository(),
      http.post(pullsUrl, async () => {
        await held;
        return HttpResponse.json(
          { number: 2841, html_url: 'https://github.com/acme/web-app/pull/2841' },
          { status: 201 },
        );
      }),
    );

    const order: string[] = [];
    const creating = service.createPullRequest(id, asked).then((answer) => {
      order.push('created');
      return answer;
    });
    // Until git has pushed and GitHub is asked.
    for (let tries = 0; tries < 500; tries++) {
      if ((await repos.git(repos.origin, 'branch', '--list', 'feat/*')) !== '') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const discarding = service.discard(id).then((answer) => {
      order.push('discarded');
      return answer;
    });
    // Long enough for a discard that didn't wait to delete the worktree and finish.
    await Promise.race([discarding, new Promise((resolve) => setTimeout(resolve, 1_500))]);
    expect(order).toEqual([]);
    release();
    expect(await creating).toMatchObject({ result: 'opened' });
    expect(await discarding).toBe('discarded');
    expect(order).toEqual(['created', 'discarded']);
    const discarded = await service.get(id);
    expect(discarded).toMatchObject({ state: 'stopped', pullRequest: { number: 2841 } });
    expect(discarded?.discardedAt).not.toBeNull();
    expect(await repos.git(repos.origin, 'branch', '--list', 'feat/*')).toContain('feat/PROJ-1423');
    expect(await repos.git(repos.clone, 'branch', '--list', 'feat/*')).toBe('');
  });

  it('AC-20: a PR-open session is still PR open, with its link, after Orynx restarts', async () => {
    const { service, records, home } = await setUp({ script: [edit('src/a.ts'), { finish: 'First.' }] });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    await records.update(id, (current) => ({
      ...current,
      session: { ...current.session, state: 'pr_open', step: 'pull_request', pullRequest: makeSessionPullRequest() },
    }));
    const reopened = await openFileSessionStore(home);
    expect((await reopened.get(id))?.session).toMatchObject({
      state: 'pr_open',
      pullRequest: { number: 2841, url: 'https://github.com/acme/web-app/pull/2841' },
    });
  });
});

describe('Claude’s commands (spec 036)', () => {
  const failingTests: FakeTurn = {
    tool: 'Bash',
    input: { command: 'npm test' },
    output: '\u001b[31m FAIL  src/a.test.ts\u001b[0m\nTests: 1 failed',
    fails: true,
  };

  it('AC-19, AC-20: keeps each command Claude ran, with its output, and says the session changed', async () => {
    const { service, records, heard } = await setUp({
      script: [failingTests, { finish: 'Ran the tests.' }],
      mode: 'edit_and_run_allowed',
      allowedCommands: ['npm test'],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);

    expect(await service.commands('0000000000000001')).toEqual({
      commands: [
        {
          id: 'toolu_1',
          state: 'failed',
          command: 'npm test',
          output: [' FAIL  src/a.test.ts', 'Tests: 1 failed'],
          cut: false,
          // The adapter here runs on the real clock; claude-adapter.test.ts checks the time itself.
          ms: expect.any(Number) as unknown,
        },
      ],
    });
    expect(heard).toContainEqual({ type: 'session.changed', sessionId: '0000000000000001' });
  });

  it('AC-22: keeps a command you denied as denied', async () => {
    const { service, records } = await setUp({ script: [failingTests, { finish: 'Skipped them.' }] });
    await service.start({ ticketKey: 'PROJ-1423' });
    const [approval] = await waitingCalls(records);
    await service.respond('0000000000000001', approval?.id ?? '', 'deny');
    await settled(records);

    expect((await service.commands('0000000000000001'))?.commands).toEqual([
      { id: 'denied-1', state: 'denied', command: 'npm test' },
    ]);
  });

  it('AC-19: a command still running when you press Stop Claude is stopped', async () => {
    const { service, records } = await setUp({
      script: [{ tool: 'Bash', input: { command: 'npm run dev' }, hangs: true }],
      mode: 'edit_and_run_allowed',
      allowedCommands: ['npm run dev'],
    });
    await service.start({ ticketKey: 'PROJ-1423' });
    for (let tries = 0; tries < 500; tries++) {
      if ((await records.get('0000000000000001'))?.commandLog.length === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect((await service.commands('0000000000000001'))?.commands).toEqual([
      { id: 'toolu_1', state: 'running', command: 'npm run dev' },
    ]);

    await service.stop('0000000000000001');
    expect((await service.commands('0000000000000001'))?.commands).toEqual([
      { id: 'toolu_1', state: 'stopped', command: 'npm run dev' },
    ]);
  });

  it('AC-24: a session with no commands has none, and there are none for a session that doesn’t exist', async () => {
    const { service, records } = await setUp();
    await service.start({ ticketKey: 'PROJ-1423' });
    await settled(records);
    expect(await service.commands('0000000000000001')).toEqual({ commands: [] });
    expect(await service.commands('ffffffffffffffff')).toBeNull();
  });
});
