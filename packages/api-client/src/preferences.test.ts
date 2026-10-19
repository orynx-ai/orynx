import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makePreferences } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, preferencesQueryOptions, queryKeys } from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const preferencesUrl = `${baseURL}${apiRoutes.preferences}`;
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

describe('preferences endpoints', () => {
  it('AC-2: reads the preferences with the page token', async () => {
    let token: string | null = null;
    server.use(
      http.get(preferencesUrl, ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(makePreferences());
      }),
    );

    expect(await api.preferences()).toEqual(makePreferences());
    expect(token).toBe('abc');
  });

  it('AC-3, AC-13: sends one change and returns every preference', async () => {
    let body: unknown;
    server.use(
      http.patch(preferencesUrl, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makePreferences({ inboxRules: { checks_failing: false } }));
      }),
    );

    const answer = await api.changePreferences({ inboxRules: { checks_failing: false } });

    expect(body).toEqual({ inboxRules: { checks_failing: false } });
    expect(answer.inboxRules.checks_failing).toBe(false);
  });

  it('AC-14: rejects with the code the server sends when the save fails', async () => {
    server.use(
      http.patch(preferencesUrl, () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );

    const failure = api.changePreferences({ permissions: { edits: 'ask' } });

    await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
    await expect(failure).rejects.toMatchObject({ code: 'internal', status: 500 });
  });

  it('refuses an answer that is not the contract', async () => {
    server.use(http.get(preferencesUrl, () => HttpResponse.json({ permissionMode: 'yolo' })));

    await expect(api.preferences()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-17: keeps one cache entry that settings.changed refreshes, instead of polling', () => {
    const options = preferencesQueryOptions(api);
    expect(options.queryKey).toEqual(queryKeys.preferences);
    expect(options.staleTime).toBe(Infinity);
  });
});
