import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
  acceptingBoardConfiguration,
  acceptingFieldList,
  acceptingIssueSearch,
  acceptingMyself,
  acceptingMySprintSearch,
  acceptingSprintIssueSearch,
  acceptingStatusList,
  goodToken,
  issueSearchUrl,
  jiraEmail,
  jiraSite,
  myselfUrl,
  type FakeIssue,
} from '../test/fake-jira.ts';
import { createTicketsService } from '../tickets/tickets-service.ts';
import { cacheFilePath, openInboxCache, type InboxCache } from './inbox-cache.ts';
import { createInboxService } from './inbox-service.ts';

/** Jira and GitHub, the outside services, faked for this file only. */
const outside = setupServer();
beforeAll(() => {
  outside.listen({ onUnhandledFrame: 'error' });
});
const start = Date.parse('2026-10-17T10:00:00.000Z');
let clock = start;

afterEach(() => {
  outside.resetHandlers();
  outside.events.removeAllListeners();
  clock = start;
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

function setup({
  settings: initial = {},
  sessions = [],
  cache = openInboxCache(':memory:'),
  sprint = false,
}: { settings?: Settings; sessions?: SessionSummary[]; cache?: InboxCache; sprint?: boolean } = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const settings = createMemorySettingsStore(initial);
  const tokens = createTokenStore({
    keychain: createMemoryKeychain({ jira: goodToken, github: githubToken }),
    events,
  });
  const preferences = createPreferencesService({ settings, events });
  const jiraConnection = createJiraConnection({ settings, tokens, jira: createJiraClient(), events, envToken: false });
  const tickets = createTicketsService({
    cache,
    settings,
    connection: jiraConnection,
    jira: createJiraClient({ timeoutMs: 300 }),
    sessions: createMemorySessionStore(sessions),
    now: () => clock,
  });
  const inbox = createInboxService({
    cache,
    settings,
    ...(sprint ? { sprint: tickets } : {}),
    connections: {
      jira: jiraConnection,
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
  return { inbox, tickets, settings, preferences, seen, cache };
}

/** Jira answering every read of the sprint (spec 008): you, the sprint field, your sprint, its board and issues. */
function acceptingSprint(issues: FakeIssue[] = [issue]) {
  outside.use(
    acceptingMyself(),
    acceptingFieldList(),
    acceptingMySprintSearch(issues.map((found) => ({ ...found, sprints: [{ id: 42, boardId: 7 }] }))),
    acceptingBoardConfiguration(7),
    acceptingStatusList(),
    acceptingSprintIssueSearch(
      42,
      issues.map((found) => ({ ...found, priority: null })),
    ),
  );
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

  it('AC-31: clearing the cache empties it, tells open pages and syncs again at once, on its own', async () => {
    outside.use(acceptingIssueSearch([issue]));
    const { inbox, seen } = setup({ settings: jiraConnected });
    await inbox.sync();
    seen.length = 0;

    await inbox.clear();

    expect(seen[0]).toEqual({ type: 'inbox.changed' });
    expect((await inbox.read()).tools.jira).toEqual({ state: 'syncing' });
    await vi.waitFor(async () => {
      expect((await inbox.read()).items.map((item) => item.id)).toEqual(['jira:PROJ-1423']);
    });
  });

  it('AC-31: clearing during a sync that already wrote syncs once more, so nothing is left empty', async () => {
    outside.use(
      acceptingIssueSearch([issue]),
      http.post(graphqlUrl, async () => {
        await delay(80);
        return HttpResponse.json({
          data: { viewer: { login: 'octocat' }, reviews: { nodes: [] }, mine: { nodes: [] } },
        });
      }),
    );
    const { inbox, cache } = setup({ settings: bothConnected });
    const syncing = inbox.sync();
    await vi.waitFor(() => {
      expect(cache.tool('jira')).not.toBeNull();
    });

    await inbox.clear();
    await syncing;
    await inbox.idle();

    expect((await inbox.read()).tools.jira.state).toBe('synced');
    expect((await inbox.read()).items.map((item) => item.id)).toEqual(['jira:PROJ-1423']);
  });

  it('a tool connected while a sync runs is synced by a pass that follows it', async () => {
    outside.use(
      acceptingIssueSearch([issue]),
      http.post(graphqlUrl, async () => {
        await delay(80);
        return HttpResponse.json({
          data: { viewer: { login: 'octocat' }, reviews: { nodes: [] }, mine: { nodes: [] } },
        });
      }),
    );
    const { inbox, settings } = setup({ settings: githubConnected });
    const syncing = inbox.sync();
    await delay(10);

    await settings.update((current) => ({ ...current, ...jiraConnected }));
    await inbox.syncAfterChange();
    await syncing;

    expect((await inbox.read()).tools.jira.state).toBe('synced');
    expect((await inbox.read()).items.map((item) => item.id)).toEqual(['jira:PROJ-1423']);
  });

  it('AC-30: rows a disconnected tool left in the cache go at the next sync', async () => {
    const cache = openInboxCache(':memory:');
    cache.synced('jira', {
      connection: `${jiraSite} ${jiraEmail}`,
      at: '2026-10-17T09:00:00.000Z',
      records: [{ id: 'PROJ-1', data: {} }],
    });
    const { inbox } = setup({ cache });

    await inbox.sync();

    expect(cache.tool('jira')).toBeNull();
  });

  it('says so in its line when a tool’s sync breaks in DevHub itself, such as a cache it can’t write', async () => {
    const home = join(await mkdtemp(join(tmpdir(), 'devhub-inbox-broken-')), 'home');
    const cache = openInboxCache(cacheFilePath(home));
    outside.use(acceptingIssueSearch([issue]));
    const errors: unknown[] = [];
    const { inbox } = setup({ settings: jiraConnected, cache });
    try {
      // SQLite can't make its journal in a folder it can't write, so the write fails; reads still work.
      await chmod(home, 0o500);
      await inbox.sync().catch((error: unknown) => errors.push(error));

      expect((await inbox.read()).tools.jira).toEqual({
        state: 'failed',
        problem: { kind: 'other', message: 'Something went wrong in the local server. See the terminal for details.' },
        lastSyncedAt: null,
      });
      expect(errors).toEqual([]);

      await chmod(home, 0o700);
      await inbox.sync();
      expect((await inbox.read()).tools.jira.state).toBe('synced');
    } finally {
      await chmod(home, 0o700);
      cache.close();
      await rm(join(home, '..'), { recursive: true, force: true });
    }
  });

  it('is idle once no sync runs, so the host can close the cache after the last write', async () => {
    outside.use(
      http.post(issueSearchUrl(), async () => {
        await delay(50);
        return HttpResponse.json({ issues: [], isLast: true });
      }),
    );
    const { inbox, cache } = setup({ settings: jiraConnected });

    void inbox.sync();
    await inbox.idle();

    expect(cache.tool('jira')?.syncedAt).toBe('2026-10-17T10:00:00.000Z');
    await inbox.idle();
  });

  describe('with Tickets’ sprint (spec 008)', () => {
    it('AC-17: a sync reads the sprint beside the tools, and each tells open pages when it ends', async () => {
      outside.use(acceptingIssueSearch([issue]));
      acceptingSprint();
      const { inbox, tickets, seen } = setup({ settings: jiraConnected, sprint: true });

      await inbox.sync();
      await inbox.idle();

      expect((await tickets.read()).tickets.map((ticket) => ticket.key)).toEqual(['PROJ-1423']);
      expect((await inbox.read()).items.map((item) => item.id)).toEqual(['jira:PROJ-1423']);
      expect(seen).toEqual([{ type: 'inbox.changed' }, { type: 'inbox.changed' }]);
    });

    it('AC-17: Home’s rows and Refresh never wait for a slow sprint', async () => {
      outside.use(acceptingIssueSearch([issue]));
      acceptingSprint();
      outside.use(
        http.get(myselfUrl(), async () => {
          await delay(150);
          return HttpResponse.json({ accountId: '5b10ac8d82e05b22cc7d4ef5', displayName: 'Dev Example' });
        }),
      );
      const { inbox, tickets } = setup({ settings: jiraConnected, sprint: true });

      await inbox.sync();

      expect((await inbox.read()).items.map((item) => item.id)).toEqual(['jira:PROJ-1423']);
      expect((await tickets.read()).jira).toEqual({ state: 'syncing' });
      await inbox.idle();
      expect((await tickets.read()).tickets).toHaveLength(1);
    });

    it('a sync while the sprint is still on its way reads the sprint once more after it', async () => {
      outside.use(acceptingIssueSearch([issue]));
      acceptingSprint();
      let reads = 0;
      outside.use(
        http.get(myselfUrl(), async () => {
          reads += 1;
          await delay(50);
          return HttpResponse.json({ accountId: '5b10ac8d82e05b22cc7d4ef5', displayName: 'Dev Example' });
        }),
      );
      const { inbox } = setup({ settings: jiraConnected, sprint: true });

      await inbox.sync();
      await inbox.sync();
      await inbox.sync();
      await inbox.idle();

      // The second and third syncs ask for one more pass, not one each.
      expect(reads).toBe(2);
    });

    it('AC-23: a sprint read that fails leaves Home’s Jira line and its sync time alone', async () => {
      outside.use(
        acceptingIssueSearch([issue]),
        http.get(myselfUrl(), () => HttpResponse.json({ errorMessages: ['Down'] }, { status: 503 })),
      );
      const { inbox, tickets } = setup({ settings: jiraConnected, sprint: true });

      await inbox.sync();
      await inbox.idle();

      expect((await tickets.read()).jira).toMatchObject({ state: 'failed', problem: { kind: 'no_answer' } });
      const read = await inbox.read();
      expect(read.tools.jira).toEqual({ state: 'synced', at: '2026-10-17T10:00:00.000Z' });
      expect(read.syncedAt).toBe('2026-10-17T10:00:00.000Z');
    });

    it('AC-29: disconnecting Jira takes the sprint too', async () => {
      outside.use(acceptingIssueSearch([issue]));
      acceptingSprint();
      const { inbox, cache } = setup({ settings: jiraConnected, sprint: true });
      await inbox.sync();
      await inbox.idle();
      expect(cache.tool('jira_sprint')).not.toBeNull();

      inbox.forget('jira');

      expect(cache.tool('jira_sprint')).toBeNull();
    });

    it('AC-29: Clear cache takes the sprint and syncs it again', async () => {
      outside.use(acceptingIssueSearch([issue]));
      acceptingSprint();
      const { inbox, tickets, cache } = setup({ settings: jiraConnected, sprint: true });
      await inbox.sync();
      await inbox.idle();

      await inbox.clear();
      expect(cache.tool('jira_sprint')).toBeNull();

      await vi.waitFor(() => { expect(cache.tool('jira_sprint')).not.toBeNull(); });
      await inbox.idle();
      expect((await tickets.read()).tickets).toHaveLength(1);
    });

    it('AC-29: a sprint a disconnected Jira left in the cache goes at the next sync', async () => {
      outside.use(acceptingIssueSearch([issue]));
      acceptingSprint();
      const cache = openInboxCache(':memory:');
      const first = setup({ settings: jiraConnected, cache, sprint: true }).inbox;
      await first.sync();
      await first.idle();
      expect(cache.tool('jira_sprint')).not.toBeNull();
      const asked = requests();

      const second = setup({ cache, sprint: true }).inbox;
      await second.sync();
      await second.idle();

      expect(cache.tool('jira_sprint')).toBeNull();
      expect(asked()).toEqual([]);
    });
  });
});
