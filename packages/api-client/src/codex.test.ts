import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import {
  agentModelsQueryOptions,
  ApiRequestError,
  codexLoginQueryOptions,
  createApiClient,
  queryKeys,
} from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const loginUrl = `${baseURL}${apiRoutes.codexLogin}`;
const checkUrl = `${baseURL}${apiRoutes.codexLoginCheck}`;
const modelsUrl = `${baseURL}${apiRoutes.agentModels}`;
const server = setupServer();
const api = createApiClient({ baseURL, token: 'abc' });
const signedIn = { state: 'signed_in', method: 'chatgpt', email: 'you@company.com' };

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('Codex login endpoints (spec 052)', () => {
  it('AC-1: reads the login with the page token, and Check again posts', async () => {
    let token: string | null = null;
    server.use(
      http.get(loginUrl, ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(signedIn);
      }),
      http.post(checkUrl, () => HttpResponse.json({ state: 'not_installed' })),
    );

    expect(await api.codexLogin()).toEqual(signedIn);
    expect(token).toBe('abc');
    expect(await api.checkCodexLogin()).toEqual({ state: 'not_installed' });
  });

  it('AC-2: rejects an answer that is not a login, and an unreachable server is an ApiRequestError', async () => {
    server.use(http.get(loginUrl, () => HttpResponse.json({ state: 'signed_in', email: 'you@company.com' })));
    await expect(api.codexLogin()).rejects.toThrow();

    server.use(http.post(checkUrl, () => HttpResponse.error()));
    await expect(api.checkCodexLogin()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-1: keeps the login under its own key, kept fresh by status.changed rather than polling', () => {
    const options = codexLoginQueryOptions(api);
    expect(options.queryKey).toEqual(queryKeys.codexLogin);
    expect(options.staleTime).toBe(Infinity);
  });
});

describe('models by agent (spec 052)', () => {
  it("AC-4: asks for one agent's models, Claude's when none is named", async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(modelsUrl, ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('agent'));
        return HttpResponse.json({ state: 'unavailable' });
      }),
    );

    await api.agentModels('codex');
    await api.agentModels();
    expect(asked).toEqual(['codex', 'claude']);
  });

  it("AC-4: keeps each agent's list under its own key, beneath the one status.changed refreshes", () => {
    expect(agentModelsQueryOptions(api, 'codex').queryKey).toEqual([...queryKeys.agentModels, 'codex']);
    expect(agentModelsQueryOptions(api).queryKey).toEqual([...queryKeys.agentModels, 'claude']);
  });
});
