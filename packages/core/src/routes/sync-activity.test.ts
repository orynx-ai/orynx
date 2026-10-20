import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, SyncActivitySchema, tokenHeader } from '@devhub/contracts';
import { createServer, type CoreOptions } from '../create-server.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import { acceptingInboxQuery, githubToken, graphqlUrl } from '../test/fake-github.ts';
import { acceptingIssueSearch, goodToken, jiraEmail, jiraSite } from '../test/fake-jira.ts';

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

async function server(options: Partial<CoreOptions> = {}) {
  const app = await createServer({
    token,
    port,
    version: '1.2.3',
    keychain: createMemoryKeychain({ jira: goodToken, github: githubToken }),
    settings: createMemorySettingsStore(bothConnected),
    ...options,
  });
  servers.push(app);
  return app;
}

async function read(app: FastifyInstance, query = '') {
  const response = await app.inject({ method: 'GET', url: `${apiRoutes.syncActivity}${query}`, headers });
  expect(response.statusCode).toBe(200);
  return SyncActivitySchema.parse(response.json());
}

afterEach(async () => {
  outside.resetHandlers();
  await Promise.all(servers.splice(0).map((app) => app.close()));
});

describe('/api/sync-activity', () => {
  it('refuses a request without the session token', async () => {
    const app = await server();

    const response = await app.inject({ method: 'GET', url: apiRoutes.syncActivity, headers: { host: headers.host } });

    expect(response.statusCode).toBe(401);
  });

  it('AC-19: before any sync, each tool is there with no runs', async () => {
    const app = await server();

    const activity = await read(app);

    expect(activity.tools.map((tool) => [tool.tool, tool.state.state, tool.lastSyncAt])).toEqual([
      ['jira', 'syncing', null],
      ['github', 'syncing', null],
    ]);
    expect(activity.runs).toEqual([]);
  });

  it('AC-20: Sync now for Jira syncs Jira alone, and the log shows its run and what it found', async () => {
    outside.use(acceptingIssueSearch([{ key: 'PROJ-1431', summary: 'Add bulk archive' }]), acceptingInboxQuery());
    const app = await server();

    const refresh = await app.inject({ method: 'POST', url: `${apiRoutes.inboxRefresh}?tool=jira`, headers });

    expect(refresh.statusCode).toBe(204);
    const activity = await read(app);
    expect(activity.runs.map((run) => [run.tool, run.problem, run.changes.map((change) => change.ref)])).toEqual([
      ['jira', null, ['PROJ-1431']],
    ]);
    expect(activity.tools.map((tool) => [tool.tool, tool.state.state, tool.changesToday])).toEqual([
      ['jira', 'synced', 1],
      ['github', 'syncing', 0],
    ]);
  });

  it('AC-18: shows one tool’s runs, or the failed ones alone', async () => {
    outside.use(
      acceptingIssueSearch([]),
      http.post(graphqlUrl, () => HttpResponse.json({ message: 'Server Error' }, { status: 502 })),
    );
    const app = await server();
    await app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });

    expect((await read(app, '?tool=jira')).runs.map((run) => run.tool)).toEqual(['jira']);
    expect((await read(app, '?show=failed')).runs.map((run) => [run.tool, run.problem])).toEqual([
      ['github', { kind: 'no_answer' }],
    ]);
  });

  it('refuses a tool Orynx doesn’t sync', async () => {
    const app = await server();

    for (const [method, url] of [
      ['GET', `${apiRoutes.syncActivity}?tool=slack`],
      ['POST', `${apiRoutes.inboxRefresh}?tool=slack`],
    ] as const) {
      expect((await app.inject({ method, url, headers })).statusCode).toBe(400);
    }
  });

  it('AC-37: the log holds no token', async () => {
    outside.use(acceptingIssueSearch([{ key: 'PROJ-1431' }]), acceptingInboxQuery());
    const app = await server();
    await app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });

    const body = (await app.inject({ method: 'GET', url: apiRoutes.syncActivity, headers })).body;

    for (const secret of [goodToken, githubToken, token]) expect(body).not.toContain(secret);
  });
});
