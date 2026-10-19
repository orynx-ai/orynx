import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, defaultNotificationSettings, tokenHeader } from '@devhub/contracts';
import { makeNotification, makeNotificationList } from '@devhub/contracts/testing';
import { createApiClient, notificationSettingsQueryOptions, notificationsQueryOptions, queryKeys } from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const server = setupServer();
const api = createApiClient({ baseURL, token: 'abc' });

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('notification endpoints (spec 029)', () => {
  it('AC-4: reads the list with the page token, checked against the contract', async () => {
    let token: string | null = null;
    const list = makeNotificationList([makeNotification()]);
    server.use(
      http.get(`${baseURL}${apiRoutes.notifications}`, ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(list);
      }),
    );

    expect(await api.notifications()).toEqual(list);
    expect(token).toBe('abc');
    expect(notificationsQueryOptions(api).queryKey).toEqual(queryKeys.notifications);
  });

  it('refuses a list that breaks the contract', async () => {
    server.use(http.get(`${baseURL}${apiRoutes.notifications}`, () => HttpResponse.json({ notifications: 'no' })));

    await expect(api.notifications()).rejects.toThrow();
  });

  it('AC-13: marks some read, or all', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${baseURL}${apiRoutes.notificationsRead}`, async ({ request }) => {
        bodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.markNotificationsRead({ ids: ['n-1'] });
    await api.markNotificationsRead({ all: true });

    expect(bodies).toEqual([{ ids: ['n-1'] }, { all: true }]);
  });

  it('AC-39: reads the settings and sends one change', async () => {
    let body: unknown;
    server.use(
      http.get(`${baseURL}${apiRoutes.notificationSettings}`, () => HttpResponse.json(defaultNotificationSettings)),
      http.patch(`${baseURL}${apiRoutes.notificationSettings}`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...defaultNotificationSettings, volume: 35 });
      }),
    );

    expect(await api.notificationSettings()).toEqual(defaultNotificationSettings);
    expect((await api.changeNotificationSettings({ volume: 35 })).volume).toBe(35);
    expect(body).toEqual({ volume: 35 });
    expect(notificationSettingsQueryOptions(api).queryKey).toEqual(queryKeys.notificationSettings);
  });
});
