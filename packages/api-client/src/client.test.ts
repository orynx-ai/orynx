import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, queryKeys, statusQueryOptions } from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const url = (path: string) => `${baseURL}${path}`;
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

describe('createApiClient().status()', () => {
  it('sends the session token and returns the parsed status', async () => {
    let sentToken: string | null = null;
    server.use(
      http.get(url(apiRoutes.status), ({ request }) => {
        sentToken = request.headers.get(tokenHeader);
        return HttpResponse.json(makeStatus({ version: '9.9.9' }));
      }),
    );

    const status = await createApiClient({ baseURL, token: 'abc' }).status();

    expect(sentToken).toBe('abc');
    expect(status.version).toBe('9.9.9');
  });

  it('calls onUnauthorized and rejects with the server message on 401', async () => {
    server.use(
      http.get(url(apiRoutes.status), () =>
        HttpResponse.json({ code: 'unauthorized', message: 'Reload the page.' }, { status: 401 }),
      ),
    );
    const onUnauthorized = vi.fn();

    const result = createApiClient({ baseURL, token: 'old', onUnauthorized }).status();

    await expect(result).rejects.toMatchObject({ code: 'unauthorized', status: 401, message: 'Reload the page.' });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('rejects with code "network" when the server cannot be reached', async () => {
    server.use(http.get(url(apiRoutes.status), () => HttpResponse.error()));

    const error = await createApiClient({ baseURL, token: 't' })
      .status()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: 'network', status: null });
  });

  it('rejects a body that breaks the contract instead of passing it on', async () => {
    server.use(http.get(url(apiRoutes.status), () => HttpResponse.json({ version: 1 })));

    await expect(createApiClient({ baseURL, token: 't' }).status()).rejects.toMatchObject({
      code: 'internal',
      message: 'The Orynx server sent data this page does not understand. Reload the page.',
    });
  });

  it('keeps the status code when the server sends a non-contract error body', async () => {
    server.use(http.get(url(apiRoutes.status), () => new HttpResponse('Bad gateway', { status: 502 })));

    await expect(createApiClient({ baseURL, token: 't' }).status()).rejects.toMatchObject({
      code: 'internal',
      status: 502,
      message: 'The Orynx server answered 502.',
    });
  });
});

describe('statusQueryOptions', () => {
  it('uses the shared status key and fetches through the client', () => {
    server.use(http.get(url(apiRoutes.status), () => HttpResponse.json(makeStatus())));
    const options = statusQueryOptions(createApiClient({ baseURL, token: 't' }));

    expect(options.queryKey).toEqual(queryKeys.status);
    expect(typeof options.queryFn).toBe('function');
  });
});
