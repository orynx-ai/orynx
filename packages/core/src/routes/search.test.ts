import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ApiErrorSchema, apiRoutes, SearchIndexSchema, tokenHeader } from '@devhub/contracts';
import { makeSessionSummary } from '@devhub/contracts/testing';
import { createServer, type CoreOptions } from '../create-server.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import { acceptingInboxQuery, githubToken } from '../test/fake-github.ts';
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
const bothConnected: Settings = { jira: { site: jiraSite, email: jiraEmail }, github: { method: 'token' } };

/** Jira and GitHub, the outside services, faked for this file only. */
const outside = setupServer();
beforeAll(() => {
  outside.listen({ onUnhandledFrame: 'error' });
});
afterAll(() => {
  outside.close();
});

const servers: FastifyInstance[] = [];

afterEach(async () => {
  outside.resetHandlers();
  await Promise.all(servers.splice(0).map((app) => app.close()));
});

async function server(options: Partial<CoreOptions> = {}) {
  const app = await createServer({
    token,
    port,
    version: '1.2.3',
    keychain: createMemoryKeychain({ jira: goodToken, github: githubToken }),
    ...options,
  });
  servers.push(app);
  return app;
}

/** Jira answering Home's read of your assigned issues and every read of the sprint. */
function acceptingJira({ assigned, sprint }: { assigned: FakeIssue[]; sprint: FakeIssue[] }) {
  outside.use(
    acceptingMyself(),
    acceptingFieldList(),
    acceptingMySprintSearch(
      sprint.map((issue) => ({ ...issue, sprints: [{ id: 42, name: 'Sprint 42', boardId: 7 }] })),
    ),
    acceptingSprintIssueSearch(42, sprint),
    acceptingBoardConfiguration(7),
    acceptingStatusList(),
    acceptingIssueSearch(assigned),
  );
}

async function readSearch(app: FastifyInstance) {
  const response = await app.inject({ method: 'GET', url: apiRoutes.search, headers });
  expect(response.statusCode).toBe(200);
  return SearchIndexSchema.parse(response.json());
}

describe('/api/search', () => {
  it('AC-28: refuses a request without the session token', async () => {
    const app = await server();

    const response = await app.inject({ method: 'GET', url: apiRoutes.search, headers: { host: headers.host } });

    expect(response.statusCode).toBe(401);
  });

  it('AC-28: refuses a DNS-rebinding Host header even with the right token', async () => {
    const app = await server();

    const response = await app.inject({
      method: 'GET',
      url: apiRoutes.search,
      headers: { host: `evil.example:${String(port)}`, [tokenHeader]: token },
    });

    expect(response.statusCode).toBe(403);
    expect(ApiErrorSchema.parse(response.json()).code).toBe('forbidden_host');
  });

  it('AC-22: with nothing connected and no sessions there is nothing to search, and Jira and GitHub are never asked', async () => {
    const asked: string[] = [];
    outside.events.on('request:start', ({ request }) => asked.push(request.url));
    const app = await server();

    expect(await readSearch(app)).toEqual({
      tickets: [],
      pullRequests: [],
      sessions: [],
      tools: { jira: { state: 'not_connected' }, github: { state: 'not_connected' } },
    });
    expect(asked).toEqual([]);
    outside.events.removeAllListeners();
  });

  it('AC-6, AC-8, AC-9, AC-16, AC-17, AC-18: finds the sprint, assigned issues, every open pull request and sessions, whatever the inbox rules say', async () => {
    acceptingJira({
      sprint: [{ key: 'PROJ-1423', summary: 'Add bulk archive to the content list', priority: null }],
      assigned: [
        { key: 'PROJ-1423', summary: 'Add bulk archive to the content list' },
        { key: 'PROJ-7', summary: 'Fix the login redirect' },
      ],
    });
    outside.use(
      acceptingInboxQuery({
        reviews: [{ number: 2841, title: 'Lazy-load the people directory', createdAt: '2026-10-16T09:00:00Z' }],
        mine: [{ number: 2836, title: 'Tidy the settings page', createdAt: '2026-10-12T09:00:00Z', checks: 'SUCCESS' }],
      }),
    );
    const settings = createMemorySettingsStore(bothConnected);
    const app = await server({
      settings,
      sessions: createMemorySessionStore([
        makeSessionSummary({ id: 'session-1', state: 'needs_you', source: { kind: 'jira', key: 'PROJ-1423' } }),
      ]),
    });
    const rulesOff = await app.inject({
      method: 'PATCH',
      url: apiRoutes.preferences,
      headers,
      payload: { inboxRules: { jira_assigned: false, review_requested: false } },
    });
    expect(rulesOff.statusCode).toBe(200);

    await app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });

    // Refresh answers when Home's rows are in; the sprint follows on its own.
    const found = await vi.waitFor(async () => {
      const read = await readSearch(app);
      expect(read.tickets[0]?.key).toBe('PROJ-1423');
      return read;
    });
    expect(found.tickets.map((ticket) => [ticket.key, ticket.title, ticket.target])).toEqual([
      ['PROJ-1423', 'Add bulk archive to the content list', { kind: 'session', sessionId: 'session-1' }],
      ['PROJ-7', 'Fix the login redirect', { kind: 'external', url: `https://${jiraSite}/browse/PROJ-7` }],
    ]);
    expect(found.pullRequests.map((request) => [request.number, request.title, request.url])).toEqual([
      [2841, 'Lazy-load the people directory', 'https://github.com/acme/web-app/pull/2841'],
      [2836, 'Tidy the settings page', 'https://github.com/acme/web-app/pull/2836'],
    ]);
    expect(found.sessions.map((session) => session.id)).toEqual(['session-1']);
  });
});
