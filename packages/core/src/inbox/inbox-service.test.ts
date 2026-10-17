import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ServerEvent, SessionSummary } from '@devhub/contracts';
import { makeSessionSummary } from '@devhub/contracts/testing';
import { createEventBus } from '../events/event-bus.ts';
import { createGitHubClient } from '../integrations/github/client.ts';
import { createGitHubConnection } from '../integrations/github/connection.ts';
import { createGhCli } from '../integrations/github/gh.ts';
import { createJiraClient } from '../integrations/jira/client.ts';
import { createJiraConnection } from '../integrations/jira/connection.ts';
import { createPreferencesService } from '../preferences/preferences-service.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createTokenStore } from '../secrets/token-store.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import { acceptingInboxQuery, githubToken, graphqlUrl, type FakePull } from '../test/fake-github.ts';
import {
  acceptingIssueSearch,
  goodToken,
  issueSearchUrl,
  jiraEmail,
  jiraSite,
  type FakeIssue,
} from '../test/fake-jira.ts';
import { openInboxCache } from './inbox-cache.ts';
import { createInboxService } from './inbox-service.ts';

/** Jira and GitHub, the outside services, faked for this file only. */
const outside = setupServer();
beforeAll(() => {
  outside.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  outside.resetHandlers();
  outside.events.removeAllListeners();
});
afterAll(() => {
  outside.close();
});

const jiraConnected: Settings = { jira: { site: jiraSite, email: jiraEmail } };
const githubConnected: Settings = { github: { method: 'token' } };
const bothConnected: Settings = { ...jiraConnected, ...githubConnected };

const issue: FakeIssue = {
  key: 'PROJ-1423',
  summary: 'Add bulk archive to the content list',
  statuscategorychangedate: '2026-10-15T09:00:00.000+0000',
};
const review: FakePull = {
  number: 2841,
  title: 'Lazy-load the people directory',
  requests: [{ login: 'octocat', at: '2026-10-14T09:00:00Z' }],
};

let clock = Date.parse('2026-10-17T10:00:00.000Z');

function setup({ settings: initial = {}, sessions = [] }: { settings?: Settings; sessions?: SessionSummary[] } = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const settings = createMemorySettingsStore(initial);
  const tokens = createTokenStore({
    keychain: createMemoryKeychain({ jira: goodToken, github: githubToken }),
    events,
  });
  const cache = openInboxCache(':memory:');
  const preferences = createPreferencesService({ settings, events });
  const inbox = createInboxService({
    cache,
    settings,
    connections: {
      jira: createJiraConnection({ settings, tokens, jira: createJiraClient(), events, envToken: false }),
      github: createGitHubConnection({
        settings,
        tokens,
        github: createGitHubClient(),
        gh: createGhCli({ searchPath: '' }),
        events,
        envToken: false,
      }),
    },
    jira: createJiraClient({ timeoutMs: 300 }),
    github: createGitHubClient({ timeoutMs: 300 }),
    sessions: createMemorySessionStore(sessions),
    preferences,
    events,
    now: () => clock,
  });
  return { inbox, settings, preferences, seen, cache };
}

/** Counts the requests that reach Jira and GitHub. */
function requests(): () => string[] {
  const urls: string[] = [];
  outside.events.on('request:start', ({ request }) => {
    urls.push(request.url);
  });
  return () => urls;
}

describe('inbox service', () => {
  it('AC-21: with nothing connected the list is empty, and a sync asks nobody', async () => {
    const asked = requests();
    const { inbox } = setup();

    await inbox.sync();

    expect(await inbox.read()).toEqual({
      items: [],
      tools: { jira: { state: 'not_connected' }, github: { state: 'not_connected' } },
      syncedAt: null,
    });
    expect(asked()).toEqual([]);
  });

  it('AC-20: a connected tool that hasn’t synced yet has nothing to show', async () => {
    const { inbox } = setup({ settings: bothConnected });

    expect(await inbox.read()).toMatchObject({
      items: [],
      tools: { jira: { state: 'syncing' }, github: { state: 'syncing' } },
    });
  });

  it('AC-1, AC-16: a sync brings both tools’ rows, longest wait first, and tells open pages', async () => {
    outside.use(acceptingIssueSearch([issue]), acceptingInboxQuery({ reviews: [review] }));
    const { inbox, seen } = setup({ settings: bothConnected });

    await inbox.sync();

    const read = await inbox.read();
    expect(read.items.map((item) => [item.id, item.waitingSince])).toEqual([
      ['github:acme/web-app#2841', '2026-10-14T09:00:00.000Z'],
      ['jira:PROJ-1423', '2026-10-15T09:00:00.000Z'],
    ]);
    expect(read.tools).toEqual({
      jira: { state: 'synced', at: '2026-10-17T10:00:00.000Z' },
      github: { state: 'synced', at: '2026-10-17T10:00:00.000Z' },
    });
    expect(read.syncedAt).toBe('2026-10-17T10:00:00.000Z');
    expect(seen).toEqual([{ type: 'inbox.changed' }]);
  });

  it('AC-3: an issue that no longer comes back loses its row at the next sync', async () => {
    outside.use(acceptingIssueSearch([issue, { key: 'PROJ-7' }]));
    const { inbox } = setup({ settings: jiraConnected });
    await inbox.sync();

    outside.use(acceptingIssueSearch([{ key: 'PROJ-7' }]));
    await inbox.sync();

    expect((await inbox.read()).items.map((item) => item.id)).toEqual(['jira:PROJ-7']);
  });

  it('AC-15: turning a rule off takes its rows away without asking anyone again', async () => {
    outside.use(acceptingIssueSearch([issue]), acceptingInboxQuery({ reviews: [review] }));
    const { inbox, preferences } = setup({ settings: bothConnected });
    await inbox.sync();
    const asked = requests();

    await preferences.change({ inboxRules: { review_requested: false } });

    expect((await inbox.read()).items.map((item) => item.id)).toEqual(['jira:PROJ-1423']);
    expect(asked()).toEqual([]);
  });

  it('AC-12: a session waiting for approval takes over its ticket’s row', async () => {
    outside.use(acceptingIssueSearch([issue]));
    const session = makeSessionSummary({ id: 's1', state: 'needs_you', updatedAt: '2026-10-17T09:55:00.000Z' });
    const { inbox } = setup({ settings: jiraConnected, sessions: [session] });

    await inbox.sync();

    expect((await inbox.read()).items).toMatchObject([
      { id: 'jira:PROJ-1423', reason: { kind: 'approval' }, target: { kind: 'session', sessionId: 's1' } },
    ]);
  });

  it('AC-24: a tool that doesn’t answer keeps its last rows, while the other tool updates', async () => {
    outside.use(acceptingIssueSearch([issue]), acceptingInboxQuery({ reviews: [review] }));
    const { inbox } = setup({ settings: bothConnected });
    await inbox.sync();

    clock += 12 * 60_000;
    outside.use(
      acceptingIssueSearch([{ key: 'PROJ-7' }]),
      http.post(graphqlUrl, () => HttpResponse.json({ message: 'Server Error' }, { status: 502 })),
    );
    await inbox.sync();

    const read = await inbox.read();
    expect(read.tools).toEqual({
      jira: { state: 'synced', at: '2026-10-17T10:12:00.000Z' },
      github: { state: 'failed', problem: { kind: 'no_answer' }, lastSyncedAt: '2026-10-17T10:00:00.000Z' },
    });
    expect(read.items.map((item) => item.id).sort()).toEqual(['github:acme/web-app#2841', 'jira:PROJ-7']);
    // The last time every connected tool answered together.
    expect(read.syncedAt).toBe('2026-10-17T10:00:00.000Z');
  });

  it('AC-24: a used-up rate limit says when it resets', async () => {
    outside.use(
      http.post(graphqlUrl, () =>
        HttpResponse.json(
          { message: 'API rate limit exceeded' },
          { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792245900' } },
        ),
      ),
    );
    const { inbox } = setup({ settings: githubConnected });

    await inbox.sync();

    expect((await inbox.read()).tools.github).toEqual({
      state: 'failed',
      problem: { kind: 'rate_limited', until: '2026-10-17T14:05:00.000Z' },
      lastSyncedAt: null,
    });
  });

  it('AC-25: a refused token, or a Jira that wants a sign-in, says so', async () => {
    outside.use(
      http.post(issueSearchUrl(), () =>
        HttpResponse.json({}, { status: 403, headers: { 'X-Seraph-LoginReason': 'AUTHENTICATION_DENIED' } }),
      ),
      acceptingInboxQuery({ tokens: ['fake-other-token-for-tests'] }),
    );
    const { inbox } = setup({ settings: bothConnected });

    await inbox.sync();

    expect((await inbox.read()).tools).toEqual({
      jira: { state: 'failed', problem: { kind: 'sign_in_needed', site: jiraSite }, lastSyncedAt: null },
      github: { state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: null },
    });
  });

  it('runs one sync at a time: a second caller waits for the one already running', async () => {
    outside.use(
      http.post(issueSearchUrl(), async () => {
        await delay(50);
        return HttpResponse.json({ issues: [], isLast: true });
      }),
    );
    const asked = requests();
    const { inbox } = setup({ settings: jiraConnected });

    await Promise.all([inbox.sync(), inbox.sync()]);

    expect(asked()).toEqual([issueSearchUrl()]);
  });

  it('AC-30: a tool disconnected during a sync keeps nothing from it', async () => {
    outside.use(
      http.post(issueSearchUrl(), async () => {
        await delay(50);
        return HttpResponse.json({ issues: [], isLast: true });
      }),
    );
    const { inbox, settings, cache } = setup({ settings: jiraConnected });

    const syncing = inbox.sync();
    await delay(10);
    await settings.update(({ jira: _, ...rest }) => rest);
    await syncing;

    expect(cache.tool('jira')).toBeNull();
    expect((await inbox.read()).tools.jira).toEqual({ state: 'not_connected' });
  });

  it('AC-30: forgetting a tool removes its rows and tells open pages', async () => {
    outside.use(acceptingIssueSearch([issue]));
    const { inbox, seen, cache } = setup({ settings: jiraConnected });
    await inbox.sync();

    inbox.forget('jira');

    expect(cache.tool('jira')).toBeNull();
    expect(seen.at(-1)).toEqual({ type: 'inbox.changed' });
  });

  it('AC-31: clearing the cache empties it, tells open pages and syncs again at once', async () => {
    outside.use(acceptingIssueSearch([issue]));
    const { inbox, seen } = setup({ settings: jiraConnected });
    await inbox.sync();
    const asked = requests();

    await inbox.clear();

    expect(seen.at(-1)).toEqual({ type: 'inbox.changed' });
    expect((await inbox.read()).tools.jira).toEqual({ state: 'syncing' });
    await inbox.sync();
    expect(asked()).toEqual([issueSearchUrl()]);
    expect((await inbox.read()).items.map((item) => item.id)).toEqual(['jira:PROJ-1423']);
  });
});
