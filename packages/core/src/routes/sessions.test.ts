import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, ApiErrorSchema, SessionListSchema, tokenHeader, type SessionSummary } from '@devhub/contracts';
import { makeSessionSummary } from '@devhub/contracts/testing';
import { createServer } from '../create-server.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

let app: FastifyInstance | undefined;

async function server(sessions: readonly SessionSummary[] = []): Promise<FastifyInstance> {
  app = await createServer({ token, port, version: '1.2.3', sessions: createMemorySessionStore(sessions) });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Seven sessions stored out of order: session-1 is the oldest, session-7 the newest. */
const seven = [3, 1, 7, 5, 2, 6, 4].map((n) =>
  makeSessionSummary({
    id: `session-${String(n)}`,
    title: `Session ${String(n)}`,
    updatedAt: new Date(Date.UTC(2026, 9, 16, 10, n)).toISOString(),
  }),
);

describe('GET /api/sessions', () => {
  it('AC-15: answers 401 without the session token', async () => {
    const res = await (
      await server(seven)
    ).inject({ method: 'GET', url: apiRoutes.sessions, headers: { host: headers.host } });

    expect(res.statusCode).toBe(401);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('unauthorized');
  });

  it('AC-15: returns every session, newest activity first', async () => {
    const res = await (await server(seven)).inject({ method: 'GET', url: apiRoutes.sessions, headers });

    expect(res.statusCode).toBe(200);
    const { sessions } = SessionListSchema.parse(res.json());
    expect(sessions.map((s) => s.id)).toEqual([7, 6, 5, 4, 3, 2, 1].map((n) => `session-${String(n)}`));
  });

  it('AC-8: returns at most `limit` sessions, the newest ones', async () => {
    const res = await (await server(seven)).inject({ method: 'GET', url: `${apiRoutes.sessions}?limit=5`, headers });

    const { sessions } = SessionListSchema.parse(res.json());
    expect(sessions.map((s) => s.title)).toEqual(['Session 7', 'Session 6', 'Session 5', 'Session 4', 'Session 3']);
  });

  it('AC-10: returns an empty list before any session exists', async () => {
    const res = await (await server()).inject({ method: 'GET', url: apiRoutes.sessions, headers });

    expect(res.statusCode).toBe(200);
    expect(SessionListSchema.parse(res.json())).toEqual({ sessions: [] });
  });

  it('answers 400 with a reason for a limit that is not a positive number', async () => {
    const res = await (await server(seven)).inject({ method: 'GET', url: `${apiRoutes.sessions}?limit=0`, headers });

    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('bad_request');
  });

  it('starts with no sessions when the host gives no store', async () => {
    app = await createServer({ token, port, version: '1.2.3' });
    const res = await app.inject({ method: 'GET', url: apiRoutes.sessions, headers });

    expect(SessionListSchema.parse(res.json())).toEqual({ sessions: [] });
  });
});
