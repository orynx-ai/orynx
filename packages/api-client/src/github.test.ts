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

describe('GitHub Test connection (spec 030)', () => {
  const checkUrl = `${baseURL}${apiRoutes.githubConnectionCheck}`;

  it('AC-8: posts with the page token and returns the fresh status and how long it took', async () => {
    let token: string | null = null;
    const answer = {
      status: { state: 'connected', detail: 'Connected', account: 'octocat', checkedAt: '2026-10-20T08:00:00.000Z' },
      ms: 180,
    };
    server.use(
      http.post(checkUrl, ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(answer);
      }),
    );

    expect(await api.checkGitHubConnection()).toEqual(answer);
    expect(token).toBe('abc');
  });

  it('rejects with the code the server sends, and a body that breaks the contract', async () => {
    server.use(
      http.post(checkUrl, () =>
        HttpResponse.json({ code: 'bad_request', message: 'Connect GitHub in Connections first.' }, { status: 400 }),
      ),
    );
    await expect(api.checkGitHubConnection()).rejects.toMatchObject({ code: 'bad_request' });

    server.use(http.post(checkUrl, () => HttpResponse.json({ status: { state: 'maybe' }, ms: 1 })));
    await expect(api.checkGitHubConnection()).rejects.toBeInstanceOf(ApiRequestError);
  });
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

  it("says the Orynx server can't be reached when a disconnect gets no answer", async () => {
    server.use(http.delete(connectionUrl, () => HttpResponse.error()));

    expect(await api.disconnectGitHub().catch((e: unknown) => e)).toMatchObject({ code: 'network' });
  });

  it("AC-8: waits longer than the server's slowest answer, so the page shows the server's message, not its own", () => {
    // The gh way can take gh's 5 s and then GitHub's 10 s, plus starting both.
    expect(api.http.defaults.timeout).toBeGreaterThanOrEqual(20_000);
  });

  it('keeps the connection under its own key, fresh from status.changed rather than polling', () => {
    const options = githubConnectionQueryOptions(api);
    expect(options.queryKey).toEqual(queryKeys.githubConnection);
    expect(options.staleTime).toBe(Infinity);
  });
});
