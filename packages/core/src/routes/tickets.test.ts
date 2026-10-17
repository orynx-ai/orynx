import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, TicketsSchema, tokenHeader } from '@devhub/contracts';
import { makeSessionSummary } from '@devhub/contracts/testing';
import { createServer, type CoreOptions } from '../create-server.ts';
import { cacheFilePath, openInboxCache } from '../inbox/inbox-cache.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import {
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

    const tickets = await readTickets(app);
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
    await first.close();
    outside.resetHandlers();

    const second = await server({ settings, cache: openInboxCache(cacheFilePath(folder)) });

    expect((await readTickets(second)).tickets.map((ticket) => ticket.key)).toEqual(['PROJ-1423']);
  });
});
