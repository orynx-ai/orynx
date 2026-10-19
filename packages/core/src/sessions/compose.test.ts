import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ComposerChip, ServerEvent } from '@devhub/contracts';
import { makeComposerStart, makeRepository } from '@devhub/contracts/testing';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { createClaudeAdapter } from '../agents/claude/claude-adapter.ts';
import { createClaudeCode } from '../agents/claude/claude-code.ts';
import { createClaudeLogin } from '../agents/claude/claude-login.ts';
import { sandboxSettings } from '../agents/claude/sandbox.ts';
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
import { acceptingPullContext, acceptingPullDiff, githubToken } from '../test/fake-github.ts';
import { acceptingIssue, goodToken, jiraEmail, jiraSite } from '../test/fake-jira.ts';
import { useTestRepositories } from '../test/git-repository.ts';
import { briefText, composerBrief, type BriefChip } from './brief.ts';
import { createChangesReader } from './changes.ts';
import { chooseFolder, composerPlan } from './compose.ts';
import { createContextReader } from './context-reader.ts';
import { openFileSessionStore } from './file-session-store.ts';
import type { SessionRecords } from './session-store.ts';
import { createSessionService } from './session-service.ts';

vi.setConfig({ testTimeout: 15_000 });

const proj = makeRepository({ id: '00000000000000aa', name: 'web-app', jiraProject: 'PROJ' });
const api = makeRepository({ id: '00000000000000bb', name: 'api', path: '/Users/priya/code/api', jiraProject: null });
const ticketChip = { kind: 'jira', key: 'PROJ-1423' } as const;
const pullChip = { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 } as const;
const fileChip = { kind: 'file', name: 'notes.md', text: '# Notes\n\nExport every column.' } as const;

describe('which folder a composer start works in (spec 015, Q7)', () => {
  const start = (change: { repositoryId?: string; context?: ComposerChip[] }) => {
    const { repositoryId: _id, ...body } = makeComposerStart();
    return { ...body, ...change };
  };

  it.each([
    ['the folder the page sent', [proj, api], start({ repositoryId: api.id }), api],
    ['the ticket project’s only folder', [proj, api], start({ context: [ticketChip] }), proj],
    ['the only folder there is', [api], start({}), api],
    ['nothing, with no folders at all', [], start({ repositoryId: api.id }), 'no_folder'],
    ['nothing, for a folder that’s gone', [proj], start({ repositoryId: api.id }), 'choose_folder'],
    ['nothing, with two folders and no ticket', [proj, api], start({}), 'choose_folder'],
    ['nothing, with no folder for the ticket’s project', [api], start({ context: [ticketChip] }), 'choose_folder'],
  ] as const)('AC-17, AC-18: picks %s', (_case, folders, request, folder) => {
    expect(chooseFolder(folders, request)).toEqual(folder);
  });
});

describe('what a composer start makes (spec 015, Q8)', () => {
  const ticket: BriefChip = {
    kind: 'jira',
    key: 'PROJ-1423',
    summary: 'Add bulk archive',
    type: 'Story',
    description: null,
    comments: [],
    links: [],
  };

  it('AC-4: names a session with no ticket from your message, on its own branch, with Claude told to do what you ask', () => {
    expect(composerPlan('Add a CSV export to the reports page', [fileChip])).toMatchObject({
      title: 'Add a CSV export to the reports page',
      ticket: null,
      plan: {
        branchName: 'add-a-csv-export-to',
        briefStep: { key: null, message: true, pullRequests: [], files: ['notes.md'] },
        ticketNote: false,
      },
    });
  });

  it('AC-8, AC-20: takes a ticket’s summary and key, and points Claude at the ticket only when it is the whole brief', () => {
    expect(composerPlan('', [ticket])).toMatchObject({
      title: 'Add bulk archive',
      plan: { branchName: 'PROJ-1423', briefStep: { key: 'PROJ-1423', message: false }, ticketNote: true },
    });
    expect(composerPlan('Only the tests', [ticket]).plan.ticketNote).toBe(false);
  });
});

/** Jira and GitHub, the outside services, faked for this file only. */
const outside = setupServer();
beforeAll(() => {
  outside.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  outside.resetHandlers();
});
afterAll(() => {
  outside.close();
});

const repositories = useTestRepositories();
const claudeFolder = useFakeClaudeFolder();
const homes: string[] = [];
const services: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

const clock = Date.parse('2026-10-18T09:56:00.000Z');

async function setUp({
  login = 'signed_in',
  script = [{ finish: 'Done.' }],
  folders = true,
}: { login?: 'signed_in' | 'signed_out'; script?: readonly FakeTurn[]; folders?: boolean } = {}) {
  const repos = await repositories();
  const home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-compose-home-')));
  homes.push(home);
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));
  const settings = createMemorySettingsStore({
    jira: { site: jiraSite, email: jiraEmail },
    github: { method: 'token' },
    agent: { permissionMode: 'edit_freely_ask_commands', allowedCommands: [] },
  });
  const tokens = createTokenStore({
    keychain: createMemoryKeychain({ jira: goodToken, github: githubToken }),
    events,
  });
  const jira = createJiraClient({ timeoutMs: 500 });
  const github = createGitHubClient({ timeoutMs: 500 });
  const connection = createJiraConnection({ settings, tokens, jira, events, envToken: false });
  const service = createRepositoryService({ settings, events, home: repos.root, devhubHome: home });
  const added = folders ? [await service.add({ path: repos.clone, jiraProject: 'PROJ' })] : [];

  const fakeClaude = await claudeFolder();
  await fakeClaude.install({ kind: login });
  const sdk = fakeClaudeSdk(script, script, script, script);
  const records = await openFileSessionStore(home, { now: () => clock });
  let ids = 0;
  const sessions = createSessionService({
    records,
    repositories: service,
    claude: createClaudeLogin({
      claudeCode: createClaudeCode({ program: fakeClaude.program, env: {}, workFolder: fakeClaude.workFolder }),
      events,
    }),
    connection,
    jira,
    context: createContextReader({
      jira,
      jiraConnection: connection,
      github,
      githubConnection: createGitHubConnection({
        settings,
        tokens,
        github,
        gh: createGhCli({ searchPath: '' }),
        events,
        envToken: false,
      }),
    }),
    describeTicket: () =>
      Promise.resolve({ title: 'Add bulk archive', sprint: 'Sprint 42', status: null, dueDate: null }),
    preferences: createPreferencesService({ settings, events }),
    worktrees: { env: gitEnvironment(repos.env), root: join(home, 'worktrees'), fetchTimeoutMs: 2_000 },
    changes: createChangesReader({ env: gitEnvironment(repos.env) }),
    adapter: createClaudeAdapter({
      query: sdk.query,
      program: '/opt/claude/claude',
      env: {},
      home: repos.root,
      sandbox: (worktree) =>
        sandboxSettings({ platform: 'darwin', worktree, devhubHome: home, home: repos.root, temporary: tmpdir() }),
    }),
    events,
    now: () => clock,
    newId: () => {
      ids += 1;
      return ids.toString(16).padStart(16, '0');
    },
  });
  services.push(sessions);
  outside.use(
    acceptingIssue({ key: 'PROJ-1423', summary: 'Add bulk archive to the content list', type: 'Story' }),
    acceptingPullContext([
      { number: 2836, title: 'Lazy-load the people directory', base: 'main', head: 'feat/lazy-people', body: null },
    ]),
    acceptingPullDiff([{ number: 2836, diff: 'diff --git a/a.ts b/a.ts\n+x' }]),
  );
  return { sessions, records, home, heard, sdk, folder: added[0] };
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

/** Waits until Claude has been sent the brief and has started. */
async function started(records: SessionRecords, id: string) {
  for (let tries = 0; tries < 500; tries++) {
    if ((await records.get(id))?.claudeSessionId != null) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Claude Code never started');
}

/** Nothing was made: no new session or worktree, and no tab was told of one since `heardBefore` events. */
async function nothingMade({ records, home, heard }: Awaited<ReturnType<typeof setUp>>, before = 0, heardBefore = 0) {
  expect(await records.list()).toHaveLength(before);
  const worktrees = await readdir(join(home, 'worktrees')).catch(() => []);
  expect(worktrees).toHaveLength(before);
  expect(heard.slice(heardBefore).filter((event) => event.type === 'sessions.changed')).toEqual([]);
}

describe('a composer start that can’t happen (spec 015)', () => {
  it('AC-23 (Q9): a ticket with a live session answers with it, and makes nothing', async () => {
    const set = await setUp();
    await set.sessions.start({ ticketKey: 'PROJ-1423' });
    await settled(set.records);
    const heardBefore = set.heard.length;

    const answer = await set.sessions.start(makeComposerStart({ message: 'Only the tests', context: [ticketChip] }));

    expect(answer).toEqual({ result: 'existing', sessionId: '0000000000000001' });
    await nothingMade(set, 1, heardBefore);
  });

  it('AC-22: Claude Code signed out makes nothing', async () => {
    const set = await setUp({ login: 'signed_out' });
    expect(await set.sessions.start(makeComposerStart({ repositoryId: set.folder?.id }))).toEqual({
      result: 'cannot_start',
      reason: 'signed_out',
    });
    await nothingMade(set);
  });

  it('AC-22: a fourth working session makes nothing', async () => {
    const set = await setUp({ script: [{ hang: true }] });
    for (const n of [1, 2, 3]) {
      const answer = await set.sessions.start(
        makeComposerStart({ message: `Task ${String(n)}`, repositoryId: set.folder?.id }),
      );
      expect(answer.result).toBe('started');
    }
    expect(await set.sessions.start(makeComposerStart({ repositoryId: set.folder?.id }))).toEqual({
      result: 'cannot_start',
      reason: 'too_many',
    });
    expect(await set.records.list()).toHaveLength(3);
  });

  it('AC-18 (Q7): no folder, or one that’s gone, makes nothing', async () => {
    const none = await setUp({ folders: false });
    expect(await none.sessions.start(makeComposerStart())).toEqual({ result: 'cannot_start', reason: 'no_folder' });
    await nothingMade(none);

    const gone = await setUp();
    expect(await gone.sessions.start(makeComposerStart({ repositoryId: '00000000000000ff' }))).toEqual({
      result: 'cannot_start',
      reason: 'choose_folder',
    });
    await nothingMade(gone);
  });

  it('AC-21: a chip Jira or GitHub can’t give makes nothing, and says which', async () => {
    const set = await setUp();
    const answer = await set.sessions.start(
      makeComposerStart({
        repositoryId: set.folder?.id,
        context: [fileChip, { ...pullChip, number: 9 }, { kind: 'jira', key: 'PROJ-1423' }],
      }),
    );
    expect(answer).toEqual({ result: 'context_failed', chip: 1, problem: 'not_found' });
    await nothingMade(set);
  });
});

describe('a composer start (spec 015)', () => {
  it('AC-4: starts on your message alone, on its own branch, with exactly your message as the brief', async () => {
    const { sessions, records, heard, sdk, folder } = await setUp();

    const answer = await sessions.start(
      makeComposerStart({ message: 'Add a CSV export to the reports page', repositoryId: folder?.id }),
    );

    expect(answer).toEqual({ result: 'started', sessionId: '0000000000000001' });
    expect(heard).toContainEqual({ type: 'sessions.changed' });
    const record = await settled(records);
    expect(record.session).toMatchObject({
      title: 'Add a CSV export to the reports page',
      source: null,
      branch: 'feat/add-a-csv-export-to',
      jiraUrl: null,
      sprint: null,
      ticket: null,
      folder: { name: 'web-app' },
    });
    expect(record.session.activities.find((activity) => activity.kind === 'brief')).toMatchObject({
      key: null,
      message: true,
      pullRequests: [],
      files: [],
    });
    expect(await records.readBrief('0000000000000001')).toBe('Add a CSV export to the reports page');
    expect(sdk.runs[0]?.prompts).toEqual(['Add a CSV export to the reports page']);
    expect(JSON.stringify(sdk.runs[0]?.options.systemPrompt)).toContain('Do what the user asks in the brief.');
  });

  it('AC-20: sends your message, the ticket, the pull request and the file in the order you added them, and nothing else', async () => {
    const { sessions, records, sdk, folder } = await setUp();

    await sessions.start(
      makeComposerStart({
        message: 'Use the notes',
        repositoryId: folder?.id,
        context: [fileChip, ticketChip, pullChip],
      }),
    );

    const record = await settled(records);
    expect(record.session).toMatchObject({
      title: 'Add bulk archive to the content list',
      source: { kind: 'jira', key: 'PROJ-1423' },
      branch: 'feat/PROJ-1423',
      jiraUrl: `https://${jiraSite}/browse/PROJ-1423`,
      sprint: 'Sprint 42',
      ticket: { type: 'Story' },
    });
    expect(record.session.activities.find((activity) => activity.kind === 'brief')).toMatchObject({
      key: 'PROJ-1423',
      message: true,
      pullRequests: ['web-app #2836'],
      files: ['notes.md'],
    });
    const brief = await records.readBrief('0000000000000001');
    expect(brief).toMatch(
      /^Use the notes\n\nFile notes\.md\n\n# Notes\n\nExport every column\.\n\nJira ticket PROJ-1423 \(Story\)/,
    );
    expect(brief).toContain('Pull request acme/web-app #2836: Lazy-load the people directory');
    expect(brief).toContain('```diff\ndiff --git a/a.ts b/a.ts\n+x\n```');
    expect(sdk.runs[0]?.prompts).toEqual([brief]);
  });

  it('AC-8: a ticket alone is the brief, and Claude is told to make the change it asks for', async () => {
    const { sessions, records, sdk } = await setUp();

    await sessions.start({ message: '', context: [ticketChip] });

    const record = await settled(records);
    expect(record.session.folder.name).toBe('web-app');
    expect(await records.readBrief('0000000000000001')).toBe(
      briefText(
        composerBrief('', [
          {
            kind: 'jira',
            key: 'PROJ-1423',
            summary: 'Add bulk archive to the content list',
            type: 'Story',
            description:
              'Content managers need to archive many items at once.\n\n- Checkbox on each row\n- Partial failures show which items failed',
            comments: [],
            links: [],
          },
        ]),
      ),
    );
    expect(JSON.stringify(sdk.runs[0]?.options.systemPrompt)).toContain('Make the change the ticket asks for.');
  });

  it('AC-4: a follow-up on a session with no ticket keeps Claude doing what you asked', async () => {
    const { sessions, records, sdk, folder } = await setUp();
    await sessions.start(makeComposerStart({ message: 'Fix the header', repositoryId: folder?.id }));
    await settled(records);
    await started(records, '0000000000000001');

    expect(await sessions.send('0000000000000001', 'And the footer')).toEqual({ result: 'sent' });

    await settled(records);
    expect(JSON.stringify(sdk.runs[1]?.options.systemPrompt)).toContain('Do what the user asks in the brief.');
  });
});
