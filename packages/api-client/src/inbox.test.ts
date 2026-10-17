import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeInbox, makeInboxItem } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, inboxQueryOptions, queryKeys } from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const url = (path: string) => `${baseURL}${path}`;
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

describe('inbox endpoints', () => {
  it('AC-1: reads the list with the page token', async () => {
    const inbox = makeInbox({ items: [makeInboxItem()] });
    let token: string | null = null;
    server.use(
      http.get(url(apiRoutes.inbox), ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(inbox);
      }),
    );

    expect(await api.inbox()).toEqual(inbox);
    expect(token).toBe('abc');
  });

  it('refuses an answer that is not the contract', async () => {
    server.use(http.get(url(apiRoutes.inbox), () => HttpResponse.json({ items: [{ title: 'No reason' }] })));

    await expect(api.inbox()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-17: Refresh asks the server to sync now, and resolves when the sync has ended', async () => {
    let asked = false;
    server.use(
      http.post(url(apiRoutes.inboxRefresh), () => {
        asked = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.refreshInbox();

    expect(asked).toBe(true);
  });

  it('AC-31: Clear cache asks the server to empty it', async () => {
    let asked = false;
    server.use(
      http.delete(url(apiRoutes.inboxCache), () => {
        asked = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.clearInboxCache();

    expect(asked).toBe(true);
  });

  it('AC-27: rejects with the code the server sends when the list can’t be read', async () => {
    server.use(
      http.get(url(apiRoutes.inbox), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );

    await expect(api.inbox()).rejects.toMatchObject({ code: 'internal', status: 500 });
  });

  it('AC-16: keeps one cache entry that inbox.changed refreshes, instead of polling', () => {
    const options = inboxQueryOptions(api);
    expect(options.queryKey).toEqual(queryKeys.inbox);
    expect(options.staleTime).toBe(Infinity);
  });
});
