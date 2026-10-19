import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  FileDiffSchema,
  SendMessageAnswerSchema,
  SessionBriefSchema,
  SessionChangesSchema,
  SessionListSchema,
  SessionSchema,
  StartSessionAnswerSchema,
  tokenHeader,
  type Session,
  type SessionSummary,
} from '@devhub/contracts';
import { makeSession, makeSessionSummary } from '@devhub/contracts/testing';
import { gitEnvironment } from '../agents/agent-environment.ts';
import { createServer } from '../create-server.ts';
import { createWorktrees } from '../sessions/worktrees.ts';
import { useTestRepositories } from '../test/git-repository.ts';
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
      pushedCommit: null,
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
    expect(SessionListSchema.parse(res.json())).toEqual({ sessions: [], nextCursor: null });
  });

  it('answers 400 with a reason for a limit that is not a positive number', async () => {
    const res = await (await server(seven)).inject({ method: 'GET', url: `${apiRoutes.sessions}?limit=0`, headers });

    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('bad_request');
  });

  it('starts with no sessions when the host gives no store', async () => {
    app = await createServer({ token, port, version: '1.2.3' });
    const res = await app.inject({ method: 'GET', url: apiRoutes.sessions, headers });

    expect(SessionListSchema.parse(res.json())).toEqual({ sessions: [], nextCursor: null });
  });
});

/** Forty sessions, `0000000000000001` the oldest and `0000000000000040` the newest, a minute apart. */
const forty = Array.from({ length: 40 }, (_, index) => ({
  id: String(index + 1).padStart(16, '0'),
  title: `Session ${String(index + 1)}`,
  updatedAt: new Date(Date.UTC(2026, 9, 16, 10, index)).toISOString(),
}));

/** One page of recent sessions, 16 at most, from where `cursor` says. */
async function page(server: FastifyInstance, cursor: string | null) {
  const query = `?recent=true&limit=16${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
  const res = await server.inject({ method: 'GET', url: `${apiRoutes.sessions}${query}`, headers });
  expect(res.statusCode).toBe(200);
  return SessionListSchema.parse(res.json());
}

describe('GET /api/sessions in pages (spec 020)', () => {
  it('AC-6: pages of at most 16 hold every recent session once, newest first, and the last page says so', async () => {
    const { app } = await serverWith(...forty);

    const first = await page(app, null);
    const second = await page(app, first.nextCursor);
    const third = await page(app, second.nextCursor);

    expect([first, second, third].map((answer) => answer.sessions.length)).toEqual([16, 16, 8]);
    expect(third.nextCursor).toBeNull();
    expect([...first.sessions, ...second.sessions, ...third.sessions].map((session) => session.title)).toEqual(
      forty.map((session) => session.title).reverse(),
    );
  });

  it('AC-3: a session that moves to the top between two pages is never listed twice, and none is skipped', async () => {
    const { app, store } = await serverWith(...forty);
    const first = await page(app, null);
    // Session 20, due on the second page, gets new activity.
    await store.update('0000000000000020', (record) => ({
      ...record,
      session: { ...record.session, updatedAt: '2026-10-16T12:00:00.000Z' },
    }));

    const second = await page(app, first.nextCursor);
    const third = await page(app, second.nextCursor);

    const titles = [...second.sessions, ...third.sessions].map((session) => session.title);
    expect(titles).not.toContain('Session 20');
    expect(titles).toHaveLength(23);
    expect(new Set([...first.sessions.map((session) => session.title), ...titles]).size).toBe(39);
  });

  it('AC-6: answers a whole list with no cursor when no limit is asked', async () => {
    const res = await (await server(seven)).inject({ method: 'GET', url: apiRoutes.sessions, headers });
    expect(SessionListSchema.parse(res.json()).nextCursor).toBeNull();
  });

  it('AC-6: answers 400 for a cursor it can’t read', async () => {
    const res = await (
      await server(seven)
    ).inject({
      method: 'GET',
      url: `${apiRoutes.sessions}?limit=16&cursor=yesterday`,
      headers,
    });

    expect(res.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(res.json()).code).toBe('bad_request');
  });

  it('AC-6: a cursor past the oldest session answers an empty last page', async () => {
    const { app } = await serverWith(...forty);
    expect(await page(app, '1000.0000000000000000')).toEqual({ sessions: [], nextCursor: null });
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

describe('GET /api/sessions/:id/brief', () => {
  const brief = (id: string) => apiRoutes.sessionBrief.replace(':id', id);

  it('answers exactly what Claude was sent, null before anything was, and 404 for no such session', async () => {
    const { app, store } = await serverWith({ id: '0123456789abcdef' }, { id: '00000000000000cc' });
    await store.writeBrief('0123456789abcdef', 'Only the tests\n\nJira ticket PROJ-1423 (Story): Add bulk archive');

    const sent = await app.inject({ method: 'GET', url: brief('0123456789abcdef'), headers });
    expect(sent.statusCode).toBe(200);
    expect(SessionBriefSchema.parse(sent.json())).toEqual({
      text: 'Only the tests\n\nJira ticket PROJ-1423 (Story): Add bulk archive',
    });
    expect((await app.inject({ method: 'GET', url: brief('00000000000000cc'), headers })).json()).toEqual({
      text: null,
    });
    const missing = await app.inject({ method: 'GET', url: brief('fedcba9876543210'), headers });
    expect(missing.statusCode).toBe(404);
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

describe('POST /api/sessions from the composer (spec 015)', () => {
  const post = (app: FastifyInstance, payload: unknown) =>
    app.inject({
      method: 'POST',
      url: apiRoutes.sessions,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: JSON.stringify(payload),
    });

  it('AC-4, 022 AC-3: takes the most the composer can send, even text JSON writes six times over', async () => {
    const { app, store } = await serverWith();
    // 100 tickets, 100 pull requests and 100 files at the longest path (spec 022, Q5), and a message whose every
    // character is one JSON writes six times over: the worst case the limits allow.
    const upTo = (count: number) => Array.from({ length: count }, (_, n) => n + 1);
    const payload = {
      message: '\u001b'.repeat(10_000),
      context: [
        ...upTo(100).map((n) => ({ kind: 'jira', key: `PROJ-${String(n)}` })),
        ...upTo(100).map((number) => ({ kind: 'pull_request', owner: 'acme', name: 'web-app', number })),
        ...upTo(100).map((n) => ({ kind: 'file', path: `/${String(n).padStart(4095, 'a')}` })),
      ],
    };
    expect(JSON.stringify(payload).length).toBeGreaterThan(470_000);

    const res = await post(app, payload);

    expect(res.statusCode).toBe(200);
    expect(StartSessionAnswerSchema.parse(res.json())).toEqual({ result: 'cannot_start', reason: 'signed_out' });
    expect(await store.list()).toEqual([]);
  });

  it('AC-23: answers the ticket’s live session when the composer adds that ticket', async () => {
    const { app } = await serverWith({ id: '0123456789abcdef', state: 'done' });
    const res = await post(app, { message: 'Only the tests', context: [{ kind: 'jira', key: 'PROJ-1423' }] });
    expect(res.json()).toEqual({ result: 'existing', sessionId: '0123456789abcdef' });
  });

  it('answers 400 for a body the composer could never send, and 413 past what it ever could', async () => {
    const { app } = await serverWith();
    const files = Array.from({ length: 101 }, (_, n) => ({ kind: 'file', path: `~/${String(n)}.md` }));
    for (const payload of [
      { message: '  ', context: [] },
      { message: 'Go', context: files },
      { message: 'Go', context: [{ kind: 'slack_thread', ts: '1' }] },
      { message: 'Go', context: [{ kind: 'file', path: '~/.ssh/id_rsa' }] },
      { message: 'Go', context: [{ kind: 'file', name: 'notes.md', text: 'The shape before spec 022' }] },
    ]) {
      expect((await post(app, payload)).statusCode).toBe(400);
    }
    expect((await post(app, { message: 'x'.repeat(5 * 1024 * 1024), context: [] })).statusCode).toBe(413);
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

const repositories = useTestRepositories();
const changesOf = (id: string) => apiRoutes.sessionChanges.replace(':id', id);
const diffOf = (id: string, path: string) =>
  `${apiRoutes.sessionChangesDiff.replace(':id', id)}?path=${encodeURIComponent(path)}`;

describe('GET /api/sessions/:id/changes and its diff (spec 013)', () => {
  vi.setConfig({ testTimeout: 15_000 });

  it('AC-2, AC-3, AC-24: lists a worktree’s changes and one file’s diff, and no file outside them', async () => {
    const repos = await repositories();
    const worktree = join(repos.worktrees, '0123456789abcdef');
    const made = await createWorktrees({ env: gitEnvironment(repos.env), root: repos.worktrees }).make(
      repos.clone,
      worktree,
      {
        branch: 'feat/PROJ-1423',
        base: 'origin/main',
        remote: true,
      },
    );
    if (!made.ok) throw new Error('the worktree should be made');
    await writeFile(join(worktree, 'README.md'), '# web-app\n\nBulk archive.\n');
    const store = createMemorySessionStore();
    await store.create({
      session: makeSession({ id: '0123456789abcdef', state: 'done' }),
      repository: { id: '00000000000000aa', path: repos.clone },
      worktree,
      startCommit: made.startCommit,
      claudeSessionId: 'b2c7e0f4-0000-4000-8000-000000000001',
      pushedCommit: null,
      approvalLog: [],
    });
    app = await createServer({
      token,
      port,
      version: '1.2.3',
      sessions: store,
      gitEnvironment: gitEnvironment(repos.env),
    });

    const listed = await app.inject({ method: 'GET', url: changesOf('0123456789abcdef'), headers });
    expect(listed.statusCode).toBe(200);
    expect(SessionChangesSchema.parse(listed.json())).toEqual({
      state: 'ready',
      files: [{ path: 'README.md', added: 2, removed: 0, binary: false, renamedFrom: null }],
      moreFiles: 0,
      added: 2,
      removed: 0,
    });

    const diff = await app.inject({ method: 'GET', url: diffOf('0123456789abcdef', 'README.md'), headers });
    expect(diff.statusCode).toBe(200);
    expect(FileDiffSchema.parse(diff.json()).lines.filter((line) => line.kind === 'added')).toEqual([
      { kind: 'added', number: 2, text: '' },
      { kind: 'added', number: 3, text: 'Bulk archive.' },
    ]);

    for (const path of ['../../../.gitconfig', join(repos.root, '.gitconfig'), '.git/config']) {
      const refused = await app.inject({ method: 'GET', url: diffOf('0123456789abcdef', path), headers });
      expect(refused.statusCode).toBe(404);
      expect(JSON.stringify(refused.json())).not.toContain('defaultBranch');
    }
  });

  it('AC-6: says a session never got a worktree, or that its changes were discarded', async () => {
    const { app: hub } = await serverWith(
      { id: 'never-made', branch: null },
      { id: 'discarded', state: 'stopped', discardedAt: '2026-10-16T10:05:00.000Z' },
    );
    expect((await hub.inject({ method: 'GET', url: changesOf('never-made'), headers })).json()).toEqual({
      state: 'no_worktree',
    });
    expect((await hub.inject({ method: 'GET', url: changesOf('discarded'), headers })).json()).toEqual({
      state: 'discarded',
    });
  });

  it('AC-6: says the worktree is missing when it was deleted outside Orynx', async () => {
    const store = createMemorySessionStore();
    await store.create({
      session: makeSession({ id: 'gone' }),
      repository: { id: '00000000000000aa', path: '/nowhere/web-app' },
      worktree: '/nowhere/worktrees/gone',
      startCommit: 'a'.repeat(40),
      claudeSessionId: null,
      pushedCommit: null,
      approvalLog: [],
    });
    app = await createServer({ token, port, version: '1.2.3', sessions: store });
    expect((await app.inject({ method: 'GET', url: changesOf('gone'), headers })).json()).toEqual({ state: 'missing' });
  });

  it('AC-17, AC-24: answers 404 for a session it doesn’t have, and for a diff with no worktree behind it', async () => {
    const { app: hub } = await serverWith({ id: 'never-made', branch: null });
    expect((await hub.inject({ method: 'GET', url: changesOf('nobody'), headers })).statusCode).toBe(404);
    expect((await hub.inject({ method: 'GET', url: diffOf('nobody', 'a.ts'), headers })).statusCode).toBe(404);
    expect(
      (await hub.inject({ method: 'GET', url: diffOf('never-made', '../../runtime.json'), headers })).statusCode,
    ).toBe(404);
    const noPath = await hub.inject({
      method: 'GET',
      url: apiRoutes.sessionChangesDiff.replace(':id', 'never-made'),
      headers,
    });
    expect(noPath.statusCode).toBe(400);
  });
});

describe('POST /api/sessions/:id/messages (spec 013)', () => {
  const messagesOf = (id: string) => apiRoutes.sessionMessages.replace(':id', id);

  it('AC-14: says why a follow-up can’t go to a session Claude never started', async () => {
    const { app: hub } = await serverWith({ id: '0123456789abcdef', state: 'stopped' });
    const res = await hub.inject({
      method: 'POST',
      url: messagesOf('0123456789abcdef'),
      headers,
      payload: { text: 'More' },
    });
    expect(res.statusCode).toBe(200);
    expect(SendMessageAnswerSchema.parse(res.json())).toEqual({ result: 'cannot_send', reason: 'never_started' });
  });

  it('AC-15: refuses an empty follow-up and one longer than 10,000 characters, and answers 404 for no session', async () => {
    const { app: hub } = await serverWith({ id: '0123456789abcdef', state: 'stopped' });
    for (const text of ['   ', 'x'.repeat(10_001)]) {
      const res = await hub.inject({ method: 'POST', url: messagesOf('0123456789abcdef'), headers, payload: { text } });
      expect(res.statusCode).toBe(400);
    }
    const missing = await hub.inject({ method: 'POST', url: messagesOf('nobody'), headers, payload: { text: 'More' } });
    expect(missing.statusCode).toBe(404);
  });
});

describe('Create pull request and Push changes (spec 014)', () => {
  const draftOf = (id: string) => apiRoutes.sessionPullRequestDraft.replace(':id', id);
  const createOf = (id: string) => apiRoutes.sessionPullRequest.replace(':id', id);
  const pushDraftOf = (id: string) => apiRoutes.sessionPushDraft.replace(':id', id);
  const pushOf = (id: string) => apiRoutes.sessionPush.replace(':id', id);
  const asked = { title: 'PROJ-1423: Add bulk archive', body: 'What changed.' };

  it("AC-7, AC-17: say why there's no pull request to draft, create or push to, for a session with no worktree", async () => {
    const { app } = await serverWith({ id: 'never', state: 'stopped', branch: null });
    const answers = await Promise.all([
      app.inject({ method: 'POST', url: draftOf('never'), headers }),
      app.inject({ method: 'POST', url: createOf('never'), headers, payload: asked }),
      app.inject({ method: 'POST', url: pushDraftOf('never'), headers }),
      app.inject({ method: 'POST', url: pushOf('never'), headers, payload: { message: 'More' } }),
    ]);
    expect(answers.map((res) => res.statusCode)).toEqual([200, 200, 200, 200]);
    expect(answers.map((res) => res.json<unknown>())).toEqual([
      { result: 'cannot', reason: 'no_worktree' },
      { result: 'cannot', reason: 'no_worktree' },
      { result: 'cannot', reason: 'no_pull_request' },
      { result: 'cannot', reason: 'no_pull_request' },
    ]);
  });

  it('Q11d: refuses an empty title or commit message, and one too long, before anything happens', async () => {
    const { app } = await serverWith({ id: 'done', state: 'done' });
    const bad = await Promise.all([
      app.inject({ method: 'POST', url: createOf('done'), headers, payload: { title: '  ', body: '' } }),
      app.inject({ method: 'POST', url: createOf('done'), headers, payload: { title: 'x'.repeat(257), body: '' } }),
      app.inject({ method: 'POST', url: createOf('done'), headers, payload: { title: 'T', body: 'x'.repeat(65_537) } }),
      app.inject({ method: 'POST', url: pushOf('done'), headers, payload: { message: '' } }),
    ]);
    expect(bad.map((res) => res.statusCode)).toEqual([400, 400, 400, 400]);
  });

  it('answer 404 for a session it doesn’t have', async () => {
    const { app } = await serverWith();
    const answers = await Promise.all([
      app.inject({ method: 'POST', url: draftOf('nope'), headers }),
      app.inject({ method: 'POST', url: createOf('nope'), headers, payload: asked }),
      app.inject({ method: 'POST', url: pushDraftOf('nope'), headers }),
      app.inject({ method: 'POST', url: pushOf('nope'), headers, payload: { message: 'More' } }),
    ]);
    for (const res of answers) {
      expect(res.statusCode).toBe(404);
      expect(ApiErrorSchema.parse(res.json()).code).toBe('not_found');
    }
  });
});
