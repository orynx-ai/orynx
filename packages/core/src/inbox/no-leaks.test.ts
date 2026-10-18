import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { createMemoryKeychain, createUnreachableKeychain } from '../secrets/memory-keychain.ts';
import { createFileSettingsStore } from '../settings/settings-store.ts';
import { githubToken, graphqlUrl, pullNode } from '../test/fake-github.ts';
import {
  acceptingBoardConfiguration,
  acceptingFieldList,
  acceptingMyself,
  acceptingMySprintSearch,
  acceptingStatusList,
  fieldListUrl,
  goodBasicValue,
  goodToken,
  issueSearchUrl,
  jiraEmail,
  jiraIssue,
  jiraSite,
  myselfUrl,
} from '../test/fake-jira.ts';
import { cacheFilePath, openInboxCache } from './inbox-cache.ts';

const sessionToken = 'inbox-leaks-session-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: sessionToken };
const description = 'Private description that must stay in Jira';
const commentText = 'Private review comment that must stay on GitHub';

/** Jira and GitHub, sending more than DevHub asks for, as a careless proxy or a future API might. */
const outside = setupServer(
  http.post(issueSearchUrl(), () => {
    const issue = jiraIssue({ key: 'PROJ-1423', summary: 'Add bulk archive to the content list' });
    return HttpResponse.json({
      issues: [{ ...issue, fields: { ...issue.fields, description, comment: { comments: [{ body: commentText }] } } }],
      isLast: true,
    });
  }),
  http.post(graphqlUrl, () => {
    const pull = pullNode({
      number: 2836,
      checks: 'FAILURE',
      threads: [{ resolved: false, lastBy: 'priya-s', at: '2026-10-16T10:00:00Z' }],
    });
    const threads = pull.reviewThreads.nodes.map((thread) => ({
      ...thread,
      comments: { nodes: thread.comments.nodes.map((comment) => ({ ...comment, body: commentText })) },
    }));
    return HttpResponse.json({
      data: {
        viewer: { login: 'octocat' },
        reviews: { nodes: [] },
        mine: { nodes: [{ ...pull, body: description, reviewThreads: { nodes: threads } }] },
      },
    });
  }),
);
beforeAll(() => {
  outside.listen({ onUnhandledFrame: 'error' });
});
afterAll(() => {
  outside.close();
});

let app: FastifyInstance | undefined;
let home: string | undefined;

afterEach(async () => {
  outside.resetHandlers();
  await app?.close();
  app = undefined;
  if (home !== undefined) await rm(home, { recursive: true, force: true });
  home = undefined;
});

describe('the inbox never leaks', () => {
  it('AC-28: a sync writes no token to the log, and no token, description or comment text to cache.db or search', async () => {
    home = await mkdtemp(join(tmpdir(), 'devhub-inbox-leaks-'));
    const settings = createFileSettingsStore(home);
    await settings.update(() => ({ jira: { site: jiraSite, email: jiraEmail }, github: { method: 'token' } }));
    const log: string[] = [];
    app = await createServer({
      token: sessionToken,
      port,
      version: 'test',
      userName: () => Promise.resolve(null),
      keychain: createMemoryKeychain({ jira: goodToken, github: githubToken }),
      settings,
      cache: openInboxCache(cacheFilePath(home)),
      logger: {
        level: 'trace',
        stream: new Writable({
          write(chunk: Buffer, _encoding, done) {
            log.push(chunk.toString());
            done();
          },
        }),
      },
    });

    // Tickets' sprint (spec 008), whose issues come with the same text DevHub never asks for.
    outside.use(
      acceptingMyself(),
      acceptingFieldList(),
      acceptingMySprintSearch([{ key: 'PROJ-1423', sprints: [{ id: 42, boardId: 7 }] }]),
      http.post(issueSearchUrl(), async ({ request }) => {
        const body = (await request.clone().json()) as { jql?: string };
        if (body.jql?.startsWith('sprint = 42 ') !== true) return undefined;
        const issue = jiraIssue({ key: 'PROJ-1402', summary: 'Add empty state to saved searches', priority: null });
        return HttpResponse.json({
          issues: [
            { ...issue, fields: { ...issue.fields, description, comment: { comments: [{ body: commentText }] } } },
          ],
          isLast: true,
        });
      }),
      acceptingBoardConfiguration(7),
      acceptingStatusList(),
    );

    await app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });
    const inbox = await app.inject({ method: 'GET', url: apiRoutes.inbox, headers });
    // The sprint follows Home's rows on its own.
    const tickets = await vi.waitFor(async () => {
      const read = await app?.inject({ method: 'GET', url: apiRoutes.tickets, headers });
      expect(read?.json<{ tickets: unknown[] }>().tickets).toHaveLength(1);
      if (read === undefined) throw new Error('No server');
      return read;
    });
    // Search (spec 009) reads the same cache and sessions.
    const search = await app.inject({ method: 'GET', url: apiRoutes.search, headers });
    await app.close();
    app = undefined;

    expect(inbox.json<{ items: unknown[] }>().items).toHaveLength(2);
    expect(search.json<{ tickets: unknown[] }>().tickets).toHaveLength(2);
    expect(tickets.json<{ tickets: unknown[] }>().tickets).toHaveLength(1);
    const cache = (await readFile(cacheFilePath(home))).toString('latin1');
    expect(cache).toContain('Add bulk archive to the content list');
    expect(cache).toContain('Add empty state to saved searches');
    for (const secret of [goodToken, goodBasicValue, githubToken, sessionToken]) {
      expect(log.join('')).not.toContain(secret);
      expect(cache).not.toContain(secret);
      expect(tickets.body).not.toContain(secret);
      expect(search.body).not.toContain(secret);
    }
    expect(cache).not.toContain(description);
    expect(cache).not.toContain(commentText);
    expect(tickets.body).not.toContain(description);
    expect(tickets.body).not.toContain(commentText);
    expect(search.body).not.toContain(description);
    expect(search.body).not.toContain(commentText);
  });

  it('AC-28: failed syncs log what went wrong, never a token, an error body or a header', async () => {
    home = await mkdtemp(join(tmpdir(), 'devhub-inbox-leaks-'));
    const settings = createFileSettingsStore(home);
    await settings.update(() => ({ jira: { site: jiraSite, email: jiraEmail }, github: { method: 'token' } }));
    const errorBody = `Bad credentials for ${goodToken}`;
    outside.use(
      http.post(issueSearchUrl(), () =>
        HttpResponse.json(
          { errorMessages: [errorBody] },
          { status: 401, headers: { 'X-Seraph-LoginReason': 'AUTHENTICATED_FAILED' } },
        ),
      ),
      http.post(graphqlUrl, () =>
        HttpResponse.json({ data: null, errors: [{ type: 'FORBIDDEN', message: `Token ${githubToken} refused` }] }),
      ),
      // Tickets' sprint read (spec 008) is refused the same way, with the token in the body.
      http.get(myselfUrl(), () =>
        HttpResponse.json(
          { errorMessages: [errorBody] },
          { status: 401, headers: { 'X-Seraph-LoginReason': 'AUTHENTICATED_FAILED' } },
        ),
      ),
      http.get(fieldListUrl(), () =>
        HttpResponse.json(
          { errorMessages: [errorBody] },
          { status: 401, headers: { 'X-Seraph-LoginReason': 'AUTHENTICATED_FAILED' } },
        ),
      ),
    );

    for (const [index, keychain] of [
      createMemoryKeychain({ jira: goodToken, github: githubToken }),
      createUnreachableKeychain(),
    ].entries()) {
      const log: string[] = [];
      app = await createServer({
        token: sessionToken,
        port,
        version: 'test',
        userName: () => Promise.resolve(null),
        keychain,
        settings,
        cache: openInboxCache(cacheFilePath(home)),
        logger: {
          level: 'trace',
          stream: new Writable({
            write(chunk: Buffer, _encoding, done) {
              log.push(chunk.toString());
              done();
            },
          }),
        },
      });

      await app.inject({ method: 'POST', url: apiRoutes.inboxRefresh, headers });
      const inbox = await app.inject({ method: 'GET', url: apiRoutes.inbox, headers });
      // The sprint's own pass ends after Home's rows; closing waits for it.
      await app.close();
      const tickets = await (async () => {
        const reopened = await createServer({
          token: sessionToken,
          port,
          version: 'test',
          userName: () => Promise.resolve(null),
          keychain,
          settings,
          cache: openInboxCache(cacheFilePath(home)),
        });
        try {
          return await reopened.inject({ method: 'GET', url: apiRoutes.tickets, headers });
        } finally {
          await reopened.close();
        }
      })();
      app = undefined;

      const cache = (await readFile(cacheFilePath(home))).toString('latin1');
      expect(log.join('')).toContain('The inbox sync could not read this tool');
      // With the token in the keychain the sprint read reaches Jira and is refused; without, it never asks.
      if (index === 0) expect(log.join('')).toContain('The sprint sync could not read Jira');
      expect(tickets.json<{ jira: { state: string } }>().jira.state).toBe('failed');
      for (const secret of [goodToken, goodBasicValue, githubToken, sessionToken, errorBody]) {
        expect(log.join('')).not.toContain(secret);
        expect(inbox.body).not.toContain(secret);
        expect(tickets.body).not.toContain(secret);
        expect(cache).not.toContain(secret);
      }
    }
  });
});
