import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeSessionList } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, queryKeys, sessionsQueryOptions } from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const sessionsUrl = `${baseURL}${apiRoutes.sessions}`;
const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('createApiClient().sessions()', () => {
  it('AC-15: sends the token and the limit, and returns the parsed list', async () => {
    let sent: { token: string | null; limit: string | null } | null = null;
    server.use(
      http.get(sessionsUrl, ({ request }) => {
        sent = { token: request.headers.get(tokenHeader), limit: new URL(request.url).searchParams.get('limit') };
        return HttpResponse.json(makeSessionList([{ title: 'Add bulk archive' }, { title: 'Read receipts' }]));
      }),
    );

    const list = await createApiClient({ baseURL, token: 'abc' }).sessions({ limit: 5 });

    expect(sent).toEqual({ token: 'abc', limit: '5' });
    expect(list.sessions.map((session) => session.title)).toEqual(['Add bulk archive', 'Read receipts']);
  });

  it('asks for every session when no limit is given (the View all list)', async () => {
    let limit: string | null = 'unset';
    server.use(
      http.get(sessionsUrl, ({ request }) => {
        limit = new URL(request.url).searchParams.get('limit');
        return HttpResponse.json({ sessions: [] });
      }),
    );

    await createApiClient({ baseURL, token: 't' }).sessions();

    expect(limit).toBeNull();
  });

  it('rejects a body that breaks the contract', async () => {
    server.use(http.get(sessionsUrl, () => HttpResponse.json({ sessions: [{ id: 'x', state: 'thinking' }] })));

    const error = await createApiClient({ baseURL, token: 't' })
      .sessions()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: 'internal' });
  });
});

describe('sessionsQueryOptions', () => {
  it('AC-13: keys every list under "sessions" so one event refreshes them all', () => {
    const api = createApiClient({ baseURL, token: 't' });

    expect(sessionsQueryOptions(api, { limit: 5 }).queryKey).toEqual([...queryKeys.sessions, { limit: 5 }]);
    expect(sessionsQueryOptions(api).queryKey).toEqual([...queryKeys.sessions, {}]);
  });
});
