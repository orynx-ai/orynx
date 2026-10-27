import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CreateOrynxTicketSchema,
  isOrynxKey,
  type ComposerChip,
  type Permissions,
  type ServerEvent,
} from '@devhub/contracts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
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
import {
  createOrynxTicketService,
  describeOrynxTicket,
  type OrynxTicketService,
} from '../orynx-tickets/ticket-service.ts';
import { createOrynxTicketStore } from '../orynx-tickets/ticket-store.ts';
import { createPreferencesService } from '../preferences/preferences-service.ts';
import { createRepositoryService } from '../repositories/repository-service.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createTokenStore } from '../secrets/token-store.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';
import { useFakeClaudeFolder } from '../test/fake-claude.ts';
import { fakeClaudeSdk, type FakeTurn } from '../test/fake-claude-sdk.ts';
import { acceptingPullContext, acceptingPullDiff, githubLogin, githubToken } from '../test/fake-github.ts';
import { acceptingIssue, acceptingIssueSearch, goodToken, jiraEmail, jiraSite } from '../test/fake-jira.ts';
import { useTestRepositories } from '../test/git-repository.ts';
import { briefText, composerBrief, type BriefChip, type BriefPullRequest } from './brief.ts';
import { createChangesReader } from './changes.ts';
import { chooseFolder, composerPlan, pullToWorkOn } from './compose.ts';
import { createSkillsService } from '../skills/skills-service.ts';
import { createContextReader } from './context-reader.ts';
import { openFileSessionStore } from './file-session-store.ts';
import { createMemorySessionStore, type SessionRecords } from './session-store.ts';
import { createSessionService } from './session-service.ts';

vi.setConfig({ testTimeout: 15_000 });

const proj = makeRepository({ id: '00000000000000aa', name: 'web-app', jiraProject: 'PROJ' });
const api = makeRepository({ id: '00000000000000bb', name: 'api', path: '/Users/priya/code/api', jiraProject: null });
const ticketChip = { kind: 'jira', key: 'PROJ-1423' } as const;
const pullChip = { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 } as const;
/** A file you picked, in the test repositories' folder, which stands for your home folder here (spec 022). */
const fileChip = { kind: 'file', path: '~/notes.md' } as const;
const mob = makeRepository({
  id: '00000000000000cc',
  name: 'mobile',
  path: '/Users/priya/code/mobile',
  jiraProject: 'MOB',
});
const mobChip = { kind: 'jira', key: 'MOB-7' } as const;
/** One of Orynx's own tickets (spec 037): it belongs to no Jira project, so to no folder of its own. */
const orynxChip = { kind: 'jira', key: 'ORX-2' } as const;

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
    ['the first ticket’s folder (spec 022, AC-7)', [proj, mob], start({ context: [mobChip, ticketChip] }), mob],
    ['the only folder, for an Orynx ticket (spec 037)', [api], start({ context: [orynxChip] }), api],
    [
      'the folder the page sent, for an Orynx ticket',
      [proj, api],
      start({ context: [orynxChip], repositoryId: api.id }),
      api,
    ],
    ['nothing, with two folders and an Orynx ticket', [proj, api], start({ context: [orynxChip] }), 'choose_folder'],
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
    expect(
      composerPlan('Add a CSV export to the reports page', [
        { kind: 'file', path: '~/notes.md', real: '/Users/dev/notes.md' },
      ]),
    ).toMatchObject({
      title: 'Add a CSV export to the reports page',
      ticket: null,
      plan: {
        branchName: 'add-a-csv-export-to',
        briefStep: { key: null, message: true, pullRequests: [], files: ['~/notes.md'] },
        ticketNote: false,
        // 022 AC-15: the file is one Claude may read where it is.
        reads: { files: ['/Users/dev/notes.md'], folders: [] },
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

  it('AC-4 (spec 022, Q2): the first ticket names the session and its branch; the others are listed after it', () => {
    const other: BriefChip = { ...ticket, key: 'PROJ-1424', summary: 'Archive from the list' };
    expect(composerPlan('Do both', [other, ticket])).toMatchObject({
      title: 'Archive from the list',
      ticket: { key: 'PROJ-1424' },
      plan: {
        branchName: 'PROJ-1424',
        briefStep: { key: 'PROJ-1424', tickets: ['PROJ-1423'], message: true },
        ticketNote: false,
      },
    });
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
  orynx,
  permissions,
  jiraConnected = true,
}: {
  login?: 'signed_in' | 'signed_out';
  /** Jira's site and email in Settings; its token is in the keychain either way. */
  jiraConnected?: boolean;
  script?: readonly FakeTurn[];
  folders?: boolean;
  orynx?: OrynxTicketService;
  /** Rows saved in Settings › Coding agent, over the older mode below. */
  permissions?: Partial<Permissions>;
} = {}) {
  const repos = await repositories();
  await writeFile(join(repos.root, 'notes.md'), '# Notes\n\nExport every column.');
  const home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-compose-home-')));
  homes.push(home);
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));
  const settings = createMemorySettingsStore({
    ...(jiraConnected ? { jira: { site: jiraSite, email: jiraEmail } } : {}),
    github: { method: 'token' },
    agent: { permissionMode: 'edit_freely_ask_commands', allowedCommands: [], ...(permissions && { permissions }) },
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
    skills: createSkillsService({ repositories: service, home: repos.root, orynx: join(home, 'plugin', 'skills') }),
    context: createContextReader({
      home: repos.root,
      ...(orynx === undefined ? {} : { orynx }),
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
    describeTicket: (key) =>
      orynx !== undefined && isOrynxKey(key)
        ? describeOrynxTicket(orynx, key)
        : Promise.resolve({ title: 'Add bulk archive', sprint: 'Sprint 42', status: null, dueDate: null }),
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
    ...(orynx === undefined ? {} : { tickets: orynx }),
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
  return { sessions, records, home, heard, sdk, folder: added[0], outside, root: repos.root, repos, settings };
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

/**
 * How many events were heard once they stopped coming: a session's last event can trail its record by a moment under
 * load, so a count taken as soon as it settles may miss it.
 */
async function quietCount(heard: readonly unknown[]): Promise<number> {
  let count = -1;
  while (count !== heard.length) {
    count = heard.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return count;
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
    const heardBefore = await quietCount(set.heard);

    const answer = await set.sessions.start(makeComposerStart({ message: 'Only the tests', context: [ticketChip] }));

    expect(answer).toEqual({ result: 'existing', sessionId: '0000000000000001' });
    await nothingMade(set, 1, heardBefore);
  });

  it('spec 047, AC-2: `another` starts a second session beside the ticket’s live one, in its own worktree', async () => {
    const set = await setUp();
    await set.sessions.start({ ticketKey: 'PROJ-1423' });
    await settled(set.records);

    const answer = await set.sessions.start(
      makeComposerStart({
        message: 'Only the tests',
        repositoryId: set.folder?.id,
        context: [ticketChip],
        another: true,
      }),
    );

    expect(answer).toEqual({ result: 'started', sessionId: '0000000000000002' });
    const second = await settled(set.records, '0000000000000002');
    expect(second.session.source).toEqual({ kind: 'jira', key: 'PROJ-1423' });
    expect(second.worktree).not.toBe((await set.records.get('0000000000000001'))?.worktree);
  });

  it('AC-5 (spec 022): a live session on a ticket after the first doesn’t stop the start', async () => {
    const set = await setUp();
    await set.sessions.start({ ticketKey: 'PROJ-1423' });
    await settled(set.records);
    set.outside.use(
      acceptingIssue([
        { key: 'PROJ-1424', summary: 'Archive from the list', type: 'Task' },
        { key: 'PROJ-1423', summary: 'Add bulk archive to the content list', type: 'Story' },
      ]),
    );

    const answer = await set.sessions.start(
      makeComposerStart({
        message: 'Do both',
        repositoryId: set.folder?.id,
        context: [{ kind: 'jira', key: 'PROJ-1424' }, ticketChip],
      }),
    );

    expect(answer).toEqual({ result: 'started', sessionId: '0000000000000002' });
    const record = await settled(set.records, '0000000000000002');
    expect(record.session).toMatchObject({ source: { kind: 'jira', key: 'PROJ-1424' } });
    // The branch is named now and made at Claude's first edit (spec 042).
    expect(record.branchPlan?.name).toBe('feat/PROJ-1424');
    const brief = await set.records.readBrief('0000000000000002');
    expect(brief).toMatch(
      /^Do both\n\nJira ticket PROJ-1424 \(Task\): Archive from the list\n\n[^]*\nJira ticket PROJ-1423 \(Story\)/,
    );
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

/** The names of the tools a run's `orynx` server offers, read from a fresh copy of it. */
async function orynxToolsOf(set: Awaited<ReturnType<typeof setUp>>, run: number): Promise<string[]> {
  const server = set.sdk.runs[run]?.options.mcpServers?.['orynx'];
  if (server?.type !== 'sdk' || !('instance' in server)) throw new Error('No orynx server');
  const [ours, theirs] = InMemoryTransport.createLinkedPair();
  await server.instance.close();
  await server.instance.connect(theirs);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(ours);
  return (await client.listTools()).tools.map((tool) => tool.name);
}

const jiraToolNames = [
  'list_jira_projects',
  'search_jira',
  'get_jira_issue',
  'comment_on_jira_issue',
  'transition_jira_issue',
  'assign_jira_issue',
];

describe('Jira tools in a session (spec 044)', () => {
  it('AC-1, AC-3, AC-4: a Build’s search reaches Jira and is a step, on the one orynx server', async () => {
    const set = await setUp({
      script: [{ tool: 'mcp__orynx__search_jira', input: { jql: 'assignee = currentUser()' } }, { finish: 'Done.' }],
    });
    set.outside.use(acceptingIssueSearch([{ key: 'PROJ-7', summary: 'Crash on save' }]));

    await set.sessions.start(makeComposerStart({ message: 'My bugs?', repositoryId: set.folder?.id, mode: 'build' }));
    const record = await settled(set.records);

    expect(record.session.activities.find((activity) => activity.kind === 'jira')).toMatchObject({
      state: 'done',
      action: 'searched',
      found: 1,
      more: false,
    });
    expect(Object.keys(set.sdk.runs[0]?.options.mcpServers ?? {})).toEqual(['orynx']);
  });

  it('AC-5, AC-6: with Jira not connected a run has none; once it is, the next follow-up has them', async () => {
    const set = await setUp({ jiraConnected: false });
    await set.sessions.start(
      makeComposerStart({ message: 'What is left?', repositoryId: set.folder?.id, mode: 'ask' }),
    );
    await settled(set.records);
    // No tools at all here, so no orynx server.
    expect(set.sdk.runs[0]?.options.mcpServers).toEqual({});

    await set.settings.update((current) => ({ ...current, jira: { site: jiraSite, email: jiraEmail } }));
    expect(await set.sessions.send('0000000000000001', 'And in Jira?')).toEqual({ result: 'sent' });
    await settled(set.records);

    expect(await orynxToolsOf(set, 1)).toEqual(jiraToolNames);
  });
});

describe('Orynx’s ticket tools in a session (spec 037)', () => {
  async function toolsGiven(mode: 'ask' | 'build') {
    const orynx = createOrynxTicketService({
      store: createOrynxTicketStore(),
      sessions: createMemorySessionStore(),
      events: createEventBus(),
    });
    const set = await setUp({ orynx, script: [{ tool: 'mcp__orynx__list_tickets', input: {} }, { finish: 'Done.' }] });
    await set.sessions.start(makeComposerStart({ message: 'What is left?', repositoryId: set.folder?.id, mode }));
    await settled(set.records);
    const server = set.sdk.runs[0]?.options.mcpServers?.['orynx'];
    if (server?.type !== 'sdk' || !('instance' in server)) throw new Error('No orynx server');
    const [ours, theirs] = InMemoryTransport.createLinkedPair();
    // The fake's own client used the server for the list call, so this one asks a fresh copy of it.
    await server.instance.close();
    await server.instance.connect(theirs);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(ours);
    const record = await set.records.get('0000000000000001');
    return { names: (await client.listTools()).tools.map((tool) => tool.name), record };
  }

  it('AC-44: a Build session’s agent gets all five tools, and its session tools, and its calls are steps', async () => {
    const { names, record } = await toolsGiven('build');
    expect(names).toEqual([
      'list_tickets',
      'get_ticket',
      'create_ticket',
      'update_ticket',
      'delete_ticket',
      'set_steps',
      'start_server',
      'stop_server',
      ...jiraToolNames,
    ]);
    expect(record?.session.activities.find((activity) => activity.kind === 'ticket')).toMatchObject({
      action: 'listed',
      key: null,
      state: 'done',
    });
  });

  it('AC-31, AC-44: an Ask session’s agent gets the reading ones only', async () => {
    expect((await toolsGiven('ask')).names).toEqual(['list_tickets', 'get_ticket', ...jiraToolNames]);
  });
});

describe('an Ask session (spec 026)', () => {
  const asking = [
    { tool: 'Grep', input: { pattern: 'export' } },
    { tool: 'Edit', input: { file_path: 'a.ts', old_string: 'x', new_string: 'y' } },
    { tool: 'Bash', input: { command: 'ls' } },
    { finish: 'The header reads its title from the route.' },
  ] as const satisfies readonly FakeTurn[];

  it('makes no worktree or branch: Claude reads the folder where it is, and every edit and command is refused', async () => {
    const set = await setUp({ script: asking });

    const answer = await set.sessions.start(
      makeComposerStart({ message: 'How does the header work?', repositoryId: set.folder?.id, mode: 'ask' }),
    );

    expect(answer).toEqual({ result: 'started', sessionId: '0000000000000001' });
    const record = await settled(set.records);
    expect(record).toMatchObject({ worktree: null, session: { mode: 'ask', branch: null, worktreePath: null } });
    expect(record.session.activities.map((step) => step.kind)).not.toContain('worktree');
    expect(await readdir(join(set.home, 'worktrees')).catch(() => [])).toEqual([]);
    expect(set.sdk.runs[0]?.options.cwd).toBe(set.folder?.path);
    expect(JSON.stringify(set.sdk.runs[0]?.options.systemPrompt)).toContain('this is an Ask session');
    expect(set.sdk.runs[0]?.decisions.map(({ tool, result }) => [tool, result.behavior])).toEqual([
      ['Grep', 'allow'],
      ['Edit', 'deny'],
      ['Bash', 'deny'],
    ]);
    expect(record.session.activities.filter((step) => step.kind === 'refused')).toMatchObject([
      { access: 'edit', reason: 'ask_session', path: 'a.ts' },
      { access: 'run', reason: 'ask_session', path: 'ls' },
    ]);
    // No Changes and no pull request: there's no worktree.
    expect(await set.sessions.changes('0000000000000001')).toEqual({ state: 'no_worktree' });
  });

  it('a follow-up carries on in the same folder, still reading only', async () => {
    const set = await setUp({ script: asking });
    await set.sessions.start(
      makeComposerStart({ message: 'How does the header work?', repositoryId: set.folder?.id, mode: 'ask' }),
    );
    await settled(set.records);
    await started(set.records, '0000000000000001');

    expect(await set.sessions.send('0000000000000001', 'And the footer?')).toEqual({ result: 'sent' });

    await settled(set.records);
    expect(set.sdk.runs[1]?.options).toMatchObject({ cwd: set.folder?.path, resume: expect.any(String) as unknown });
    expect(set.sdk.runs[1]?.decisions.map(({ tool, result }) => [tool, result.behavior])).toEqual([
      ['Grep', 'allow'],
      ['Edit', 'deny'],
      ['Bash', 'deny'],
    ]);
  });

  it('never holds its ticket: a Build starts beside a live Ask, and an Ask beside a live Build', async () => {
    const set = await setUp();
    const on = (mode: 'ask' | 'build') =>
      set.sessions.start(
        makeComposerStart({ message: 'About the ticket', context: [ticketChip], repositoryId: set.folder?.id, mode }),
      );

    expect(await on('ask')).toEqual({ result: 'started', sessionId: '0000000000000001' });
    expect(await on('build')).toEqual({ result: 'started', sessionId: '0000000000000002' });
    expect(await on('ask')).toEqual({ result: 'started', sessionId: '0000000000000003' });
    await settled(set.records, '0000000000000001');
    await settled(set.records, '0000000000000002');
    await settled(set.records, '0000000000000003');
  });
});

describe('an Ask with no folder (spec 031)', () => {
  const asking = [
    { tool: 'Grep', input: { pattern: 'export' } },
    { tool: 'Read', input: { file_path: '~/notes.md' } },
    { tool: 'Read', input: { file_path: '~/other.md' } },
    { tool: 'Edit', input: { file_path: 'a.ts', old_string: 'x', new_string: 'y' } },
    { tool: 'Bash', input: { command: 'ls' } },
    { finish: 'Archive, not delete.' },
  ] as const satisfies readonly FakeTurn[];
  const noFolder = (change: Partial<ComposerChip>[] = []) => {
    const { repositoryId: _id, ...body } = makeComposerStart({
      message: 'What did we decide about archiving?',
      mode: 'ask',
      context: change as ComposerChip[],
    });
    return body;
  };

  it('AC-3: starts with no folder in Settings: Claude in an empty folder of its own, with no worktree or branch', async () => {
    const set = await setUp({ folders: false, script: asking });

    expect(await set.sessions.start(noFolder())).toEqual({ result: 'started', sessionId: '0000000000000001' });

    const record = await settled(set.records);
    const own = join(set.home, 'worktrees', '0000000000000001');
    expect(record).toMatchObject({
      repository: null,
      worktree: own,
      session: { mode: 'ask', folder: null, branch: null, worktreePath: null },
    });
    expect(set.sdk.runs[0]?.options.cwd).toBe(own);
    expect(await readdir(own)).toEqual([]);
    expect(JSON.stringify(set.sdk.runs[0]?.options.systemPrompt)).toContain('this is an Ask session with no folder');
    expect(await set.sessions.changes('0000000000000001')).toEqual({ state: 'no_worktree' });
  });

  it('AC-32 (039): deleting it removes its own empty folder too', async () => {
    const set = await setUp({ folders: false, script: asking });
    await set.sessions.start(noFolder());
    await settled(set.records);

    expect(await set.sessions.remove('0000000000000001')).toBe('deleted');

    await expect(readdir(join(set.home, 'worktrees', '0000000000000001'))).rejects.toThrow();
  });

  it('AC-4, AC-6: reads only the files the brief names; every edit and command is refused', async () => {
    const set = await setUp({ script: asking });
    await set.sessions.start(noFolder([fileChip]));
    const record = await settled(set.records);
    // Settings has a folder, and the Ask still reads none of it.
    expect(set.sdk.runs[0]?.options.cwd).toBe(join(set.home, 'worktrees', '0000000000000001'));

    expect(set.sdk.runs[0]?.decisions.map(({ tool, result }) => [tool, result.behavior])).toEqual([
      ['Grep', 'allow'],
      ['Read', 'allow'],
      ['Read', 'deny'],
      ['Edit', 'deny'],
      ['Bash', 'deny'],
    ]);
    expect(record.session.activities.filter((step) => step.kind === 'refused')).toMatchObject([
      { access: 'read', reason: 'outside_worktree' },
      { access: 'edit', reason: 'ask_session', path: 'a.ts' },
      { access: 'run', reason: 'ask_session', path: 'ls' },
    ]);
  });

  it('AC-7: a follow-up carries on in the same empty folder', async () => {
    const set = await setUp({ folders: false, script: asking });
    await set.sessions.start(noFolder());
    await settled(set.records);
    await started(set.records, '0000000000000001');

    expect(await set.sessions.send('0000000000000001', 'And restoring?')).toEqual({ result: 'sent' });

    await settled(set.records);
    expect(set.sdk.runs[1]?.options).toMatchObject({
      cwd: join(set.home, 'worktrees', '0000000000000001'),
      resume: expect.any(String) as unknown,
    });
  });

  it('AC-8: a Build still needs a folder', async () => {
    const set = await setUp({ folders: false });
    expect(await set.sessions.start({ ...noFolder(), mode: 'build' })).toEqual({
      result: 'cannot_start',
      reason: 'no_folder',
    });
  });
});

describe('a Build on your pull request (spec 031)', () => {
  /** web-app's folder, whose origin reads as github.com/acme/web-app and is the bare repository standing in for it. */
  async function onGitHub(options: Parameters<typeof setUp>[0] = {}) {
    const set = await setUp(options);
    const github = 'git@github.com:acme/web-app.git';
    await set.repos.git(set.repos.clone, 'remote', 'set-url', 'origin', github);
    await set.repos.git(set.repos.clone, 'config', `url.${set.repos.origin}.insteadOf`, github);
    return set;
  }
  const yours = (change: Record<string, unknown> = {}) =>
    acceptingPullContext([
      { number: 2836, title: 'Fix the content list', head: 'fix/content-list', author: githubLogin, ...change },
    ]);
  const answer = (set: Awaited<ReturnType<typeof setUp>>) =>
    set.sessions.start(
      makeComposerStart({ message: 'Answer the review comments', repositoryId: set.folder?.id, context: [pullChip] }),
    );

  it('AC-14: works on its own branch, linked from the start, and makes no branch of its own', async () => {
    const set = await onGitHub();
    set.outside.use(yours());
    const newest = await set.repos.commitInOrigin('fix.txt', 'fix/content-list');

    expect(await answer(set)).toEqual({ result: 'started', sessionId: '0000000000000001' });

    const record = await settled(set.records);
    expect(record).toMatchObject({
      startCommit: newest,
      session: {
        source: { kind: 'pull_request', number: 2836 },
        workOn: 'pull_request',
        branch: 'fix/content-list',
        pullRequest: {
          number: 2836,
          url: 'https://github.com/acme/web-app/pull/2836',
          repository: 'acme/web-app',
          openedAt: '2026-10-15T09:00:00Z',
        },
      },
    });
    expect(record.session.activities.find((step) => step.kind === 'worktree')).toMatchObject({
      branch: 'fix/content-list',
      base: 'origin/fix/content-list',
      fetched: true,
      pullRequest: 2836,
    });
    expect(await set.repos.git(set.repos.clone, 'branch', '--list', 'fix/content-list')).toBe('');
    expect(JSON.stringify(set.sdk.runs[0]?.options.systemPrompt)).toContain("pull request #2836's own branch");
  });

  it('spec 026: with Push the branch on Allow, Claude may push HEAD to its branch, never the local branch of that name', async () => {
    const set = await onGitHub({
      permissions: { commands: 'any', push: 'allow' },
      script: [
        { tool: 'Bash', input: { command: 'git push origin HEAD:fix/content-list' } },
        { tool: 'Bash', input: { command: 'git push origin fix/content-list' } },
        { finish: 'Pushed.' },
      ],
    });
    set.outside.use(yours());
    await set.repos.commitInOrigin('fix.txt', 'fix/content-list');
    await answer(set);
    await settled(set.records);

    expect(set.sdk.runs[0]?.decisions.map(({ tool, result }) => [tool, result.behavior])).toEqual([
      ['Bash', 'allow'],
      ['Bash', 'deny'],
    ]);
    expect(JSON.stringify(set.sdk.runs[0]?.options.systemPrompt)).toContain(
      'You may push your commits to #2836 with exactly `git push origin HEAD:fix/content-list` on its own.',
    );
  });

  /** A session on #2836's branch that Claude finished, with a change of its own in the worktree to push. */
  async function finishedOnPull() {
    const set = await onGitHub();
    set.outside.use(yours());
    await set.repos.commitInOrigin('fix.txt', 'fix/content-list');
    await answer(set);
    const record = await settled(set.records);
    if (record.worktree === null) throw new Error('the worktree should be made');
    await writeFile(join(set.repos.root, '.gitconfig'), '[user]\n\tname = Rakesh D\n\temail = you@company.com\n');
    await writeFile(join(record.worktree, 'review.ts'), 'fixed\n');
    return { set, worktree: record.worktree };
  }

  it('AC-16: Push changes commits and pushes to its branch, and the stepper reaches its last step', async () => {
    const { set, worktree } = await finishedOnPull();

    expect(await set.sessions.push('0000000000000001', { message: 'Answer the review' })).toEqual({
      result: 'pushed',
      files: 1,
    });

    const head = await set.repos.git(worktree, 'rev-parse', 'HEAD');
    expect(await set.repos.git(set.repos.origin, 'rev-parse', 'refs/heads/fix/content-list')).toBe(head);
    const record = await set.records.get('0000000000000001');
    expect(record?.session).toMatchObject({ state: 'pr_open', step: 'pull_request' });
    expect(record?.session.activities.at(-1)).toMatchObject({ kind: 'pushed', number: 2836, files: 1 });
  });

  it('Push changes has something to send until origin’s branch has it, whoever pushed it', async () => {
    const { set, worktree } = await finishedOnPull();
    const id = '0000000000000001';
    expect(await set.sessions.get(id)).toMatchObject({ unpushed: true });

    await set.sessions.push(id, { message: 'Answer the review' });
    expect(await set.sessions.get(id)).toMatchObject({ unpushed: false });

    await writeFile(join(worktree, 'more.ts'), 'more\n');
    expect(await set.sessions.get(id)).toMatchObject({ unpushed: true });
    await set.repos.git(worktree, 'add', '-A');
    await set.repos.git(worktree, 'commit', '-m', 'More');
    expect(await set.sessions.get(id)).toMatchObject({ unpushed: true });
    // Claude's own push (spec 026), which Orynx's Push changes never saw.
    await set.repos.git(worktree, 'push', 'origin', 'HEAD:fix/content-list');
    expect(await set.sessions.get(id)).toMatchObject({ unpushed: false });
  });

  it('AC-17: when someone pushed to its branch since, nothing is overwritten', async () => {
    const { set } = await finishedOnPull();
    const theirs = await set.repos.commitInOrigin('theirs.ts', 'fix/content-list');

    expect(await set.sessions.push('0000000000000001', { message: 'Answer the review' })).toEqual({
      result: 'failed',
      problem: { kind: 'push_rejected' },
    });
    expect(await set.repos.git(set.repos.origin, 'rev-parse', 'refs/heads/fix/content-list')).toBe(theirs);
  });

  it('AC-15: Discard deletes the worktree and keeps the branch, yours and on origin', async () => {
    const { set, worktree } = await finishedOnPull();
    await set.repos.git(set.repos.clone, 'fetch', 'origin');
    await set.repos.git(set.repos.clone, 'branch', 'fix/content-list', 'origin/fix/content-list');

    expect(await set.sessions.discard('0000000000000001')).toBe('discarded');

    expect(await readdir(worktree).catch(() => null)).toBeNull();
    expect(await set.repos.git(set.repos.clone, 'branch', '--list', 'fix/content-list')).toContain('fix/content-list');
    expect(await set.repos.git(set.repos.origin, 'branch', '--list', 'fix/content-list')).toContain('fix/content-list');
    const record = await set.records.get('0000000000000001');
    expect(record?.session.activities.at(-1)).toMatchObject({
      kind: 'discarded',
      branch: 'fix/content-list',
      kept: true,
    });
  });

  it('AC-18: a pull request with a live session opens that one, and starts nothing', async () => {
    const set = await onGitHub();
    set.outside.use(yours());
    await set.repos.commitInOrigin('fix.txt', 'fix/content-list');
    await answer(set);
    await settled(set.records);

    expect(await answer(set)).toEqual({ result: 'existing', sessionId: '0000000000000001' });
    expect(await set.records.get('0000000000000002')).toBeNull();
  });

  it('spec 047, AC-4: `another` on your pull request works on its branch in a second detached worktree', async () => {
    const set = await onGitHub();
    set.outside.use(yours());
    const newest = await set.repos.commitInOrigin('fix.txt', 'fix/content-list');
    await answer(set);
    const first = await settled(set.records);

    expect(
      await set.sessions.start(
        makeComposerStart({
          message: 'Answer the review comments',
          repositoryId: set.folder?.id,
          context: [pullChip],
          another: true,
        }),
      ),
    ).toEqual({ result: 'started', sessionId: '0000000000000002' });

    const second = await settled(set.records, '0000000000000002');
    expect(second.session).toMatchObject({ workOn: 'pull_request', branch: 'fix/content-list' });
    expect(second.worktree).not.toBe(first.worktree);
    expect(await set.repos.git(second.worktree ?? '', 'rev-parse', 'HEAD')).toBe(newest);
    // An edit in one worktree isn't in the other's.
    await writeFile(join(first.worktree ?? '', 'mine.ts'), 'mine\n');
    expect(await readdir(second.worktree ?? '')).not.toContain('mine.ts');
  });

  it('AC-19: someone else’s pull request is context for a new branch', async () => {
    const set = await onGitHub();
    set.outside.use(yours({ author: 'hubot' }));
    await set.repos.commitInOrigin('fix.txt', 'fix/content-list');
    await answer(set);

    const record = await settled(set.records);
    expect(record.session).toMatchObject({ workOn: 'new_branch', pullRequest: null, source: null });
    expect(record.branchPlan?.name).toMatch(/^feat\//);
  });

  it('AC-22: a branch that can’t be fetched, and was never fetched, can’t start, and leaves no worktree', async () => {
    const set = await onGitHub();
    set.outside.use(yours());

    await answer(set);

    const record = await settled(set.records);
    expect(record.session.problem).toEqual({ kind: 'git', stage: 'starting' });
    expect(await readdir(join(set.home, 'worktrees')).catch(() => [])).toEqual([]);
  });
});

describe('a file by its path (spec 022)', () => {
  it('AC-15: Claude may read the file you picked, where it is, and nothing beside it, nor change it', async () => {
    // `~` is the test repositories' folder here, as the adapter's home and the reader's.
    const set = await setUp({
      script: [
        { tool: 'Read', input: { file_path: '~/notes.md' } },
        { tool: 'Read', input: { file_path: '~/other.md' } },
        { tool: 'Edit', input: { file_path: '~/notes.md', old_string: 'Notes', new_string: 'Mine' } },
        { finish: 'Done.' },
      ],
    });

    await set.sessions.start(
      makeComposerStart({ message: 'Use the notes', repositoryId: set.folder?.id, context: [fileChip] }),
    );

    const record = await settled(set.records);
    expect(record.reads).toEqual({ files: [await realpath(join(set.root, 'notes.md'))], folders: [] });
    const decided = [
      ['Read', 'allow'],
      ['Read', 'deny'],
      ['Edit', 'deny'],
    ];
    expect(set.sdk.runs[0]?.decisions.map(({ tool, result }) => [tool, result.behavior])).toEqual(decided);

    // A follow-up resumes Claude Code, and the file is still one it may read (the record keeps it).
    await started(set.records, '0000000000000001');
    expect(await set.sessions.send('0000000000000001', 'Read them again')).toEqual({ result: 'sent' });
    await settled(set.records);
    expect(set.sdk.runs[1]?.decisions.map(({ tool, result }) => [tool, result.behavior])).toEqual(decided);
  });

  it('AC-16: a file that’s gone by Send makes nothing, and says which chip', async () => {
    const set = await setUp();
    const answer = await set.sessions.start(
      makeComposerStart({ repositoryId: set.folder?.id, context: [ticketChip, { kind: 'file', path: '~/gone.md' }] }),
    );
    expect(answer).toEqual({ result: 'context_failed', chip: 1, problem: 'not_found' });
    await nothingMade(set);
  });
});

describe('what a session was sent (spec 025)', () => {
  it('keeps every chip a composer start was sent, in the order added', async () => {
    const set = await setUp();
    await set.sessions.start(
      makeComposerStart({ message: 'Do it', repositoryId: set.folder?.id, context: [ticketChip, pullChip, fileChip] }),
    );
    expect((await settled(set.records)).session.context).toEqual([ticketChip, pullChip, fileChip]);
  });

  it('a follow-up’s chips are read and sent after its message, join the session’s context, and Claude may read its files', async () => {
    const set = await setUp({
      script: [{ finish: 'Done.' }, { tool: 'Read', input: { file_path: '~/notes.md' } }, { finish: 'Read it.' }],
    });
    await set.sessions.start(makeComposerStart({ message: 'Fix the header', repositoryId: set.folder?.id }));
    await settled(set.records);
    await started(set.records, '0000000000000001');

    expect(await set.sessions.send('0000000000000001', 'Use these too', [ticketChip, fileChip])).toEqual({
      result: 'sent',
    });

    const record = await settled(set.records);
    expect(record.session.context).toEqual([ticketChip, fileChip]);
    expect(record.reads?.files).toEqual([await realpath(join(set.root, 'notes.md'))]);
    const prompt = set.sdk.runs[1]?.prompts[0] ?? '';
    expect(prompt).toMatch(/^Use these too\n\nJira ticket PROJ-1423 \(Story\): /);
    expect(prompt).toContain('File ~/notes.md');
    expect(set.sdk.runs[1]?.decisions.map(({ tool, result }) => [tool, result.behavior])).toEqual([['Read', 'allow']]);
    // The message step shows what you typed.
    expect(record.session.activities.filter((step) => step.kind === 'message')).toMatchObject([
      { kind: 'message', text: 'Use these too' },
    ]);
  });

  it('a follow-up that resumes Claude Code starts it with the model and effort you picked', async () => {
    const set = await setUp({ script: [{ finish: 'Done.' }, { finish: 'Done again.' }] });
    await set.sessions.start(makeComposerStart({ message: 'Fix the header', repositoryId: set.folder?.id }));
    await settled(set.records);
    await started(set.records, '0000000000000001');

    expect(await set.sessions.send('0000000000000001', 'Again', [], { model: 'haiku', effort: 'low' })).toEqual({
      result: 'sent',
    });

    await settled(set.records);
    expect(set.sdk.runs[0]?.options).not.toHaveProperty('model');
    expect(set.sdk.runs[1]?.options).toMatchObject({ model: 'haiku', effort: 'low' });
  });

  it('a follow-up chip that can’t be read sends nothing, and says which', async () => {
    const set = await setUp();
    await set.sessions.start(makeComposerStart({ message: 'Fix the header', repositoryId: set.folder?.id }));
    await settled(set.records);
    await started(set.records, '0000000000000001');

    expect(await set.sessions.send('0000000000000001', 'And this', [fileChip, { ...pullChip, number: 9 }])).toEqual({
      result: 'context_failed',
      chip: 1,
      problem: 'not_found',
    });
    expect(set.sdk.runs).toHaveLength(1);
    expect((await set.records.get('0000000000000001'))?.session.context).toEqual([]);
  });
});

describe('skills your message names (spec 022)', () => {
  it('AC-53: adds the skill’s text after the chips, lists it in the brief step, and lets Claude read its folder', async () => {
    const set = await setUp({
      script: [
        { tool: 'Read', input: { file_path: '~/web-app/.claude/skills/review/SKILL.md' } },
        { tool: 'Write', input: { file_path: '~/web-app/.claude/skills/review/SKILL.md', content: 'x' } },
        { finish: 'Reviewed.' },
      ],
    });
    const skillFolder = join(set.root, 'web-app', '.claude', 'skills', 'review');
    await mkdir(skillFolder, { recursive: true });
    await writeFile(
      join(skillFolder, 'SKILL.md'),
      '---\nname: review\ndescription: Review it\n---\n\nCheck the tests first.',
    );

    await set.sessions.start(
      makeComposerStart({ message: 'Use /review on it, and /nope', repositoryId: set.folder?.id, context: [fileChip] }),
    );

    const record = await settled(set.records);
    const brief = await set.records.readBrief('0000000000000001');
    expect(brief).toMatch(
      /^Use \/review on it, and \/nope\n\nFile ~\/notes\.md\n\n[^]*\n\nSkill \/review\n\nThe user asked for this skill with \/review\. Follow it for this task\./,
    );
    expect(brief).toContain('Check the tests first.');
    expect(brief).not.toContain('description: Review it');
    expect(record.session.activities.find((activity) => activity.kind === 'brief')).toMatchObject({
      skills: ['/review'],
    });
    expect(record.reads?.folders).toEqual([await realpath(skillFolder)]);
    expect(set.sdk.runs[0]?.decisions.map(({ tool, result }) => [tool, result.behavior])).toEqual([
      ['Read', 'allow'],
      ['Write', 'deny'],
    ]);
  });
});

describe('your Orynx skills in a session (spec 023)', () => {
  it('AC-22: puts an Orynx skill’s text in the brief, records it came from Orynx, and lets Claude read nothing of it', async () => {
    // Claude tries to read the skill's own file, inside DEVHUB_HOME; its path is known once the set is made.
    const read = { tool: 'Read', input: { file_path: '' } };
    const set = await setUp({ script: [read, { finish: 'Done.' }] });
    const skillFile = join(set.home, 'plugin', 'skills', 'bug-bash', 'SKILL.md');
    read.input.file_path = skillFile;
    await mkdir(join(skillFile, '..'), { recursive: true });
    await writeFile(
      skillFile,
      '---\nname: bug-bash\ndescription: Hunt for bugs\nmetadata:\n  title: Bug bash\n---\n\nReport only.',
    );

    await set.sessions.start(
      makeComposerStart({ message: 'Use /bug-bash on the date picker', repositoryId: set.folder?.id }),
    );

    const record = await settled(set.records);
    const brief = await set.records.readBrief('0000000000000001');
    expect(brief).toMatch(
      /^Use \/bug-bash on the date picker\n\nSkill \/bug-bash\n\nThe user asked for this skill with \/bug-bash\. Follow it for this task\.\n\nReport only\.$/,
    );
    expect(brief).not.toContain('Its folder is');
    expect(record.session.activities.find((activity) => activity.kind === 'brief')).toMatchObject({
      skills: ['/bug-bash'],
      orynxSkills: ['bug-bash'],
    });
    expect(record.reads?.files ?? []).not.toContain(await realpath(skillFile));
    expect(record.reads?.folders ?? []).toEqual([]);
    expect(set.sdk.runs[0]?.decisions.map(({ tool, result }) => [tool, result.behavior])).toEqual([['Read', 'deny']]);
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
      jiraUrl: null,
      sprint: null,
      ticket: null,
      folder: { name: 'web-app' },
    });
    expect(record.branchPlan?.name).toBe('feat/add-a-csv-export-to');
    expect(record.session.activities.find((activity) => activity.kind === 'brief')).toMatchObject({
      key: null,
      message: true,
      pullRequests: [],
      files: [],
    });
    expect(await records.readBrief('0000000000000001')).toBe('Add a CSV export to the reports page');
    expect(sdk.runs[0]?.prompts).toEqual(['Add a CSV export to the reports page']);
    expect(JSON.stringify(sdk.runs[0]?.options.systemPrompt)).toContain('Do what the user asks in the brief.');
    expect(sdk.runs[0]?.options).not.toHaveProperty('model');
  });

  it('starts Claude Code with the model and effort the composer picked', async () => {
    const { sessions, records, sdk, folder } = await setUp();

    await sessions.start(
      makeComposerStart({ message: 'Add a CSV export', repositoryId: folder?.id, model: 'opus', effort: 'max' }),
    );

    await settled(records);
    expect(sdk.runs[0]?.options).toMatchObject({ model: 'opus', effort: 'max' });
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
      jiraUrl: `https://${jiraSite}/browse/PROJ-1423`,
      sprint: 'Sprint 42',
      ticket: { type: 'Story' },
    });
    expect(record.session.activities.find((activity) => activity.kind === 'brief')).toMatchObject({
      key: 'PROJ-1423',
      message: true,
      pullRequests: ['web-app #2836'],
      files: ['~/notes.md'],
    });
    const brief = await records.readBrief('0000000000000001');
    // 022 AC-4: a file goes as its path, which Claude reads where it is; its text never goes in the brief.
    expect(brief).toMatch(
      /^Use the notes\n\nFile ~\/notes\.md\n\nThe user added this file from their computer\. Read it at /,
    );
    expect(brief).not.toContain('Export every column.');
    expect(brief).toMatch(/\n\nJira ticket PROJ-1423 \(Story\)/);
    expect(brief).toContain('Pull request acme/web-app #2836: Lazy-load the people directory');
    expect(brief).toContain('```diff\ndiff --git a/a.ts b/a.ts\n+x\n```');
    expect(sdk.runs[0]?.prompts).toEqual([brief]);
  });

  it('AC-8: a ticket alone is the brief, and Claude is told to make the change it asks for', async () => {
    const { sessions, records, sdk } = await setUp();

    await sessions.start({ message: '', context: [ticketChip] });

    const record = await settled(records);
    expect(record.session.folder?.name).toBe('web-app');
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

  it('AC-24, AC-27, AC-19 (spec 037): an Orynx ticket starts a session as a Jira one does, with no Jira link; deleted, its tab says so', async () => {
    const orynx = createOrynxTicketService({
      store: createOrynxTicketStore(),
      sessions: createMemorySessionStore(),
      events: createEventBus(),
    });
    await orynx.create(CreateOrynxTicketSchema.parse({ title: 'Add bulk archive', status: 'in_progress' }), {
      kind: 'you',
    });
    const { sessions, records } = await setUp({ orynx });
    const id = '0000000000000001';

    await sessions.start({ message: '', context: [{ kind: 'jira', key: 'ORX-1' }] });

    const record = await settled(records);
    expect(record.session).toMatchObject({
      title: 'Add bulk archive',
      source: { kind: 'jira', key: 'ORX-1' },
      jiraUrl: null,
      sprint: null,
    });
    expect(record.branchPlan?.name).toBe('feat/ORX-1');
    expect(await records.readBrief(id)).toBe(
      'Orynx ticket ORX-1 (Task): Add bulk archive\n\nPriority: Medium · Status: In progress\n\nNo description.',
    );
    expect((await sessions.get(id))?.ticket).toMatchObject({
      status: { name: 'In progress', column: 'in_progress' },
      deleted: false,
    });

    await orynx.remove('ORX-1');
    expect((await sessions.get(id))?.ticket).toMatchObject({ status: null, deleted: true });
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

describe('which branch a Build works on (spec 031)', () => {
  const pull = (change: Partial<BriefPullRequest> = {}): BriefChip => ({
    kind: 'pull_request',
    owner: 'acme',
    name: 'web-app',
    number: 2836,
    title: 'Fix the content list',
    body: null,
    base: 'main',
    head: 'fix/content-list',
    failingChecks: [],
    comments: [],
    diff: { kind: 'text', text: '' },
    url: 'https://github.com/acme/web-app/pull/2836',
    openedAt: '2026-10-15T09:00:00Z',
    open: true,
    fork: false,
    mine: true,
    ...change,
  });
  const ticket = { kind: 'jira', key: 'PROJ-1423' } as BriefChip;
  const file: BriefChip = { kind: 'file', path: '~/notes.md', real: '/Users/priya/notes.md' };

  it('AC-14: your open pull request in the folder’s repository, alone or beside files', () => {
    expect(pullToWorkOn([pull()], 'acme/web-app')).toMatchObject({ number: 2836, head: 'fix/content-list' });
    // GitHub's names aren't case-sensitive.
    expect(pullToWorkOn([file, pull()], 'Acme/Web-App')).toMatchObject({ number: 2836 });
  });

  it('AC-19: someone else’s, a closed or merged one, a fork’s, or another repository’s is context', () => {
    for (const other of [pull({ mine: false }), pull({ open: false }), pull({ fork: true }), pull({ name: 'api' })]) {
      expect(pullToWorkOn([other], 'acme/web-app')).toBeNull();
    }
    // A folder whose origin isn't on GitHub holds no pull request.
    expect(pullToWorkOn([pull()], null)).toBeNull();
  });

  it('AC-20: a ticket wins, wherever it is', () => {
    expect(pullToWorkOn([ticket, pull()], 'acme/web-app')).toBeNull();
    expect(pullToWorkOn([pull(), ticket], 'acme/web-app')).toBeNull();
  });

  it('only the first pull request counts', () => {
    expect(pullToWorkOn([pull({ mine: false, number: 1 }), pull({ number: 2 })], 'acme/web-app')).toBeNull();
    expect(pullToWorkOn([pull({ number: 1 }), pull({ number: 2 })], 'acme/web-app')).toMatchObject({ number: 1 });
  });
});
