import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { acceptingIssue, goodToken, jiraEmail, jiraSite } from '../test/fake-jira.ts';
import { useTestRepositories } from '../test/git-repository.ts';
import { createMemorySessionStore } from './session-store.ts';
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
afterEach(async () => {
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
}

async function setUp({
  login = 'signed_in',
  moreFolders = 0,
  folder = true,
  script = [{ finish: 'Done.' }],
  cached = { title: 'Add bulk archive', sprint: 'Sprint 42' },
}: SetUpOptions = {}) {
  const repos = await repositories();
  const home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-session-home-')));
  homes.push(home);
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));

  const settings = createMemorySettingsStore({ jira: { site: jiraSite, email: jiraEmail } });
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
  const records = createMemorySessionStore();
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
    adapter: createClaudeAdapter({ query: sdk.query, program: '/opt/claude/claude', env: {}, home: repos.root }),
    events,
    onReport: (report) => reports.push(report),
    now: () => clock,
    newId: () => {
      ids += 1;
      return ids.toString(16).padStart(16, '0');
    },
  });
  jira.use(acceptingIssue({ key: 'PROJ-1423', summary: 'Add bulk archive to the content list' }));
  return { service, records, repos, home, heard, reports, sdk, folders: added, settings };
}

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
  });

  it('AC-1: uses the key as the title when the cache doesn’t know the ticket yet', async () => {
    const { service, records } = await setUp({ cached: null });
    await service.start({ ticketKey: 'PROJ-1423' });
    expect((await records.get('0000000000000001'))?.session).toMatchObject({ title: 'PROJ-1423', sprint: null });
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
    for (const key of ['PROJ-1', 'PROJ-2', 'PROJ-3']) {
      expect(await service.start({ ticketKey: key })).toMatchObject({ result: 'started' });
    }
    expect(await service.start({ ticketKey: 'PROJ-4' })).toEqual({ result: 'cannot_start', reason: 'too_many' });
    expect(await records.list()).toHaveLength(3);
    await service.close();
  });

  it('AC-1: opens the ticket’s live session instead of starting a second one', async () => {
    const { service, records } = await setUp({ script: [{ hang: true }] });
    const first = await service.start({ ticketKey: 'PROJ-1423' });
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
    await service.close();
  });
});
