import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader, type SessionPort } from '@devhub/contracts';
import {
  ApiRequestError,
  createApiClient,
  sessionPortsQueryKey,
  sessionPortsQueryOptions,
  sessionQueryKey,
} from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const id = '0123456789abcdef';
const url = (route: string, port = 3005) => `${baseURL}${route.replace(':id', id).replace(':port', String(port))}`;
const server = setupServer();
const api = createApiClient({ baseURL, token: 'page-token' });

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const port: SessionPort = {
  port: 3005,
  pid: 59220,
  program: 'node',
  command: 'node ./node_modules/next/dist/bin/next dev --port 3005',
  name: null,
  url: 'https://localhost:3005',
  startedBy: 'claude',
  since: '2026-10-20T10:17:00.000Z',
  restartable: true,
};

describe('a session’s ports (spec 042)', () => {
  it('AC-2: reads what listens from the session, with the token', async () => {
    let token: string | null = null;
    server.use(
      http.get(url(apiRoutes.sessionPorts), ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json({ ports: [port] });
      }),
    );
    expect(await api.sessionPorts(id)).toEqual([port]);
    expect(token).toBe('page-token');
  });

  it('AC-9: lsof that can’t run is its own error', async () => {
    server.use(
      http.get(url(apiRoutes.sessionPorts), () =>
        HttpResponse.json({ code: 'ports_unreadable', message: "Couldn't read the ports." }, { status: 503 }),
      ),
    );
    await expect(api.sessionPorts(id)).rejects.toMatchObject({ code: 'ports_unreadable' });
    await expect(api.sessionPorts(id)).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-4, AC-5: stops and restarts a port, and says what happened', async () => {
    const asked: string[] = [];
    server.use(
      http.post(url(apiRoutes.sessionPortStop), () => {
        asked.push('stop');
        return HttpResponse.json({ result: 'done' });
      }),
      http.post(url(apiRoutes.sessionPortRestart), () => {
        asked.push('restart');
        return HttpResponse.json({ result: 'cannot_restart' });
      }),
    );
    expect(await api.stopPort(id, 3005)).toEqual({ result: 'done' });
    expect(await api.restartPort(id, 3005)).toEqual({ result: 'cannot_restart' });
    expect(asked).toEqual(['stop', 'restart']);
  });

  it('polls every 3 seconds while the tab is open and every 15 otherwise, outside the session’s own key', () => {
    expect(sessionPortsQueryOptions(api, id, { open: true }).refetchInterval).toBe(3_000);
    expect(sessionPortsQueryOptions(api, id, { open: false }).refetchInterval).toBe(15_000);
    expect(sessionPortsQueryKey(id).slice(0, sessionQueryKey(id).length)).not.toEqual(sessionQueryKey(id));
  });
});
