import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  SessionListSchema,
  SessionSchema,
  StartSessionAnswerSchema,
  tokenHeader,
  type Session,
  type SessionSummary,
} from '@devhub/contracts';
import { makeSession, makeSessionSummary } from '@devhub/contracts/testing';
import { createServer } from '../create-server.ts';
import { createMemorySessionStore, type SessionRecords } from '../sessions/session-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

let app: FastifyInstance | undefined;

async function server(sessions: readonly SessionSummary[] = []): Promise<FastifyInstance> {
  app = await createServer({ token, port, version: '1.2.3', sessions: createMemorySessionStore(sessions) });
  return app;
}

/** A server whose store holds these whole sessions, as a session's own routes need them. */
async function serverWith(...sessions: Partial<Session>[]): Promise<{ app: FastifyInstance; store: SessionRecords }> {
  const store = createMemorySessionStore();
  for (const session of sessions) {
    await store.create({
      session: makeSession(session),
      repository: { id: '00000000000000aa', path: '/nowhere/web-app' },
      // No worktree was made, so Discard has nothing on disk to delete.
      worktree: null,
      startCommit: null,
      claudeSessionId: null,
      approvalLog: [],
    });
  }
  app = await createServer({ token, port, version: '1.2.3', sessions: store });
  return { app, store };
}

const one = (id: string) => apiRoutes.session.replace(':id', id);

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

describe('GET /api/sessions?recent=true', () => {
  it('AC-10: leaves out sessions discarded more than 7 days ago', async () => {
    const { app } = await serverWith(
      { id: '0000000000000001', title: 'Kept' },
      { id: '0000000000000002', title: 'Long gone', state: 'stopped', discardedAt: '2020-01-01T00:00:00.000Z' },
    );
    const res = await app.inject({ method: 'GET', url: `${apiRoutes.sessions}?recent=true`, headers });
    expect(SessionListSchema.parse(res.json()).sessions.map((session) => session.title)).toEqual(['Kept']);
  });
});

describe('GET /api/sessions/:id', () => {
  it('AC-1: answers the whole session', async () => {
    const { app } = await serverWith({ id: '0123456789abcdef', title: 'Add bulk archive', step: 'build' });
    const res = await app.inject({ method: 'GET', url: one('0123456789abcdef'), headers });
    expect(res.statusCode).toBe(200);
    expect(SessionSchema.parse(res.json())).toMatchObject({
      id: '0123456789abcdef',
      title: 'Add bulk archive',
      step: 'build',
    });
  });

  it('AC-17: answers 404 for a session it doesn’t have', async () => {
    const { app } = await serverWith();
    const res = await app.inject({ method: 'GET', url: one('fedcba9876543210'), headers });
    expect(res.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('not_found');
  });

  it('answers 401 without the session token', async () => {
    const { app } = await serverWith();
    const res = await app.inject({ method: 'GET', url: one('0123456789abcdef'), headers: { host: headers.host } });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/sessions', () => {
  it('AC-22: with no Claude Code, says Claude isn’t signed in and starts nothing', async () => {
    const { app, store } = await serverWith();
    const res = await app.inject({
      method: 'POST',
      url: apiRoutes.sessions,
      headers,
      payload: { ticketKey: 'PROJ-1423' },
    });
    expect(res.statusCode).toBe(200);
    expect(StartSessionAnswerSchema.parse(res.json())).toEqual({ result: 'cannot_start', reason: 'signed_out' });
    expect(await store.list()).toEqual([]);
  });

  it('AC-1: answers the ticket’s live session', async () => {
    const { app } = await serverWith({ id: '0123456789abcdef', state: 'working' });
    const res = await app.inject({
      method: 'POST',
      url: apiRoutes.sessions,
      headers,
      payload: { ticketKey: 'PROJ-1423' },
    });
    expect(res.json()).toEqual({ result: 'existing', sessionId: '0123456789abcdef' });
  });

  it('answers 400 for something that isn’t a ticket key', async () => {
    const { app } = await serverWith();
    const res = await app.inject({
      method: 'POST',
      url: apiRoutes.sessions,
      headers,
      payload: { ticketKey: '../etc' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/sessions/:id/stop and /discard', () => {
  it('AC-9, AC-10: answer 204 for a session it has', async () => {
    const { app, store } = await serverWith({ id: '0123456789abcdef', state: 'stopped' });
    const stop = await app.inject({
      method: 'POST',
      url: apiRoutes.sessionStop.replace(':id', '0123456789abcdef'),
      headers,
    });
    expect(stop.statusCode).toBe(204);
    const discard = await app.inject({
      method: 'POST',
      url: apiRoutes.sessionDiscard.replace(':id', '0123456789abcdef'),
      headers,
    });
    expect(discard.statusCode).toBe(204);
    expect((await store.get('0123456789abcdef'))?.session.discardedAt).not.toBeNull();
  });

  it('answer 404 for a session it doesn’t have', async () => {
    const { app } = await serverWith();
    for (const url of [apiRoutes.sessionStop, apiRoutes.sessionDiscard]) {
      const res = await app.inject({ method: 'POST', url: url.replace(':id', 'fedcba9876543210'), headers });
      expect(res.statusCode).toBe(404);
    }
  });
});
