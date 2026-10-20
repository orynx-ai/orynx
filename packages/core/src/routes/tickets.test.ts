import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  OpenSprintsSchema,
  TicketDetailAnswerSchema,
  TicketsSchema,
  tokenHeader,
} from '@devhub/contracts';
import { makeSessionSummary } from '@devhub/contracts/testing';
import { createServer, type CoreOptions } from '../create-server.ts';
import { cacheFilePath, openInboxCache } from '../inbox/inbox-cache.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import {
  acceptingIssue,
  acceptingProjectSprints,
  acceptingPrioritySearch,
  acceptingBoardConfiguration,
  acceptingFieldList,
  acceptingIssueSearch,
  acceptingMyself,
  acceptingMySprintSearch,
  acceptingSprintIssueSearch,
  acceptingStatusList,
  goodToken,
  jiraEmail,
  jiraSite,
  type FakeIssue,
} from '../test/fake-jira.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const jiraConnected: Settings = { jira: { site: jiraSite, email: jiraEmail } };

/** Jira, the outside service, faked for this file only. */
const outside = setupServer();
beforeAll(() => {
  outside.listen({ onUnhandledFrame: 'error' });
});
afterAll(() => {
  outside.close();
});

const servers: FastifyInstance[] = [];
const folders: string[] = [];

afterEach(async () => {
  outside.resetHandlers();
  await Promise.all(servers.splice(0).map((app) => app.close()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function server(options: Partial<CoreOptions> = {}) {
  const app = await createServer({
    token,
    port,
    version: '1.2.3',
    keychain: createMemoryKeychain({ jira: goodToken }),
    ...options,
  });
  servers.push(app);
  return app;
}

/** Jira answering Home's read and every read of the sprint. */
function acceptingSprint(issues: FakeIssue[]) {
  outside.use(
    acceptingMyself(),
    acceptingFieldList(),
    acceptingMySprintSearch(
      issues.map((issue) => ({ ...issue, sprints: [{ id: 42, name: 'Sprint 42', boardId: 7 }] })),
    ),
    acceptingSprintIssueSearch(42, issues),
    acceptingBoardConfiguration(7),
    acceptingStatusList(),
    acceptingIssueSearch([]),
  );
}

async function readTickets(app: FastifyInstance) {
  const response = await app.inject({ method: 'GET', url: apiRoutes.tickets, headers });
  expect(response.statusCode).toBe(200);
  return TicketsSchema.parse(response.json());
}

describe('/api/tickets', () => {
  it('refuses a request without the session token', async () => {
    const app = await server();

    const response = await app.inject({ method: 'GET', url: apiRoutes.tickets, headers: { host: headers.host } });

    expect(response.statusCode).toBe(401);
  });

  it('AC-21: with Jira not connected there is no sprint', async () => {
    const app = await server();

    expect(await readTickets(app)).toEqual({
      jira: { state: 'not_connected' },
      sprint: null,
      tickets: [],
      truncated: false,
      orynx: { kept: null },
      choice: { projectKey: null, sprintId: null },
    });
  });

  it('AC-1, AC-12: Refresh syncs the sprint too, and its tickets come with their sessions', async () => {
    acceptingSprint([{ key: 'PROJ-1423', summary: 'Add bulk archive to the content list', priority: null }]);
    const app = await server({
      settings: createMemorySettingsStore(jiraConnected),
      sessions: createMemorySessionStore([
        makeSessionSummary({ id: 'session-1', state: 'needs_you', source: { kind: 'jira', key: 'PROJ-1423' } }),
      ]),
    });

    await app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });

    // Refresh answers when Home's rows are in; the sprint follows on its own.
    const tickets = await vi.waitFor(async () => {
      const read = await readTickets(app);
      expect(read.sprint).not.toBeNull();
      return read;
    });
    expect(tickets.sprint).toMatchObject({ name: 'Sprint 42', projectKey: 'PROJ' });
    expect(tickets.tickets).toMatchObject([
      {
        key: 'PROJ-1423',
        title: 'Add bulk archive to the content list',
        session: { id: 'session-1', state: 'needs_you' },
      },
    ]);
  });

  it('AC-19: after a restart the sprint comes from cache.db at once, before Jira answers', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'devhub-tickets-route-'));
    folders.push(folder);
    const settings = createMemorySettingsStore(jiraConnected);
    acceptingSprint([{ key: 'PROJ-1423', priority: null }]);
    const first = await server({ settings, cache: openInboxCache(cacheFilePath(folder)) });
    await first.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });
    // Closing waits for the sprint's pass to end before the cache closes.
    await first.close();
    outside.resetHandlers();

    const second = await server({ settings, cache: openInboxCache(cacheFilePath(folder)) });

    expect((await readTickets(second)).tickets.map((ticket) => ticket.key)).toEqual(['PROJ-1423']);
  });
});

describe('/api/tickets/sprints and /api/tickets/choice (spec 020)', () => {
  const web = {
    WEB: [
      {
        id: 11,
        sprints: [
          { id: 44, name: 'Sprint 44', state: 'future' as const, startDate: '2026-10-27T09:00:00.000Z', endDate: null },
          { id: 43, name: 'Sprint 43', state: 'active' as const, endDate: '2026-10-24T17:00:00.000Z' },
        ],
      },
    ],
  };

  it('AC-26: lists a project’s active sprints, then its future ones, with their dates', async () => {
    outside.use(...acceptingProjectSprints(web));
    const app = await server({ settings: createMemorySettingsStore(jiraConnected) });

    const response = await app.inject({ method: 'GET', url: `${apiRoutes.ticketsSprints}?project=WEB`, headers });

    expect(response.statusCode).toBe(200);
    expect(OpenSprintsSchema.parse(response.json())).toEqual({
      sprints: [
        {
          id: 43,
          name: 'Sprint 43',
          state: 'active',
          startsAt: '2026-10-10T09:00:00.000Z',
          endsAt: '2026-10-24T17:00:00.000Z',
        },
        { id: 44, name: 'Sprint 44', state: 'future', startsAt: '2026-10-27T09:00:00.000Z', endsAt: null },
      ],
    });
  });

  it('AC-28: says why the sprints didn’t load, and refuses a project key it can’t read', async () => {
    const app = await server();
    const notConnected = await app.inject({ method: 'GET', url: `${apiRoutes.ticketsSprints}?project=WEB`, headers });
    expect(notConnected.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(notConnected.json()).code).toBe('bad_request');

    const bad = await app.inject({ method: 'GET', url: `${apiRoutes.ticketsSprints}?project=web%20app`, headers });
    expect(bad.statusCode).toBe(400);
  });

  it('AC-26, AC-27: saving a choice answers 204, reads say syncing, then its sprint once the pass ends', async () => {
    acceptingSprint([{ key: 'PROJ-1423', summary: 'Add bulk archive', priority: null }]);
    outside.use(
      ...acceptingProjectSprints(web),
      acceptingBoardConfiguration(11),
      acceptingPrioritySearch(),
      acceptingSprintIssueSearch(43, [{ key: 'WEB-7', summary: 'Ship the new footer', priority: null }]),
    );
    const settings = createMemorySettingsStore(jiraConnected);
    const app = await server({ settings });

    const saved = await app.inject({
      method: 'PUT',
      url: apiRoutes.ticketsChoice,
      headers,
      payload: { projectKey: 'WEB', sprintId: null },
    });

    expect(saved.statusCode).toBe(204);
    expect((await settings.read()).tickets).toEqual({ projectKey: 'WEB', sprintId: null });
    const read = await vi.waitFor(async () => {
      const tickets = await readTickets(app);
      expect(tickets.sprint).not.toBeNull();
      return tickets;
    });
    expect(read.choice).toEqual({ projectKey: 'WEB', sprintId: null });
    expect(read.sprint?.name).toBe('Sprint 43');
    expect(read.tickets.map((ticket) => ticket.key)).toEqual(['WEB-7']);
  });

  it('refuses a sprint picked without its project, and a request without the session token', async () => {
    const app = await server({ settings: createMemorySettingsStore(jiraConnected) });

    const orphan = await app.inject({
      method: 'PUT',
      url: apiRoutes.ticketsChoice,
      headers,
      payload: { projectKey: null, sprintId: 43 },
    });
    expect(orphan.statusCode).toBe(400);

    const anonymous = await app.inject({
      method: 'PUT',
      url: apiRoutes.ticketsChoice,
      headers: { host: headers.host },
      payload: { projectKey: null, sprintId: null },
    });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('/api/tickets/:key (spec 022)', () => {
  const url = (key: string) => apiRoutes.ticket.replace(':key', key);

  it('refuses a request without the session token', async () => {
    const app = await server();
    const response = await app.inject({ method: 'GET', url: url('PROJ-1423'), headers: { host: headers.host } });
    expect(response.statusCode).toBe(401);
    expect(ApiErrorSchema.parse(response.json()).code).toBe('unauthorized');
  });

  it('AC-40: answers the ticket as Jira gives it now', async () => {
    outside.use(acceptingIssue({ key: 'PROJ-1423', summary: 'Add bulk archive', priority: 'High' }));
    const app = await server({ settings: createMemorySettingsStore(jiraConnected) });

    const response = await app.inject({ method: 'GET', url: url('PROJ-1423'), headers });

    expect(response.statusCode).toBe(200);
    expect(TicketDetailAnswerSchema.parse(response.json())).toMatchObject({
      result: 'found',
      ticket: {
        key: 'PROJ-1423',
        title: 'Add bulk archive',
        priority: 'High',
        url: `https://${jiraSite}/browse/PROJ-1423`,
      },
    });
  });

  it('AC-44: says when Jira can’t find it, and refuses a key Jira never makes', async () => {
    outside.use(acceptingIssue({ key: 'PROJ-1423' }));
    const app = await server({ settings: createMemorySettingsStore(jiraConnected) });

    const missing = await app.inject({ method: 'GET', url: url('PROJ-9999'), headers });
    expect(TicketDetailAnswerSchema.parse(missing.json())).toEqual({ result: 'not_found' });

    const odd = await app.inject({ method: 'GET', url: url('proj-1'), headers });
    expect(odd.statusCode).toBe(400);
  });
});
