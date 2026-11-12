import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, StandupSchema, tokenHeader, type Session } from '@devhub/contracts';
import { makeSession, makeSessionPullRequest } from '@devhub/contracts/testing';
import { createServer } from '../create-server.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createMemorySessionStore, StoredSessionSchema } from '../sessions/session-store.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';
import { acceptingMergedSearch, githubToken } from '../test/fake-github.ts';
import {
  goodBasicValue,
  goodToken,
  issueSearchUrl,
  jiraEmail,
  jiraIssue,
  jiraSite,
  type FakeIssue,
} from '../test/fake-jira.ts';

// Jira and GitHub are outside services, faked together for this file.
const tools = setupServer();
beforeAll(() => {
  tools.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  tools.resetHandlers();
});
afterAll(() => {
  tools.close();
});

const token = 'standup-session-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
// Monday 9 Nov 2026, 9:30 on the laptop's clock: the standup covers Friday 6 Nov.
const monday = new Date(2026, 10, 9, 9, 30);
const friday = (hour: number) => new Date(2026, 10, 6, hour).toISOString();

/** Jira answering the standup's two searches by what each asks: the moves you made, and your work in progress. */
function jiraSearches({ moved, inProgress }: { moved: FakeIssue[]; inProgress: FakeIssue[] }, asked: string[] = []) {
  return http.post(issueSearchUrl(), async ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) {
      return HttpResponse.json({ errorMessages: ['Unauthorized'] }, { status: 401 });
    }
    const { jql } = (await request.json()) as { jql: string };
    asked.push(jql);
    const issues = jql.includes('CHANGED BY') ? moved : inProgress;
    return HttpResponse.json({ issues: issues.map(jiraIssue), isLast: true });
  });
}

const merged: Session = makeSession({
  id: '0000000000000001',
  title: 'Add bulk archive',
  state: 'pr_merged',
  source: { kind: 'jira', key: 'PROJ-1423' },
  pullRequest: makeSessionPullRequest({ number: 2974, openedAt: '2026-11-02T10:00:00.000Z' }),
});
const opened: Session = makeSession({
  id: '0000000000000002',
  title: 'Retry failed exports',
  state: 'pr_open',
  source: null,
  pullRequest: makeSessionPullRequest({
    number: 2980,
    url: 'https://github.com/acme/web-app/pull/2980',
    openedAt: friday(15),
  }),
});
const waiting: Session = makeSession({ id: '0000000000000003', title: 'Pick a date library', state: 'needs_you' });
const older: Session = makeSession({
  id: '0000000000000004',
  title: 'An older one',
  state: 'pr_open',
  pullRequest: makeSessionPullRequest({
    number: 2901,
    url: 'https://github.com/acme/web-app/pull/2901',
    openedAt: '2026-11-05T15:00:00.000Z',
  }),
});

let app: FastifyInstance | undefined;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: monday });
});
afterEach(async () => {
  vi.useRealTimers();
  await app?.close();
  app = undefined;
});

async function hub({ jira = true, github = true } = {}) {
  const sessions = createMemorySessionStore();
  for (const session of [merged, opened, waiting, older]) {
    await sessions.create(
      StoredSessionSchema.parse({
        session,
        repository: null,
        worktree: null,
        startCommit: null,
        claudeSessionId: null,
      }),
    );
  }
  app = await createServer({
    token,
    port,
    version: 'test',
    userName: () => Promise.resolve(null),
    keychain: createMemoryKeychain({
      ...(jira ? { jira: goodToken } : {}),
      ...(github ? { github: githubToken } : {}),
    }),
    settings: createMemorySettingsStore({
      ...(jira ? { jira: { site: jiraSite, email: jiraEmail } } : {}),
      ...(github ? { github: { method: 'token' as const } } : {}),
    }),
    sessions,
  });
  return app;
}

async function standup(server: FastifyInstance) {
  const res = await server.inject({ method: 'GET', url: apiRoutes.standup, headers });
  expect(res.statusCode).toBe(200);
  return StandupSchema.parse(res.json());
}

describe('GET /api/standup (spec 057, C)', () => {
  it('AC-28, AC-29: drafts Friday from GitHub, Jira and your sessions, and asks Jira only about Friday', async () => {
    const asked: string[] = [];
    tools.use(
      acceptingMergedSearch([{ repository: 'acme/web-app', number: 2974, title: 'Add bulk archive' }]),
      jiraSearches(
        {
          moved: [{ key: 'PROJ-1419', status: 'In Review', category: 'indeterminate' }],
          inProgress: [
            { key: 'PROJ-1431', summary: 'Retry failed exports', status: 'In Progress', category: 'indeterminate' },
          ],
        },
        asked,
      ),
    );

    expect(await standup(await hub())).toEqual({
      day: '2026-11-06',
      missing: [],
      text: [
        'Yesterday',
        '• Merged #2974 Add bulk archive (PROJ-1423)',
        '• Opened #2980 Retry failed exports',
        '• Moved PROJ-1419 to In Review',
        '',
        'Today',
        '• PROJ-1431 Retry failed exports (In Progress)',
        '• Pick a date library (Claude is waiting for you)',
        '',
        'Blockers',
        '• None',
      ].join('\n'),
    });
    expect(asked.find((jql) => jql.includes('CHANGED BY'))).toBe(
      'status CHANGED BY currentUser() DURING ("2026-11-06", "2026-11-07") ORDER BY updated DESC',
    );
  });

  it('AC-31: with Jira not connected and GitHub not answering, the draft has the rest and names both', async () => {
    tools.use(http.post('https://api.github.com/graphql', () => HttpResponse.error()));

    const draft = await standup(await hub({ jira: false }));
    expect(draft.missing).toEqual(['github', 'jira']);
    expect(draft.text).toContain('• Opened #2980 Retry failed exports');
  });
});
