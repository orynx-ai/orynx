import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SessionSummary } from '@devhub/contracts';
import { makeSessionSummary } from '@devhub/contracts/testing';
import { createEventBus } from '../events/event-bus.ts';
import { cacheFilePath, openInboxCache, type InboxCache } from '../inbox/inbox-cache.ts';
import { createJiraClient } from '../integrations/jira/client.ts';
import { createJiraConnection } from '../integrations/jira/connection.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createTokenStore } from '../secrets/token-store.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import {
  acceptingBoardConfiguration,
  acceptingFieldList,
  acceptingMyself,
  acceptingMySprintSearch,
  acceptingPrioritySearch,
  acceptingSprintIssueSearch,
  acceptingStatusList,
  boardConfigurationUrl,
  designBoardColumns,
  fieldListUrl,
  goodToken,
  jiraEmail,
  jiraSite,
  myselfUrl,
  statusListUrl,
  type FakeIssue,
} from '../test/fake-jira.ts';
import { createTicketsService } from './tickets-service.ts';

/** Jira, the outside service, faked for this file only. */
const outside = setupServer();
beforeAll(() => {
  outside.listen({ onUnhandledFrame: 'error' });
});
const start = Date.parse('2026-10-17T10:00:00.000Z');
let clock = start;

afterEach(() => {
  outside.resetHandlers();
  outside.events.removeAllListeners();
  clock = start;
});
afterAll(() => {
  outside.close();
});

const jiraConnected: Settings = { jira: { site: jiraSite, email: jiraEmail } };

/** The design's Sprint 42: one ticket of yours in each of three columns. */
const designIssues: FakeIssue[] = [
  { key: 'PROJ-1377', summary: 'Search returns archived sites for guest users', category: 'new', type: 'Bug' },
  { key: 'PROJ-1423', summary: 'Add bulk archive to the content list' },
  { key: 'PROJ-1350', summary: 'Migrate feed cards to the new Card component', status: 'In Review', statusId: '10001' },
];

/** Jira answering every read of a sync: you, the sprint field, your sprints, the board and the sprint's issues. */
function acceptingSprint(issues: FakeIssue[] = designIssues, { sprintId = 42, boardId = 7 } = {}) {
  outside.use(
    acceptingMyself(),
    acceptingFieldList(),
    acceptingMySprintSearch(
      issues.map((found) => ({ ...found, sprints: [{ id: sprintId, name: `Sprint ${String(sprintId)}`, boardId }] })),
    ),
    acceptingBoardConfiguration(boardId, designBoardColumns),
    acceptingStatusList(),
    acceptingSprintIssueSearch(sprintId, issues),
    acceptingPrioritySearch(),
  );
}

function setup({
  settings: initial = {},
  sessions = [],
  cache = openInboxCache(':memory:'),
}: { settings?: Settings; sessions?: SessionSummary[]; cache?: InboxCache } = {}) {
  const events = createEventBus();
  const settings = createMemorySettingsStore(initial);
  const tokens = createTokenStore({ keychain: createMemoryKeychain({ jira: goodToken }), events });
  const errors: unknown[] = [];
  const tickets = createTicketsService({
    cache,
    settings,
    connection: createJiraConnection({ settings, tokens, jira: createJiraClient(), events, envToken: false }),
    jira: createJiraClient({ timeoutMs: 300 }),
    sessions: createMemorySessionStore(sessions),
    onError: (error) => errors.push(error),
    now: () => clock,
  });
  return { tickets, settings, cache, errors };
}

/** The URLs that reach Jira. */
function requests(): () => string[] {
  const urls: string[] = [];
  outside.events.on('request:start', ({ request }) => {
    urls.push(request.url);
  });
  return () => urls;
}

describe('tickets service', () => {
  it('AC-21: with Jira not connected there is no sprint, and a sync asks nobody', async () => {
    const asked = requests();
    const { tickets } = setup();

    expect(await tickets.sync()).toBe('not_connected');
    expect(await tickets.read()).toEqual({
      jira: { state: 'not_connected' },
      sprint: null,
      tickets: [],
      truncated: false,
    });
    expect(asked()).toEqual([]);
  });

  it('AC-20: Jira is connected and hasn’t synced yet, so there is nothing to show', async () => {
    const { tickets } = setup({ settings: jiraConnected });

    expect(await tickets.read()).toEqual({ jira: { state: 'syncing' }, sprint: null, tickets: [], truncated: false });
  });

  it('AC-1, AC-4: a sync keeps the sprint and its tickets in rank order, each in its board column', async () => {
    acceptingSprint();
    const { tickets } = setup({ settings: jiraConnected });

    expect(await tickets.sync()).toBe('answered');

    const read = await tickets.read();
    expect(read.jira).toEqual({ state: 'synced', at: '2026-10-17T10:00:00.000Z' });
    expect(read.sprint).toEqual({ id: 42, name: 'Sprint 42', endsAt: '2026-10-24T17:00:00.000Z', projectKey: 'PROJ' });
    expect(read.tickets.map((ticket) => [ticket.key, ticket.column, ticket.session])).toEqual([
      ['PROJ-1377', 'to_do', null],
      ['PROJ-1423', 'in_progress', null],
      ['PROJ-1350', 'in_review', null],
    ]);
    expect(read.tickets[0]).toMatchObject({ bug: true, assignee: { name: 'Dev Example', mine: true } });
  });

  it('AC-19: reads answer from the cache, without asking Jira', async () => {
    acceptingSprint();
    const cache = openInboxCache(':memory:');
    await setup({ settings: jiraConnected, cache }).tickets.sync();
    const asked = requests();

    const read = await setup({ settings: jiraConnected, cache }).tickets.read();

    expect(read.tickets).toHaveLength(3);
    expect(asked()).toEqual([]);
  });

  it('AC-12: a ticket shows its newest session, unless that one was stopped', async () => {
    acceptingSprint();
    const sessions = [
      makeSessionSummary({
        id: 'old',
        state: 'needs_you',
        source: { kind: 'jira', key: 'PROJ-1423' },
        updatedAt: '2026-10-17T09:00:00.000Z',
      }),
      makeSessionSummary({
        id: 'stopped',
        state: 'stopped',
        source: { kind: 'jira', key: 'PROJ-1350' },
        updatedAt: '2026-10-17T09:30:00.000Z',
      }),
      makeSessionSummary({
        id: 'newer',
        state: 'working',
        source: { kind: 'jira', key: 'PROJ-1350' },
        updatedAt: '2026-10-17T09:00:00.000Z',
      }),
      makeSessionSummary({ id: 'pr', state: 'working', source: { kind: 'pull_request', number: 1377 } }),
    ];
    const { tickets } = setup({ settings: jiraConnected, sessions });
    await tickets.sync();

    const read = await tickets.read();

    expect(read.tickets.map((ticket) => [ticket.key, ticket.session])).toEqual([
      ['PROJ-1377', null],
      ['PROJ-1423', { id: 'old', state: 'needs_you' }],
      ['PROJ-1350', null],
    ]);
  });

  it('AC-22: no active sprint holds a ticket of yours', async () => {
    outside.use(
      acceptingMyself(),
      acceptingFieldList(),
      acceptingMySprintSearch([{ key: 'PROJ-1', sprints: [{ id: 43, state: 'future' }] }]),
    );
    const { tickets } = setup({ settings: jiraConnected });

    expect(await tickets.sync()).toBe('answered');
    expect(await tickets.read()).toEqual({
      jira: { state: 'synced', at: '2026-10-17T10:00:00.000Z' },
      sprint: null,
      tickets: [],
      truncated: false,
    });
  });

  it('AC-5: a board hidden from you shows the sprint without In review, rather than failing', async () => {
    acceptingSprint();
    outside.use(
      http.get(boardConfigurationUrl(7), () => HttpResponse.json({ errorMessages: ['No'] }, { status: 403 })),
    );
    const { tickets } = setup({ settings: jiraConnected });

    expect(await tickets.sync()).toBe('answered');
    expect((await tickets.read()).tickets.map((ticket) => ticket.column)).toEqual([
      'to_do',
      'in_progress',
      'in_progress',
    ]);
  });

  it('AC-26: says when the sprint held more tickets than DevHub keeps', async () => {
    acceptingSprint(Array.from({ length: 301 }, (_, index) => ({ key: `PROJ-${String(index + 1)}`, priority: null })));
    const { tickets } = setup({ settings: jiraConnected });

    await tickets.sync();

    const read = await tickets.read();
    expect(read.tickets).toHaveLength(300);
    expect(read.truncated).toBe(true);
  });

  it('AC-23: Jira doesn’t answer, so the last sprint stays with how old it is', async () => {
    acceptingSprint();
    const { tickets } = setup({ settings: jiraConnected });
    await tickets.sync();
    clock = start + 12 * 60_000;
    outside.use(http.get(myselfUrl(), () => HttpResponse.json({ errorMessages: ['Down'] }, { status: 503 })));

    expect(await tickets.sync()).toBe('failed');

    const read = await tickets.read();
    expect(read.jira).toEqual({
      state: 'failed',
      problem: { kind: 'no_answer' },
      lastSyncedAt: '2026-10-17T10:00:00.000Z',
    });
    expect(read.tickets).toHaveLength(3);
  });

  it('AC-24: Jira refuses the saved token, or wants a sign-in on the web first', async () => {
    acceptingSprint();
    outside.use(
      http.get(myselfUrl(), () =>
        HttpResponse.json({}, { status: 401, headers: { 'X-Seraph-LoginReason': 'AUTHENTICATED_FAILED' } }),
      ),
    );
    const { tickets } = setup({ settings: jiraConnected });
    await tickets.sync();
    expect((await tickets.read()).jira).toEqual({ state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: null });

    outside.use(
      http.get(myselfUrl(), () =>
        HttpResponse.json({}, { status: 403, headers: { 'X-Seraph-LoginReason': 'AUTHENTICATION_DENIED' } }),
      ),
    );
    await tickets.sync();
    expect((await tickets.read()).jira).toMatchObject({ problem: { kind: 'sign_in_needed', site: jiraSite } });
  });

  it('asks for the status list once, and again only when the board shows a status it doesn’t know', async () => {
    acceptingSprint();
    const asked = requests();
    const { tickets } = setup({ settings: jiraConnected });

    await tickets.sync();
    await tickets.sync();
    expect(asked().filter((url) => url === statusListUrl())).toHaveLength(1);

    outside.use(acceptingBoardConfiguration(7, [...designBoardColumns, { name: 'QA', statusIds: ['10009'] }]));
    await tickets.sync();
    expect(asked().filter((url) => url === statusListUrl())).toHaveLength(2);
  });

  it('AC-23: a status list that fails fails the sync, so no ticket lands in the wrong column', async () => {
    acceptingSprint();
    outside.use(http.get(statusListUrl(), () => HttpResponse.json({ errorMessages: ['Oops'] }, { status: 500 })));
    const { tickets } = setup({ settings: jiraConnected });

    expect(await tickets.sync()).toBe('failed');
    expect((await tickets.read()).jira).toMatchObject({ state: 'failed', problem: { kind: 'no_answer' } });
  });

  it('AC-5: a sprint Jira gives no board shows without In review, and no board is asked for', async () => {
    acceptingSprint();
    outside.use(
      acceptingMySprintSearch(designIssues.map((found) => ({ ...found, sprints: [{ id: 42, boardId: null }] }))),
    );
    const asked = requests();
    const { tickets } = setup({ settings: jiraConnected });

    expect(await tickets.sync()).toBe('answered');
    expect((await tickets.read()).tickets.map((ticket) => ticket.column)).toEqual([
      'to_do',
      'in_progress',
      'in_progress',
    ]);
    expect(asked().some((url) => url.includes('/rest/agile/'))).toBe(false);
  });

  it('AC-29: a sync that ends after Jira was disconnected writes nothing', async () => {
    acceptingSprint();
    outside.use(
      http.get(fieldListUrl(), async () => {
        await delay(50);
        return HttpResponse.json([]);
      }),
    );
    const { tickets, settings, cache } = setup({ settings: jiraConnected });

    const syncing = tickets.sync();
    await settings.update(() => ({}));
    expect(await syncing).toBe('not_connected');

    expect(cache.tool('jira_sprint')).toBeNull();
  });

  it('forgets the sprint', async () => {
    acceptingSprint();
    const { tickets, cache } = setup({ settings: jiraConnected });
    await tickets.sync();

    tickets.forget();

    expect(cache.tool('jira_sprint')).toBeNull();
  });

  it('says so in its line when the sync breaks in DevHub itself, such as a cache it can’t write', async () => {
    const home = join(await mkdtemp(join(tmpdir(), 'devhub-tickets-broken-')), 'home');
    const cache = openInboxCache(cacheFilePath(home));
    acceptingSprint();
    const { tickets, errors } = setup({ settings: jiraConnected, cache });
    try {
      // SQLite can't make its journal in a folder it can't write, so the write fails; reads still work.
      await chmod(home, 0o500);
      expect(await tickets.sync()).toBe('failed');

      expect((await tickets.read()).jira).toEqual({
        state: 'failed',
        problem: { kind: 'other', message: 'Something went wrong in the local server. See the terminal for details.' },
        lastSyncedAt: null,
      });
      expect(errors).toHaveLength(1);

      await chmod(home, 0o700);
      await tickets.sync();
      expect((await tickets.read()).jira.state).toBe('synced');
    } finally {
      await chmod(home, 0o700);
      cache.close();
      await rm(join(home, '..'), { recursive: true, force: true });
    }
  });
});
