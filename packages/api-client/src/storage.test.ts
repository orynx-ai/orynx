import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { ApiRequestError, createApiClient, queryKeys, storageQueryOptions } from './index.ts';

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

const storage = {
  bytes: 9_000_000_000,
  choices: [
    { days: 7, sessions: 5, bytes: 6_000_000_000 },
    { days: 14, sessions: 4, bytes: 5_000_000_000 },
    { days: 30, sessions: 3, bytes: 4_100_000_000 },
    { days: 90, sessions: 0, bytes: 0 },
  ],
};

describe('storage endpoint (spec 047, D)', () => {
  it("AC-16, AC-17: reads the worktrees' size and what each choice would delete now", async () => {
    server.use(http.get(url(apiRoutes.storage), () => HttpResponse.json(storage)));
    expect(await api.storage()).toEqual(storage);
  });

  it('refuses an answer that is not the contract', async () => {
    server.use(http.get(url(apiRoutes.storage), () => HttpResponse.json({ bytes: -1, choices: [] })));
    await expect(api.storage()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('keeps its answer under the sessions’ key, so the sessions.changed a delete sends reads it again', () => {
    const { queryKey } = storageQueryOptions(api);
    expect(queryKey.slice(0, queryKeys.sessions.length)).toEqual([...queryKeys.sessions]);
  });
});
