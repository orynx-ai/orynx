import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  defaultNotificationSettings,
  NotificationListSchema,
  NotificationSettingsSchema,
  tokenHeader,
  type ServerEvent,
} from '@devhub/contracts';
import { createServer, type CoreOptions } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import { openInboxCache } from '../inbox/inbox-cache.ts';
import { createFileSettingsStore, settingsFilePath } from '../settings/settings-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

const servers: FastifyInstance[] = [];
const folders: string[] = [];

const finished = {
  kind: 'session_finished',
  session: { id: '00000000000000bb', title: 'Read receipts on analytics', source: { kind: 'jira', key: 'PROJ-1398' } },
};

async function server(options: Partial<CoreOptions> = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const cache = options.cache ?? openInboxCache(':memory:');
  const app = await createServer({ token, port, version: '1.2.3', events, cache, ...options });
  servers.push(app);
  return { app, seen, cache };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe('/api/notifications (spec 029)', () => {
  it('answers 401 without the session token', async () => {
    const { app } = await server();
    const calls = [
      { method: 'GET', url: apiRoutes.notifications },
      { method: 'POST', url: apiRoutes.notificationsRead },
      { method: 'GET', url: apiRoutes.notificationSettings },
      { method: 'PATCH', url: apiRoutes.notificationSettings },
    ] as const;
    for (const call of calls) {
      const res = await app.inject({ ...call, headers: { host: headers.host } });
      expect(res.statusCode).toBe(401);
    }
  });

  it('AC-15: a fresh Orynx has none', async () => {
    const { app } = await server();

    const res = await app.inject({ method: 'GET', url: apiRoutes.notifications, headers });

    expect(NotificationListSchema.parse(res.json())).toEqual({ notifications: [], unread: 0, waiting: 0 });
  });

  it('AC-7, AC-13: lists what the cache keeps, marks one read, then all, and tells every tab', async () => {
    const { app, cache, seen } = await server();
    cache.addNotifications([
      { id: 'a', at: '2026-10-19T09:00:00.000Z', data: finished },
      { id: 'b', at: '2026-10-19T10:00:00.000Z', data: finished },
    ]);
    expect((await app.inject({ method: 'GET', url: apiRoutes.notifications, headers })).json()).toMatchObject({
      unread: 2,
    });

    const one = await app.inject({
      method: 'POST',
      url: apiRoutes.notificationsRead,
      headers,
      payload: { ids: ['a'] },
    });
    expect(one.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: apiRoutes.notifications, headers })).json()).toMatchObject({
      unread: 1,
      notifications: [
        { id: 'b', read: false },
        { id: 'a', read: true },
      ],
    });

    await app.inject({ method: 'POST', url: apiRoutes.notificationsRead, headers, payload: { all: true } });
    expect((await app.inject({ method: 'GET', url: apiRoutes.notifications, headers })).json()).toMatchObject({
      unread: 0,
    });
    expect(seen).toEqual([{ type: 'notifications.changed' }, { type: 'notifications.changed' }]);
  });

  it('refuses a read request it can’t make sense of', async () => {
    const { app } = await server();

    const res = await app.inject({ method: 'POST', url: apiRoutes.notificationsRead, headers, payload: { ids: [] } });

    expect(res.statusCode).toBe(400);
  });

  it('Clear cache empties the list and tells every tab', async () => {
    const { app, cache, seen } = await server();
    cache.addNotifications([{ id: 'a', at: '2026-10-19T09:00:00.000Z', data: finished }]);

    await app.inject({ method: 'DELETE', url: apiRoutes.inboxCache, headers });

    expect((await app.inject({ method: 'GET', url: apiRoutes.notifications, headers })).json()).toMatchObject({
      notifications: [],
    });
    expect(seen).toContainEqual({ type: 'notifications.changed' });
  });
});

describe('/api/notifications/settings (spec 029)', () => {
  it("GET answers with the design's defaults on a fresh Orynx", async () => {
    const { app } = await server();

    const res = await app.inject({ method: 'GET', url: apiRoutes.notificationSettings, headers });

    expect(NotificationSettingsSchema.parse(res.json())).toEqual(defaultNotificationSettings);
  });

  it('AC-39, AC-44: PATCH saves one change to settings.json, answers with every setting, and tells every tab', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'devhub-notifications-'));
    folders.push(folder);
    const { app, seen } = await server({ settings: createFileSettingsStore(folder) });

    const res = await app.inject({
      method: 'PATCH',
      url: apiRoutes.notificationSettings,
      headers,
      payload: { volume: 35 },
    });

    expect(res.statusCode).toBe(200);
    expect(NotificationSettingsSchema.parse(res.json()).volume).toBe(35);
    expect(JSON.parse(await readFile(settingsFilePath(folder), 'utf8'))).toMatchObject({
      notifications: { volume: 35 },
    });
    expect(seen).toEqual([{ type: 'settings.changed' }]);
  });

  it('AC-41: refuses quiet hours that start when they end, and saves nothing', async () => {
    const { app } = await server();
    const quietHours = { ...defaultNotificationSettings.quietHours, to: '19:00' };

    const res = await app.inject({
      method: 'PATCH',
      url: apiRoutes.notificationSettings,
      headers,
      payload: { quietHours },
    });

    expect(res.statusCode).toBe(400);
    const read = await app.inject({ method: 'GET', url: apiRoutes.notificationSettings, headers });
    expect(NotificationSettingsSchema.parse(read.json()).quietHours).toEqual(defaultNotificationSettings.quietHours);
  });
});
