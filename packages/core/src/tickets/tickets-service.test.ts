import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CreateOrynxTicketSchema, type SessionSummary } from '@devhub/contracts';
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
  acceptingIssue,
  acceptingProjectSprints,
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
  jiraIssue,
  jiraSite,
  myselfUrl,
  statusListUrl,
  type FakeIssue,
} from '../test/fake-jira.ts';
import { createOrynxTicketService, type OrynxTicketService } from '../orynx-tickets/ticket-service.ts';
import { createOrynxTicketStore } from '../orynx-tickets/ticket-store.ts';
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
const yourSprint = { projectKey: null, sprintId: null };

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
  orynx,
}: { settings?: Settings; sessions?: SessionSummary[]; cache?: InboxCache; orynx?: OrynxTicketService } = {}) {
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
    ...(orynx === undefined ? {} : { orynx: { tickets: orynx, you: () => Promise.resolve('Rakesh Dhariwal') } }),
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
      orynx: { kept: null },
      choice: yourSprint,
    });
    expect(asked()).toEqual([]);
  });

  it('AC-20: Jira is connected and hasn’t synced yet, so there is nothing to show', async () => {
    const { tickets } = setup({ settings: jiraConnected });

    expect(await tickets.read()).toEqual({
      jira: { state: 'syncing' },
      sprint: null,
      tickets: [],
      truncated: false,
      orynx: { kept: null },
      choice: yourSprint,
    });
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

  it("AC-12, 047 AC-5: a ticket shows its newest session that isn't stopped", async () => {
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
      ['PROJ-1423', { id: 'old', state: 'needs_you', ready: 'pull_request' }],
      ['PROJ-1350', { id: 'newer', state: 'working', ready: 'pull_request' }],
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
      orynx: { kept: null },
      choice: yourSprint,
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

    // 10009 isn't in the status list either: it was asked about, so the list isn't read again for it.
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

  it('forgets the sprint, and the status list with it', async () => {
    acceptingSprint();
    const asked = requests();
    const { tickets, cache } = setup({ settings: jiraConnected });
    await tickets.sync();

    tickets.forget();

    expect(cache.tool('jira_sprint')).toBeNull();
    await tickets.sync();
    expect(asked().filter((url) => url === statusListUrl())).toHaveLength(2);
  });

  it('builds each ticket’s link from the saved site, never from the cache', async () => {
    acceptingSprint();
    const { tickets, cache } = setup({ settings: jiraConnected });
    await tickets.sync();
    // A cache someone else wrote, pointing a title at a lookalike site.
    const stored = cache.tool('jira_sprint');
    const kept = stored?.records[0] as { for: unknown; record: { tickets: Record<string, unknown>[] } };
    cache.synced('jira_sprint', {
      connection: stored?.connection ?? '',
      at: '2026-10-17T10:00:00.000Z',
      records: [
        {
          id: 'sprint',
          data: {
            ...kept,
            record: {
              ...kept.record,
              tickets: kept.record.tickets.map((ticket) => ({ ...ticket, url: 'https://evil-team.atlassian.net/x' })),
            },
          },
        },
      ],
    });

    const read = await tickets.read();

    expect(read.tickets.map((ticket) => ticket.url)).toEqual([
      'https://your-team.atlassian.net/browse/PROJ-1377',
      'https://your-team.atlassian.net/browse/PROJ-1423',
      'https://your-team.atlassian.net/browse/PROJ-1350',
    ]);
  });

  it('a sprint that would break the contract fails the sync and keeps the last good one', async () => {
    acceptingSprint();
    const { tickets, errors } = setup({ settings: jiraConnected });
    await tickets.sync();
    // A priority with no name: Jira sends it, but a ticket can't have one.
    outside.use(
      http.post('https://your-team.atlassian.net/rest/api/3/search/jql', async ({ request }) => {
        const body = (await request.clone().json()) as { jql?: string };
        if (body.jql?.startsWith('sprint = 42 ') !== true) return undefined;
        const issue = jiraIssue({ key: 'PROJ-1', priority: null });
        return HttpResponse.json({
          issues: [{ ...issue, fields: { ...issue.fields, priority: { id: '2', name: '' } } }],
          isLast: true,
        });
      }),
    );

    expect(await tickets.sync()).toBe('failed');

    const read = await tickets.read();
    expect(read.jira).toMatchObject({ state: 'failed', problem: { kind: 'other' } });
    expect(read.tickets).toHaveLength(3);
    expect(errors).toHaveLength(1);
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

/** WEB's board 11: Sprint 43 active, Sprint 44 next, and Sprint 41 closed, each with one ticket. */
function acceptingWeb() {
  outside.use(
    acceptingMyself(),
    ...acceptingProjectSprints({
      WEB: [
        {
          id: 11,
          sprints: [
            { id: 41, name: 'Sprint 41', state: 'closed', endDate: '2026-10-10T17:00:00.000Z' },
            { id: 43, name: 'Sprint 43', state: 'active', endDate: '2026-10-24T17:00:00.000Z' },
            { id: 44, name: 'Sprint 44', state: 'future', startDate: '2026-10-27T09:00:00.000Z', endDate: null },
          ],
        },
      ],
      OPS: [],
    }),
    acceptingBoardConfiguration(11, designBoardColumns),
    acceptingStatusList(),
    acceptingPrioritySearch(),
    acceptingSprintIssueSearch(41, [{ key: 'WEB-1', summary: 'Closed work' }]),
    acceptingSprintIssueSearch(43, [{ key: 'WEB-7', summary: 'Ship the new footer' }]),
  );
}

describe('tickets service: the sprint you pick (spec 020)', () => {
  it('AC-26: a picked project shows its current sprint: reads say syncing until a sync has read it', async () => {
    acceptingSprint();
    acceptingWeb();
    const { tickets, settings } = setup({ settings: jiraConnected });
    await tickets.sync();
    expect((await tickets.read()).sprint?.name).toBe('Sprint 42');

    await tickets.choose({ projectKey: 'WEB', sprintId: null });

    expect((await settings.read()).tickets).toEqual({ projectKey: 'WEB', sprintId: null });
    expect(await tickets.read()).toEqual({
      jira: { state: 'syncing' },
      choice: { projectKey: 'WEB', sprintId: null },
      sprint: null,
      tickets: [],
      truncated: false,
      orynx: { kept: null },
    });
    expect(await tickets.sync()).toBe('answered');
    const read = await tickets.read();
    expect(read.choice).toEqual({ projectKey: 'WEB', sprintId: null });
    expect(read.sprint).toEqual({ id: 43, name: 'Sprint 43', endsAt: '2026-10-24T17:00:00.000Z', projectKey: 'WEB' });
    expect(read.tickets.map((ticket) => [ticket.key, ticket.assignee?.mine])).toEqual([['WEB-7', true]]);
  });

  it('AC-27: a picked sprint stays picked, even once it has closed', async () => {
    acceptingWeb();
    const { tickets } = setup({ settings: { ...jiraConnected, tickets: { projectKey: 'WEB', sprintId: 41 } } });

    await tickets.sync();

    const read = await tickets.read();
    expect(read.sprint?.name).toBe('Sprint 41');
    expect(read.tickets.map((ticket) => ticket.key)).toEqual(['WEB-1']);
  });

  it('AC-28: a project with no open sprint has none to show, and says which project was picked', async () => {
    acceptingWeb();
    const { tickets } = setup({ settings: { ...jiraConnected, tickets: { projectKey: 'OPS', sprintId: null } } });

    expect(await tickets.sync()).toBe('answered');

    expect(await tickets.read()).toEqual({
      jira: { state: 'synced', at: '2026-10-17T10:00:00.000Z' },
      choice: { projectKey: 'OPS', sprintId: null },
      sprint: null,
      tickets: [],
      truncated: false,
      orynx: { kept: null },
    });
  });

  it('AC-29: picking your sprint again leaves nothing in settings and reads your sprint', async () => {
    acceptingSprint();
    acceptingWeb();
    const { tickets, settings } = setup({
      settings: { ...jiraConnected, tickets: { projectKey: 'WEB', sprintId: 43 } },
    });
    await tickets.sync();

    await tickets.choose({ projectKey: null, sprintId: null });
    await tickets.sync();

    expect((await settings.read()).tickets).toBeUndefined();
    expect((await tickets.read()).sprint?.name).toBe('Sprint 42');
  });

  it('AC-27: a picked sprint that’s gone has nothing to show, rather than failing', async () => {
    acceptingWeb();
    outside.use(
      http.get(`https://${jiraSite}/rest/agile/1.0/sprint/99`, () => new HttpResponse(null, { status: 404 })),
    );
    const { tickets } = setup({ settings: { ...jiraConnected, tickets: { projectKey: 'WEB', sprintId: 99 } } });

    expect(await tickets.sync()).toBe('answered');
    expect((await tickets.read()).sprint).toBeNull();
  });

  it('a failed sync after a new pick keeps the failure in view, not the old sprint', async () => {
    acceptingSprint();
    const { tickets } = setup({ settings: jiraConnected });
    await tickets.sync();
    outside.resetHandlers();
    outside.use(http.get(myselfUrl(), () => HttpResponse.json({}, { status: 500 })));

    await tickets.choose({ projectKey: 'WEB', sprintId: null });
    expect(await tickets.sync()).toBe('failed');

    const read = await tickets.read();
    expect(read.jira.state).toBe('failed');
    // The last good sync was the old pick's, so Jira hasn't yet said whether the new one has a sprint.
    expect(read.jira).toMatchObject({ lastSyncedAt: null });
    expect(read.sprint).toBeNull();
  });

  it('reads a sprint kept before spec 020 as your sprint', async () => {
    acceptingSprint();
    const { tickets, cache } = setup({ settings: jiraConnected });
    await tickets.sync();
    const stored = cache.tool('jira_sprint');
    const kept = stored?.records[0] as { record: unknown };
    // Before spec 020 the row held the record alone.
    cache.synced('jira_sprint', {
      connection: stored?.connection ?? '',
      at: '2026-10-17T10:00:00.000Z',
      records: [{ id: 'sprint', data: kept.record }],
    });

    expect((await tickets.read()).sprint?.name).toBe('Sprint 42');
  });

  it('AC-39: No sprint reads the tickets in no sprint, the project’s or yours, with no sprint of their own', async () => {
    const asked: string[] = [];
    outside.use(
      acceptingMyself(),
      acceptingPrioritySearch(),
      http.post(`https://${jiraSite}/rest/api/3/search/jql`, async ({ request }) => {
        asked.push(((await request.json()) as { jql: string }).jql);
        return HttpResponse.json({
          issues: [jiraIssue({ key: 'WEB-9', summary: 'Tidy the footer links', category: 'indeterminate' })],
          isLast: true,
        });
      }),
    );
    const { tickets } = setup({ settings: { ...jiraConnected, tickets: { projectKey: 'WEB', sprintId: 'none' } } });

    expect(await tickets.sync()).toBe('answered');

    const read = await tickets.read();
    expect(read.choice).toEqual({ projectKey: 'WEB', sprintId: 'none' });
    expect(read.sprint).toBeNull();
    expect(read.tickets.map((ticket) => [ticket.key, ticket.column])).toEqual([['WEB-9', 'in_progress']]);
    expect(asked[0]).toBe('project = "WEB" AND sprint is EMPTY AND statusCategory != Done ORDER BY Rank ASC');

    await tickets.choose({ projectKey: null, sprintId: 'none' });
    await tickets.sync();
    expect(asked.at(-1)).toBe(
      'assignee = currentUser() AND sprint is EMPTY AND statusCategory != Done ORDER BY Rank ASC',
    );
    expect((await tickets.read()).choice).toEqual({ projectKey: null, sprintId: 'none' });
  });
});

describe('one ticket in full (spec 022)', () => {
  it('AC-40: reads the ticket from Jira with its column from the board, its link and its session', async () => {
    acceptingSprint();
    outside.use(
      acceptingIssue({
        key: 'PROJ-1350',
        summary: 'Migrate feed cards to the new Card component',
        status: { name: 'In Review', category: 'indeterminate' },
        priority: 'High',
        assignee: 'Rakesh Dhariwal',
        reporter: 'Neha K.',
        dueDate: '2026-10-24',
        labels: ['cards'],
        created: '2026-10-01T09:00:00.000+0100',
        updated: '2026-10-18T10:30:00.000+0100',
        comments: [{ author: 'Neha K.', created: '2026-10-18T10:30:00.000+0100', body: null }],
      }),
    );
    const session = makeSessionSummary({ id: '0000000000000007', source: { kind: 'jira', key: 'PROJ-1350' } });
    const { tickets } = setup({ settings: jiraConnected, sessions: [session] });
    await tickets.sync();

    const answer = await tickets.detail('PROJ-1350');

    expect(answer).toMatchObject({
      result: 'found',
      ticket: {
        key: 'PROJ-1350',
        url: `https://${jiraSite}/browse/PROJ-1350`,
        title: 'Migrate feed cards to the new Card component',
        type: 'Story',
        status: { name: 'In Review', column: 'in_review' },
        priority: 'High',
        assignee: 'Rakesh Dhariwal',
        reporter: 'Neha K.',
        dueDate: '2026-10-24',
        labels: ['cards'],
        created: '2026-10-01T08:00:00.000Z',
        updated: '2026-10-18T09:30:00.000Z',
        comments: [],
        session: { id: '0000000000000007', state: session.state },
      },
    });
  });

  it('AC-40: a ticket the sprint doesn’t hold sits in its status category’s column', async () => {
    outside.use(acceptingIssue({ key: 'OPS-9', status: { name: 'Doing', category: 'indeterminate' } }));
    const { tickets } = setup({ settings: jiraConnected });
    expect(await tickets.detail('OPS-9')).toMatchObject({
      result: 'found',
      ticket: { status: { name: 'Doing', column: 'in_progress' }, session: null, priority: null, labels: [] },
    });
  });

  it('AC-44: says when Jira can’t find it, isn’t connected or doesn’t answer, and keeps nothing', async () => {
    outside.use(acceptingIssue({ key: 'PROJ-1423' }));
    const { tickets, cache } = setup({ settings: jiraConnected });
    expect(await tickets.detail('PROJ-9999')).toEqual({ result: 'not_found' });
    expect(await setup().tickets.detail('PROJ-1423')).toEqual({ result: 'not_connected' });
    outside.use(
      http.get(`https://${jiraSite}/rest/api/3/issue/:key`, async () => {
        await delay(1000);
        return HttpResponse.json({});
      }),
    );
    expect(await tickets.detail('PROJ-1423')).toEqual({ result: 'unreachable' });
    expect(cache.tool('jira_sprint')).toBeNull();
  });
});

describe('Orynx tickets on the board (spec 037)', () => {
  const day = 24 * 60 * 60 * 1000;

  /** ORX-1 in To do and ORX-2 in progress, both made at the clock's start. */
  async function orynxTickets(path?: string) {
    const service = createOrynxTicketService({
      store: createOrynxTicketStore({ ...(path === undefined ? {} : { path }), now: () => clock }),
      sessions: createMemorySessionStore([
        makeSessionSummary({ id: 's-2', state: 'working', source: { kind: 'jira', key: 'ORX-2' } }),
      ]),
      events: createEventBus(),
    });
    await service.create(CreateOrynxTicketSchema.parse({ title: 'Add bulk archive' }), { kind: 'you' });
    await service.create(
      CreateOrynxTicketSchema.parse({
        title: 'Fix the date test',
        type: 'Bug',
        priority: 'Highest',
        status: 'in_progress',
        dueDate: '2026-10-24',
      }),
      { kind: 'you' },
    );
    return service;
  }

  it('AC-1: Orynx tickets follow the sprint’s, as yours, in their columns, with their sessions', async () => {
    acceptingSprint();
    const { tickets } = setup({ settings: jiraConnected, orynx: await orynxTickets() });
    await tickets.sync();

    const read = await tickets.read();

    expect(read.tickets.map((ticket) => [ticket.key, ticket.column])).toEqual([
      ['PROJ-1377', 'to_do'],
      ['PROJ-1423', 'in_progress'],
      ['PROJ-1350', 'in_review'],
      ['ORX-1', 'to_do'],
      ['ORX-2', 'in_progress'],
    ]);
    expect(read.tickets[4]).toEqual({
      key: 'ORX-2',
      title: 'Fix the date test',
      url: null,
      status: 'In progress',
      column: 'in_progress',
      type: 'Bug',
      bug: true,
      priority: { name: 'Highest', level: 'high', rank: 0 },
      dueDate: '2026-10-24',
      assignee: { name: 'Rakesh Dhariwal', mine: true },
      session: { id: 's-2', state: 'working', ready: 'pull_request' },
    });
    expect(read.orynx).toEqual({ kept: null });
  });

  it('AC-4: with Jira not connected, or its sprint still syncing, the board holds Orynx tickets alone', async () => {
    const orynx = await orynxTickets();

    const without = await setup({ orynx }).tickets.read();
    expect(without.jira).toEqual({ state: 'not_connected' });
    expect(without.tickets.map((ticket) => ticket.key)).toEqual(['ORX-1', 'ORX-2']);

    const syncing = await setup({ settings: jiraConnected, orynx }).tickets.read();
    expect(syncing.jira).toEqual({ state: 'syncing' });
    expect(syncing.tickets.map((ticket) => ticket.key)).toEqual(['ORX-1', 'ORX-2']);
  });

  it('AC-21: a ticket stays in Done for 14 days after it got there, then leaves the board', async () => {
    const orynx = await orynxTickets();
    await orynx.update('ORX-1', { status: 'done' });
    clock += 11 * day;
    await orynx.update('ORX-2', { status: 'done' });
    const { tickets } = setup({ orynx });

    clock = start + 14 * day;
    expect((await tickets.read()).tickets.map((ticket) => ticket.key)).toEqual(['ORX-1', 'ORX-2']);

    clock = start + 15 * day;
    expect((await tickets.read()).tickets.map((ticket) => ticket.key)).toEqual(['ORX-2']);
  });

  it('AC-34: names the tickets file it couldn’t read and kept aside', async () => {
    const home = await mkdtemp(join(tmpdir(), 'orynx-board-'));
    try {
      const path = join(home, 'tickets.json');
      await writeFile(path, 'not json');
      const { tickets } = setup({ orynx: await orynxTickets(path) });

      const read = await tickets.read();

      expect(read.orynx).toEqual({ kept: 'tickets-20261017-100000.unreadable.json' });
      expect(read.tickets.map((ticket) => ticket.key)).toEqual(['ORX-1', 'ORX-2']);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
