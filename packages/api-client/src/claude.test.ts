import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeClaudeSignedIn } from '@devhub/contracts/testing';
import {
  agentModelsQueryOptions,
  ApiRequestError,
  claudeLoginQueryOptions,
  createApiClient,
  queryKeys,
} from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const loginUrl = `${baseURL}${apiRoutes.claudeLogin}`;
const checkUrl = `${baseURL}${apiRoutes.claudeLoginCheck}`;
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

describe('Claude login endpoints', () => {
  it('AC-2: reads the login with the page token', async () => {
    let token: string | null = null;
    server.use(
      http.get(loginUrl, ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(makeClaudeSignedIn());
      }),
    );

    expect(await api.claudeLogin()).toEqual(makeClaudeSignedIn());
    expect(token).toBe('abc');
  });

  it('AC-5: Check again posts and returns the new login', async () => {
    let method: string | null = null;
    server.use(
      http.post(checkUrl, ({ request }) => {
        method = request.method;
        return HttpResponse.json({ state: 'signed_out' });
      }),
    );

    expect(await api.checkClaudeLogin()).toEqual({ state: 'signed_out' });
    expect(method).toBe('POST');
  });

  it('AC-6: rejects an answer that is not a login, rather than showing it', async () => {
    server.use(http.get(loginUrl, () => HttpResponse.json({ state: 'signed_in', email: 'you@company.com' })));

    await expect(api.claudeLogin()).rejects.toThrow();
  });

  it('turns an unreachable server into an ApiRequestError', async () => {
    server.use(http.post(checkUrl, () => HttpResponse.error()));

    await expect(api.checkClaudeLogin()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-5: keeps the login under its own key, kept fresh by status.changed rather than polling', () => {
    const options = claudeLoginQueryOptions(api);
    expect(options.queryKey).toEqual(queryKeys.claudeLogin);
    expect(options.staleTime).toBe(Infinity);
  });
});

describe('agent models endpoint', () => {
  const modelsUrl = `${baseURL}${apiRoutes.agentModels}`;

  it('reads the models Claude offers, each with its effort levels', async () => {
    const listed = {
      state: 'ready',
      models: [{ value: 'opus', displayName: 'Opus', description: 'Most capable', efforts: ['low', 'max'] }],
    };
    server.use(http.get(modelsUrl, () => HttpResponse.json(listed)));

    expect(await api.agentModels()).toEqual(listed);
  });

  it('rejects an answer that is not a list of models, as an ApiRequestError when the server is unreachable', async () => {
    server.use(http.get(modelsUrl, () => HttpResponse.json({ state: 'ready', models: [{ value: '--x' }] })));
    await expect(api.agentModels()).rejects.toThrow();

    server.use(http.get(modelsUrl, () => HttpResponse.error()));
    await expect(api.agentModels()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('keeps the list under its own key for 10 minutes', () => {
    const options = agentModelsQueryOptions(api);
    expect(options.queryKey).toEqual(queryKeys.agentModels);
    expect(options.staleTime).toBe(10 * 60_000);
  });
});
