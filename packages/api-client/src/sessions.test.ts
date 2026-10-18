import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import {
  makeComposerStart,
  makeFileDiff,
  makeSession,
  makeSessionChanges,
  makeSessionList,
} from '@devhub/contracts/testing';
import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import {
  ApiRequestError,
  createApiClient,
  queryKeys,
  sessionChangesQueryOptions,
  sessionDiffQueryOptions,
  sessionPagesQueryOptions,
  sessionQueryKey,
  sessionQueryOptions,
  sessionsQueryOptions,
} from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const sessionsUrl = `${baseURL}${apiRoutes.sessions}`;
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

describe('createApiClient().sessions()', () => {
  it('AC-15: sends the token and the limit, and returns the parsed list', async () => {
    let sent: { token: string | null; limit: string | null } | null = null;
    server.use(
      http.get(sessionsUrl, ({ request }) => {
        sent = { token: request.headers.get(tokenHeader), limit: new URL(request.url).searchParams.get('limit') };
        return HttpResponse.json(makeSessionList([{ title: 'Add bulk archive' }, { title: 'Read receipts' }]));
      }),
    );

    const list = await createApiClient({ baseURL, token: 'abc' }).sessions({ limit: 5 });

    expect(sent).toEqual({ token: 'abc', limit: '5' });
    expect(list.sessions.map((session) => session.title)).toEqual(['Add bulk archive', 'Read receipts']);
  });

  it('asks for every session when no limit is given (the View all list)', async () => {
    let limit: string | null = 'unset';
    server.use(
      http.get(sessionsUrl, ({ request }) => {
        limit = new URL(request.url).searchParams.get('limit');
        return HttpResponse.json({ sessions: [] });
      }),
    );

    await createApiClient({ baseURL, token: 't' }).sessions();

    expect(limit).toBeNull();
  });

  it('rejects a body that breaks the contract', async () => {
    server.use(http.get(sessionsUrl, () => HttpResponse.json({ sessions: [{ id: 'x', state: 'thinking' }] })));

    const error = await createApiClient({ baseURL, token: 't' })
      .sessions()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: 'internal' });
  });
});

describe('sessionsQueryOptions', () => {
  it('AC-13: keys every list under "sessions" so one event refreshes them all', () => {
    const api = createApiClient({ baseURL, token: 't' });

    expect(sessionsQueryOptions(api, { limit: 5 }).queryKey).toEqual([...queryKeys.sessions, { limit: 5 }]);
    expect(sessionsQueryOptions(api).queryKey).toEqual([...queryKeys.sessions, {}]);
  });
});

describe('sessionPagesQueryOptions (spec 020)', () => {
  it('AC-6: asks for the first page, then the next from its cursor, until a page says it is the last', async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get(sessionsUrl, ({ request }) => {
        const params = new URL(request.url).searchParams;
        const cursor = params.get('cursor');
        asked.push(`${params.get('limit') ?? ''} ${params.get('recent') ?? ''} ${cursor ?? 'first'}`);
        return HttpResponse.json(
          cursor === null
            ? { ...makeSessionList([{ title: 'Newest' }]), nextCursor: '1760608800000.session-1' }
            : makeSessionList([{ title: 'Older' }]),
        );
      }),
    );
    const api = createApiClient({ baseURL, token: 't' });
    const client = new QueryClient();
    const options = sessionPagesQueryOptions(api, { limit: 16, recent: true });

    const observer = new InfiniteQueryObserver(client, options);

    await observer.refetch();
    const result = await observer.fetchNextPage();

    expect(options.queryKey).toEqual([...queryKeys.sessions, 'pages', { limit: 16, recent: true }]);
    expect(result.data?.pages.flatMap((page) => page.sessions.map((session) => session.title))).toEqual([
      'Newest',
      'Older',
    ]);
    expect(asked).toEqual(['16 true first', '16 true 1760608800000.session-1']);
    expect(result.hasNextPage).toBe(false);
  });
});

const oneUrl = (id: string) => `${baseURL}${apiRoutes.session.replace(':id', id)}`;

describe('createApiClient().session()', () => {
  it('AC-1: reads one session with the token, parsed by the contract', async () => {
    let token: string | null = null;
    server.use(
      http.get(oneUrl('0123456789abcdef'), ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(makeSession({ step: 'build' }));
      }),
    );

    const session = await createApiClient({ baseURL, token: 'abc' }).session('0123456789abcdef');

    expect(token).toBe('abc');
    expect(session).toMatchObject({ id: '0123456789abcdef', step: 'build' });
  });

  it('AC-17: rejects with not_found for a session the server doesn’t have', async () => {
    server.use(
      http.get(oneUrl('fedcba9876543210'), () =>
        HttpResponse.json({ code: 'not_found', message: 'There is no session with this id.' }, { status: 404 }),
      ),
    );
    const error = await createApiClient({ baseURL, token: 't' })
      .session('fedcba9876543210')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'not_found', status: 404 });
  });

  it('puts the id in the path safely', async () => {
    let path = '';
    server.use(
      http.get(`${baseURL}/api/sessions/:id`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json(makeSession());
      }),
    );
    await createApiClient({ baseURL, token: 't' }).session('a/b');
    expect(path).toBe('/api/sessions/a%2Fb');
  });
});

describe('createApiClient().startSession()', () => {
  it('AC-1, AC-11: sends the ticket and the folder, and returns the answer', async () => {
    let body: unknown = null;
    server.use(
      http.post(sessionsUrl, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ result: 'started', sessionId: '0123456789abcdef' });
      }),
    );
    const answer = await createApiClient({ baseURL, token: 't' }).startSession({
      ticketKey: 'PROJ-1423',
      repositoryId: '00000000000000aa',
    });
    expect(body).toEqual({ ticketKey: 'PROJ-1423', repositoryId: '00000000000000aa' });
    expect(answer).toEqual({ result: 'started', sessionId: '0123456789abcdef' });
  });

  it('AC-12: returns why a session can’t start', async () => {
    server.use(http.post(sessionsUrl, () => HttpResponse.json({ result: 'cannot_start', reason: 'too_many' })));
    expect(await createApiClient({ baseURL, token: 't' }).startSession({ ticketKey: 'PROJ-1423' })).toEqual({
      result: 'cannot_start',
      reason: 'too_many',
    });
  });
});

describe('createApiClient().startSession() from the composer (spec 015)', () => {
  it('AC-4, AC-20: sends your message, the folder and the chips in order, and returns the answer', async () => {
    let body: unknown = null;
    server.use(
      http.post(sessionsUrl, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ result: 'started', sessionId: '0123456789abcdef' });
      }),
    );
    const start = makeComposerStart({
      message: 'Use the notes',
      context: [
        { kind: 'file', name: 'notes.md', text: 'Export every column.' },
        { kind: 'jira', key: 'PROJ-1423' },
        { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 },
      ],
    });
    const answer = await createApiClient({ baseURL, token: 't' }).startSession(start);
    expect(body).toEqual(start);
    expect(answer).toEqual({ result: 'started', sessionId: '0123456789abcdef' });
  });

  it('AC-21: returns which chip failed and how', async () => {
    server.use(
      http.post(sessionsUrl, () => HttpResponse.json({ result: 'context_failed', chip: 1, problem: 'unreachable' })),
    );
    expect(await createApiClient({ baseURL, token: 't' }).startSession(makeComposerStart())).toEqual({
      result: 'context_failed',
      chip: 1,
      problem: 'unreachable',
    });
  });
});

describe('createApiClient().stopSession() and discardSession()', () => {
  it('AC-9, AC-10: post to the session’s stop and discard paths', async () => {
    const posted: string[] = [];
    server.use(
      http.post(`${baseURL}/api/sessions/:id/:action`, ({ request }) => {
        posted.push(new URL(request.url).pathname);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const api = createApiClient({ baseURL, token: 't' });
    await api.stopSession('0123456789abcdef');
    await api.discardSession('0123456789abcdef');
    expect(posted).toEqual(['/api/sessions/0123456789abcdef/stop', '/api/sessions/0123456789abcdef/discard']);
  });
});

describe('createApiClient().respondToApproval() (spec 012)', () => {
  it('AC-2, AC-3, AC-5: posts the answer to the call’s path under its session', async () => {
    const sent: { path: string; body: unknown }[] = [];
    server.use(
      http.post(`${baseURL}/api/sessions/:id/approvals/:approvalId`, async ({ request }) => {
        sent.push({ path: new URL(request.url).pathname, body: await request.json() });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const api = createApiClient({ baseURL, token: 't' });
    await api.respondToApproval('0123456789abcdef', 'approval/1', 'always_allow');
    expect(sent).toEqual([
      { path: '/api/sessions/0123456789abcdef/approvals/approval%2F1', body: { decision: 'always_allow' } },
    ]);
  });

  it('AC-13, AC-14: rejects with the code the page words: answered already, or the list not saved', async () => {
    const api = createApiClient({ baseURL, token: 't' });
    for (const [status, code] of [
      [409, 'already_answered'],
      [503, 'settings_unsaved'],
    ] as const) {
      server.use(
        http.post(`${baseURL}/api/sessions/:id/approvals/:approvalId`, () =>
          HttpResponse.json({ code, message: 'x' }, { status }),
        ),
      );
      const error = await api
        .respondToApproval('0123456789abcdef', 'a1', 'allow_once')
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({ code });
    }
  });
});

describe('sessionQueryOptions', () => {
  it('AC-4: keys one session under "sessions", so sessions.changed refreshes it with the lists', () => {
    const api = createApiClient({ baseURL, token: 't' });
    expect(sessionQueryOptions(api, '0123456789abcdef').queryKey).toEqual([
      ...queryKeys.sessions,
      'detail',
      '0123456789abcdef',
    ]);
  });

  it('AC-10: asks for recent sessions only when told to', async () => {
    let recent: string | null = 'unset';
    server.use(
      http.get(sessionsUrl, ({ request }) => {
        recent = new URL(request.url).searchParams.get('recent');
        return HttpResponse.json({ sessions: [] });
      }),
    );
    await createApiClient({ baseURL, token: 't' }).sessions({ limit: 5, recent: true });
    expect(recent).toBe('true');
  });
});

const at = (route: string, id: string) => `${baseURL}${route.replace(':id', id)}`;

describe('createApiClient().sendMessage() (spec 013)', () => {
  it('AC-11: sends your text with the token, and answers sent', async () => {
    let body: unknown = null;
    let token: string | null = null;
    server.use(
      http.post(at(apiRoutes.sessionMessages, '0123456789abcdef'), async ({ request }) => {
        token = request.headers.get(tokenHeader);
        body = await request.json();
        return HttpResponse.json({ result: 'sent' });
      }),
    );
    const answer = await createApiClient({ baseURL, token: 'abc' }).sendMessage('0123456789abcdef', 'Use the hook');
    expect(answer).toEqual({ result: 'sent' });
    expect(body).toEqual({ text: 'Use the hook' });
    expect(token).toBe('abc');
  });

  it("AC-14, AC-15: answers why a follow-up can't go", async () => {
    server.use(
      http.post(at(apiRoutes.sessionMessages, '0123456789abcdef'), () =>
        HttpResponse.json({ result: 'cannot_send', reason: 'too_many' }),
      ),
    );
    expect(await createApiClient({ baseURL, token: 'abc' }).sendMessage('0123456789abcdef', 'More')).toEqual({
      result: 'cannot_send',
      reason: 'too_many',
    });
  });
});

describe('createApiClient().sessionChanges() and sessionDiff() (spec 013)', () => {
  it('AC-2: reads the changes, parsed by the contract', async () => {
    server.use(
      http.get(at(apiRoutes.sessionChanges, '0123456789abcdef'), () => HttpResponse.json(makeSessionChanges())),
    );
    expect(await createApiClient({ baseURL, token: 'abc' }).sessionChanges('0123456789abcdef')).toEqual(
      makeSessionChanges(),
    );
  });

  it('rejects changes that break the contract', async () => {
    server.use(http.get(at(apiRoutes.sessionChanges, '0123456789abcdef'), () => HttpResponse.json({ state: 'lost' })));
    await expect(createApiClient({ baseURL, token: 'abc' }).sessionChanges('0123456789abcdef')).rejects.toThrow();
  });

  it('AC-3: asks for one file’s diff by its path, sent safely in the query', async () => {
    let path: string | null = null;
    server.use(
      http.get(at(apiRoutes.sessionChangesDiff, '0123456789abcdef'), ({ request }) => {
        path = new URL(request.url).searchParams.get('path');
        return HttpResponse.json(makeFileDiff());
      }),
    );
    const diff = await createApiClient({ baseURL, token: 'abc' }).sessionDiff('0123456789abcdef', 'src/a & b?.ts');
    expect(path).toBe('src/a & b?.ts');
    expect(diff).toEqual(makeFileDiff());
  });

  it('AC-24: rejects with not_found for a path that isn’t among the changes', async () => {
    server.use(
      http.get(at(apiRoutes.sessionChangesDiff, '0123456789abcdef'), () =>
        HttpResponse.json({ code: 'not_found', message: 'No.' }, { status: 404 }),
      ),
    );
    await expect(
      createApiClient({ baseURL, token: 'abc' }).sessionDiff('0123456789abcdef', '../x'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('the changes’ query options (spec 013)', () => {
  const api = createApiClient({ baseURL, token: 'abc' });

  it('AC-2: keys the changes under the sessions key, apart from the session itself, with each diff under them', () => {
    const changes = sessionChangesQueryOptions(api, '0123456789abcdef').queryKey;
    const diff = sessionDiffQueryOptions(api, '0123456789abcdef', 'src/a.ts').queryKey;
    expect(changes.slice(0, queryKeys.sessions.length)).toEqual([...queryKeys.sessions]);
    expect(changes.slice(0, sessionQueryKey('0123456789abcdef').length)).not.toEqual([
      ...sessionQueryKey('0123456789abcdef'),
    ]);
    expect(diff.slice(0, changes.length)).toEqual([...changes]);
  });

  it('AC-2: refetches whenever asked, so coming back to the window shows edits made outside Orynx', () => {
    expect(sessionChangesQueryOptions(api, '0123456789abcdef').staleTime).toBe(0);
    expect(sessionDiffQueryOptions(api, '0123456789abcdef', 'src/a.ts').staleTime).toBe(0);
  });
});
