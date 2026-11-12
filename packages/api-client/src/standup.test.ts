import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeStandup } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, queryKeys, standupQueryOptions } from './index.ts';

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

describe('the standup (spec 057, C)', () => {
  it('AC-27: reads the draft with the page token, checked against the contract', async () => {
    let token: string | null = null;
    server.use(
      http.get(`${baseURL}${apiRoutes.standup}`, ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(makeStandup());
      }),
    );
    expect(await api.standup()).toEqual(makeStandup());
    expect(token).toBe('abc');
    expect(standupQueryOptions(api).queryKey).toEqual(queryKeys.standup);
  });

  it('refuses a draft that breaks the contract', async () => {
    server.use(http.get(`${baseURL}${apiRoutes.standup}`, () => HttpResponse.json({ text: '' })));
    await expect(api.standup()).rejects.toBeInstanceOf(ApiRequestError);
  });
});
