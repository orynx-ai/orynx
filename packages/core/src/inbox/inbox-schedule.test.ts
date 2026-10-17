import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { acceptingInboxQuery, githubToken, graphqlUrl } from '../test/fake-github.ts';
import { acceptingIssueSearch, goodToken, issueSearchUrl, jiraEmail, jiraSite } from '../test/fake-jira.ts';
import { openInboxCache } from './inbox-cache.ts';
import { createInboxService } from './inbox-service.ts';
import { startInboxSchedule } from './inbox-schedule.ts';

/** Jira and GitHub, the outside services, faked for this file only. */
const outside = setupServer();
let asked: string[] = [];
beforeAll(() => {
  outside.listen({ onUnhandledFrame: 'error' });
});
beforeEach(() => {
  asked = [];
  outside.use(acceptingIssueSearch([{ key: 'PROJ-1423' }]), acceptingInboxQuery());
  outside.events.on('request:start', ({ request }) => {
    asked.push(request.url);
  });
  // Only the 2-minute timer is faked: requests, promises and waits run as they really do.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});
afterEach(() => {
  vi.useRealTimers();
  outside.resetHandlers();
  outside.events.removeAllListeners();
});
afterAll(() => {
  outside.close();
});

const jiraConnected: Settings = { jira: { site: jiraSite, email: jiraEmail } };
const twoMinutes = 2 * 60_000;

function setup(initial: Settings = {}) {
  const events = createEventBus();
  const settings = createMemorySettingsStore(initial);
  const tokens = createTokenStore({ keychain: createMemoryKeychain({ jira: goodToken, github: githubToken }), events });
  const jira = createJiraClient();
  const github = createGitHubClient();
  const cache = openInboxCache(':memory:');
  const inbox = createInboxService({
    cache,
    settings,
    connections: {
      jira: createJiraConnection({ settings, tokens, jira, events, envToken: false }),
      github: createGitHubConnection({
        settings,
        tokens,
        github,
        gh: createGhCli({ searchPath: '' }),
        events,
        envToken: false,
      }),
    },
    jira,
    github,
    sessions: createMemorySessionStore(),
    preferences: createPreferencesService({ settings, events }),
    events,
  });
  const schedule = startInboxSchedule({ inbox, settings, events });
  return { events, settings, cache, schedule };
}

/** Lets a sync that started finish, then gives what reached Jira and GitHub. */
async function settled(count: number): Promise<string[]> {
  await vi.waitFor(() => {
    expect(asked).toHaveLength(count);
  });
  return asked;
}

describe('inbox schedule', () => {
  it('AC-19: syncs once when DevHub starts', async () => {
    const { schedule } = setup(jiraConnected);

    expect(await settled(1)).toEqual([issueSearchUrl()]);
    schedule.stop();
  });

  it('AC-16: syncs every 2 minutes while a page is open, and not while none is', async () => {
    const { events, schedule } = setup(jiraConnected);
    await settled(1);

    await vi.advanceTimersByTimeAsync(twoMinutes);
    expect(asked).toHaveLength(1);

    const closePage = events.subscribe(() => undefined, { page: true });
    await vi.advanceTimersByTimeAsync(twoMinutes);
    await settled(2);

    closePage();
    await vi.advanceTimersByTimeAsync(twoMinutes);
    expect(asked).toHaveLength(2);
    schedule.stop();
  });

  it('syncs at once when a tool connects', async () => {
    const { events, settings, schedule } = setup(jiraConnected);
    await settled(1);

    await settings.update((current) => ({ ...current, github: { method: 'token' } }));
    events.publish({ type: 'status.changed' });

    expect((await settled(3)).slice(1).sort()).toEqual([graphqlUrl, issueSearchUrl()].sort());
    schedule.stop();
  });

  it('a status change with the same connections asks nobody', async () => {
    const { events, schedule } = setup(jiraConnected);
    await settled(1);

    events.publish({ type: 'status.changed' });
    await vi.advanceTimersByTimeAsync(10);

    expect(asked).toHaveLength(1);
    schedule.stop();
  });

  it('AC-30: a disconnected tool’s rows leave the cache', async () => {
    const { events, settings, cache, schedule } = setup(jiraConnected);
    await settled(1);
    await vi.waitFor(() => {
      expect(cache.tool('jira')).not.toBeNull();
    });

    await settings.update(({ jira: _, ...rest }) => rest);
    events.publish({ type: 'status.changed' });

    await vi.waitFor(() => {
      expect(cache.tool('jira')).toBeNull();
    });
    schedule.stop();
  });

  it('stops: no more syncs, and status changes are no longer heard', async () => {
    const { events, settings, schedule } = setup(jiraConnected);
    await settled(1);
    events.subscribe(() => undefined, { page: true });

    schedule.stop();
    await settings.update((current) => ({ ...current, github: { method: 'token' } }));
    events.publish({ type: 'status.changed' });
    await vi.advanceTimersByTimeAsync(twoMinutes);

    expect(asked).toHaveLength(1);
  });
});
