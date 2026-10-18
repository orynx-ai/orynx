import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeSearchIndex, makeSearchPullRequest, makeSearchTicket } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, queryKeys, searchQueryOptions } from './index.ts';

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

describe('search endpoint', () => {
  it('AC-6, AC-8: reads everything search can find, with the page token', async () => {
    const index = makeSearchIndex({ tickets: [makeSearchTicket()], pullRequests: [makeSearchPullRequest()] });
    let token: string | null = null;
    server.use(
      http.get(url(apiRoutes.search), ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(index);
      }),
    );

    expect(await api.search()).toEqual(index);
    expect(token).toBe('abc');
  });

  it('refuses an answer that is not the contract, such as a link to anywhere but Jira', async () => {
    server.use(
      http.get(url(apiRoutes.search), () =>
        HttpResponse.json(
          makeSearchIndex({
            tickets: [{ ...makeSearchTicket(), target: { kind: 'external', url: 'https://evil.example/PROJ-1' } }],
          }),
        ),
      ),
    );

    await expect(api.search()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-25: a server that stops answering is an ApiRequestError', async () => {
    server.use(http.get(url(apiRoutes.search), () => HttpResponse.error()));

    await expect(api.search()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-26: keeps the index until the event stream says something changed', () => {
    const options = searchQueryOptions(api);

    expect(options.queryKey).toEqual(queryKeys.search);
    expect(options.staleTime).toBe(Infinity);
  });
});
