import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, InboxSchema, tokenHeader, type ServerEvent } from '@devhub/contracts';
import { createServer, type CoreOptions } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import { cacheFilePath, openInboxCache } from '../inbox/inbox-cache.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import { acceptingInboxQuery, githubToken } from '../test/fake-github.ts';
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
const folders: string[] = [];

async function server(options: Partial<CoreOptions> = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const app = await createServer({
    token,
    port,
    version: '1.2.3',
    events,
    keychain: createMemoryKeychain({ jira: goodToken, github: githubToken }),
    ...options,
  });
  servers.push(app);
  return { app, seen };
}

async function readInbox(app: FastifyInstance) {
  const response = await app.inject({ method: 'GET', url: apiRoutes.inbox, headers });
  expect(response.statusCode).toBe(200);
  return InboxSchema.parse(response.json());
}

afterEach(async () => {
  outside.resetHandlers();
  await Promise.all(servers.splice(0).map((app) => app.close()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe('/api/inbox', () => {
  it('refuses a request without the session token', async () => {
    const { app } = await server();

    for (const [method, url] of [
      ['GET', apiRoutes.inbox],
      ['POST', apiRoutes.inboxRefresh],
      ['DELETE', apiRoutes.inboxCache],
    ] as const) {
      const response = await app.inject({ method, url, headers: { host: headers.host } });
      expect(response.statusCode).toBe(401);
    }
  });

  it('AC-21: with nothing connected the list is empty and neither tool is connected', async () => {
    const { app } = await server();

    expect(await readInbox(app)).toEqual({
      items: [],
      tools: { jira: { state: 'not_connected' }, github: { state: 'not_connected' } },
      syncedAt: null,
    });
  });

  it('AC-1, AC-17: Refresh syncs at once and answers when it has ended, then the list has the rows', async () => {
    outside.use(
      acceptingIssueSearch([{ key: 'PROJ-1423', statuscategorychangedate: '2026-10-15T09:00:00.000+0000' }]),
      acceptingInboxQuery({ reviews: [{ number: 2841, createdAt: '2026-10-14T09:00:00Z' }] }),
    );
    const { app, seen } = await server({ settings: createMemorySettingsStore(bothConnected) });

    const refresh = await app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });

    expect(refresh.statusCode).toBe(204);
    expect(seen).toContainEqual({ type: 'inbox.changed' });
    const inbox = await readInbox(app);
    expect(inbox.items.map((item) => item.id)).toEqual(['github:acme/web-app#2841', 'jira:PROJ-1423']);
    expect(inbox.tools.jira.state).toBe('synced');
    expect(inbox.tools.github.state).toBe('synced');
  });

  it('AC-15: a rule turned off in Settings takes its rows off the list', async () => {
    outside.use(acceptingIssueSearch([{ key: 'PROJ-1423' }]), acceptingInboxQuery({ reviews: [{ number: 2841 }] }));
    const { app } = await server({ settings: createMemorySettingsStore(bothConnected) });
    await app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });

    await app.inject({
      method: 'PATCH',
      url: apiRoutes.preferences,
      headers,
      payload: { inboxRules: { jira_assigned: false } },
    });

    expect((await readInbox(app)).items.map((item) => item.id)).toEqual(['github:acme/web-app#2841']);
  });

  it('AC-23: with Jira connected and GitHub not, the list has Jira’s rows and says GitHub isn’t connected', async () => {
    outside.use(acceptingIssueSearch([{ key: 'PROJ-1423' }]));
    const { app } = await server({
      settings: createMemorySettingsStore({ jira: { site: jiraSite, email: jiraEmail } }),
    });

    await app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });

    const inbox = await readInbox(app);
    expect(inbox.items.map((item) => item.id)).toEqual(['jira:PROJ-1423']);
    expect(inbox.tools.github).toEqual({ state: 'not_connected' });
  });

  it('AC-19: after a restart the list comes from cache.db at once, before Jira or GitHub answer', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'devhub-inbox-route-'));
    folders.push(folder);
    const settings = createMemorySettingsStore(bothConnected);
    outside.use(acceptingIssueSearch([{ key: 'PROJ-1423' }]), acceptingInboxQuery({ reviews: [{ number: 2841 }] }));
    const first = await server({ settings, cache: openInboxCache(cacheFilePath(folder)) });
    await first.app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });
    await first.app.close();
    outside.resetHandlers();

    const again = await server({ settings, cache: openInboxCache(cacheFilePath(folder)) });

    // The fakes' issue was created on 1 Oct and the pull request opened on 10 Oct: the issue waited longer.
    expect((await readInbox(again.app)).items.map((item) => item.id)).toEqual([
      'jira:PROJ-1423',
      'github:acme/web-app#2841',
    ]);
  });

  it('AC-31: Clear cache empties the list, tells open pages and syncs again', async () => {
    outside.use(acceptingIssueSearch([{ key: 'PROJ-1423' }]));
    const { app, seen } = await server({
      settings: createMemorySettingsStore({ jira: { site: jiraSite, email: jiraEmail } }),
    });
    await app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });
    seen.length = 0;

    const cleared = await app.inject({ method: 'DELETE', url: apiRoutes.inboxCache, headers });

    expect(cleared.statusCode).toBe(204);
    expect(seen).toContainEqual({ type: 'inbox.changed' });
    await app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });
    expect((await readInbox(app)).items.map((item) => item.id)).toEqual(['jira:PROJ-1423']);
  });
});
