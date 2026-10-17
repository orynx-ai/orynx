import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeGitHubConnection } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, githubConnectionQueryOptions, queryKeys } from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const connectionUrl = `${baseURL}${apiRoutes.githubConnection}`;
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

describe('GitHub connection endpoints', () => {
  it('AC-2, AC-12: reads the saved way and whether gh is there, with the page token', async () => {
    let token: string | null = null;
    server.use(
      http.get(connectionUrl, ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(makeGitHubConnection({ saved: { method: 'token' }, ghFound: true }));
      }),
    );

    expect(await api.githubConnection()).toEqual({ saved: { method: 'token' }, envToken: false, ghFound: true });
    expect(token).toBe('abc');
  });

  it('AC-3: sends the way the form picked and returns the saved connection', async () => {
    let body: unknown;
    server.use(
      http.put(connectionUrl, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeGitHubConnection({ saved: { method: 'gh' } }));
      }),
    );

    expect(await api.connectGitHub({ method: 'gh' })).toEqual({
      saved: { method: 'gh' },
      envToken: false,
      ghFound: false,
    });
    expect(body).toEqual({ method: 'gh' });
  });

  it('AC-6: rejects with the code and message the server sends', async () => {
    const message = "GitHub didn't accept this token. Check it, or create a new one.";
    server.use(
      http.put(connectionUrl, () => HttpResponse.json({ code: 'integration_rejected', message }, { status: 422 })),
    );

    const error = await api.connectGitHub({ method: 'token', token: 'wrong' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: 'integration_rejected', status: 422, message });
  });

  it('AC-13: disconnects with DELETE', async () => {
    let deleted = false;
    server.use(
      http.delete(connectionUrl, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.disconnectGitHub();

    expect(deleted).toBe(true);
  });

  it('rejects a body that breaks the contract, from a read or a save', async () => {
    const broken = () => HttpResponse.json({ saved: { method: 'oauth' }, envToken: false, ghFound: false });
    server.use(http.get(connectionUrl, broken), http.put(connectionUrl, broken));

    expect(await api.githubConnection().catch((e: unknown) => e)).toMatchObject({ code: 'internal' });
    expect(await api.connectGitHub({ method: 'gh' }).catch((e: unknown) => e)).toMatchObject({ code: 'internal' });
  });

  it("says the DevHub server can't be reached when a disconnect gets no answer", async () => {
    server.use(http.delete(connectionUrl, () => HttpResponse.error()));

    expect(await api.disconnectGitHub().catch((e: unknown) => e)).toMatchObject({ code: 'network' });
  });

  it('keeps the connection under its own key, fresh from status.changed rather than polling', () => {
    const options = githubConnectionQueryOptions(api);
    expect(options.queryKey).toEqual(queryKeys.githubConnection);
    expect(options.staleTime).toBe(Infinity);
  });
});
