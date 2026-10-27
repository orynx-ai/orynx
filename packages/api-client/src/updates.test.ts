import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeRelease, makeUpdates } from '@devhub/contracts/testing';
import { createApiClient, queryKeys, updatesQueryOptions } from './index.ts';

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

describe('update endpoints (spec 045)', () => {
  it('AC-6: reads Settings › About with the page token, checked against the contract', async () => {
    let token: string | null = null;
    const updates = makeUpdates({ releases: [makeRelease()] });
    server.use(
      http.get(`${baseURL}${apiRoutes.updates}`, ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(updates);
      }),
    );
    expect(await api.updates()).toEqual(updates);
    expect(token).toBe('abc');
    expect(updatesQueryOptions(api).queryKey).toEqual(queryKeys.updates);
  });

  it('refuses an answer that breaks the contract', async () => {
    server.use(http.get(`${baseURL}${apiRoutes.updates}`, () => HttpResponse.json({ kind: 'laptop' })));
    await expect(api.updates()).rejects.toThrow();
  });

  it('AC-8: Check for updates answers with what the hub found', async () => {
    const checked = makeUpdates({ checkedAt: '2026-10-22T11:00:00.000Z' });
    server.use(http.post(`${baseURL}${apiRoutes.updatesCheck}`, () => HttpResponse.json(checked)));
    expect(await api.checkForUpdates()).toEqual(checked);
  });

  it('AC-19, AC-25, AC-29: sends Update or Restart to update, and passes on a refusal', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${baseURL}${apiRoutes.updatesInstall}`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(makeUpdates({ update: { state: 'updating' } }));
      }),
    );
    expect((await api.installUpdate({ step: 'update' })).update).toEqual({ state: 'updating' });
    await api.installUpdate({ step: 'restart' });
    expect(bodies).toEqual([{ step: 'update' }, { step: 'restart' }]);

    server.use(
      http.post(`${baseURL}${apiRoutes.updatesInstall}`, () =>
        HttpResponse.json({ code: 'session_working', message: 'Stop the running sessions first.' }, { status: 409 }),
      ),
    );
    await expect(api.installUpdate({ step: 'update' })).rejects.toMatchObject({ code: 'session_working' });
  });
});
