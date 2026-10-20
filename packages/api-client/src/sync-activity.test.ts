import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeSyncActivity, makeSyncRun } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, queryKeys, syncActivityQueryOptions } from './index.ts';

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

describe('sync activity endpoints (spec 035)', () => {
  it('AC-18: reads one tool’s failed runs when asked, and every run of every tool by default', async () => {
    const activity = makeSyncActivity({ runs: [makeSyncRun({ problem: { kind: 'rejected' } })] });
    const asked: string[] = [];
    server.use(
      http.get(url(apiRoutes.syncActivity), ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json(activity);
      }),
    );

    expect(await api.syncActivity({ tool: 'jira', show: 'failed' })).toEqual(activity);
    await api.syncActivity({});

    expect(asked).toEqual(['?tool=jira&show=failed', '']);
  });

  it('refuses an answer that is not the contract', async () => {
    server.use(
      http.get(url(apiRoutes.syncActivity), () => HttpResponse.json({ tools: [{ tool: 'slack' }], runs: [] })),
    );

    await expect(api.syncActivity({})).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-25: keeps its answers under the inbox’s key, so the inbox.changed that ends each sync reads them again', () => {
    const { queryKey } = syncActivityQueryOptions(api, { tool: 'github', show: 'all' });

    expect(queryKey.slice(0, queryKeys.inbox.length)).toEqual([...queryKeys.inbox]);
    expect(queryKey).not.toEqual(syncActivityQueryOptions(api, { show: 'all' }).queryKey);
  });
});
