import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createEventBus } from '../events/event-bus.ts';
import { createDiscordClient } from '../integrations/discord/client.ts';
import { createDiscordConnection } from '../integrations/discord/connection.ts';
import { createGitHubClient } from '../integrations/github/client.ts';
import { createGitHubConnection } from '../integrations/github/connection.ts';
import { createGhCli } from '../integrations/github/gh.ts';
import { createJiraClient } from '../integrations/jira/client.ts';
import { createJiraConnection } from '../integrations/jira/connection.ts';
import { createSlackClient } from '../integrations/slack/client.ts';
import { createSlackConnection } from '../integrations/slack/connection.ts';
import { createPreferencesService } from '../preferences/preferences-service.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createTokenStore } from '../secrets/token-store.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import {
  acceptingBot,
  discordChannels,
  discordHistory,
  discordMentions,
  discordToken,
  discordUserId,
} from '../test/fake-discord.ts';
import {
  acceptingAuthTest,
  knownUsers,
  slackApi,
  slackDms,
  slackMentions,
  slackThreads,
  slackToken,
  slackUserId,
} from '../test/fake-slack.ts';
import { openInboxCache } from './inbox-cache.ts';
import { createInboxService } from './inbox-service.ts';

/** Slack and Discord, the outside services, faked for this file only. */
const outside = setupServer();
beforeAll(() => {
  outside.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  outside.resetHandlers();
});
afterAll(() => {
  outside.close();
});

const now = Date.parse('2026-11-02T13:00:00.000Z');
const connected: Settings = {
  slack: { workspace: 'Acme', url: 'https://acme.slack.com/', userId: slackUserId, name: 'Rakesh D.' },
  discord: { bot: 'Orynx', userId: discordUserId },
};
const acme = '1100000000000000001';
const webPlatform = '1100000000000000002';
const slackMention = {
  ts: '1793613600.000100',
  user: 'U0NEHA0001',
  text: `<@${slackUserId}> can you confirm the archive API returns 207?`,
  channel: { id: 'C024BE91L', name: 'web-platform' },
};
const discordMention = {
  id: '1434477000000000001',
  channel_id: webPlatform,
  author: { id: '1100000000000000050', username: 'arjun', global_name: 'Arjun M.' },
  content: 'Mind a look before standup?',
  mentions: [{ id: discordUserId, username: 'rakesh' }],
  timestamp: '2026-11-02T09:00:00.000Z',
};

/** Both tools answering with one mention each, nobody answered. */
function bothAnswering() {
  outside.use(
    acceptingAuthTest(),
    knownUsers({ U0NEHA0001: { display: 'Neha K.' } }),
    slackMentions([slackMention]),
    slackThreads({ 'C024BE91L/1793613600.000100': [slackMention] }),
    ...slackDms({}),
    ...acceptingBot({ servers: [{ id: acme, name: 'Acme' }] }),
    discordMentions({ [acme]: [discordMention] }),
    discordChannels({ [webPlatform]: 'web-platform' }),
    discordHistory({ [webPlatform]: [discordMention] }),
  );
}

function setup(initial: Settings = connected) {
  const events = createEventBus();
  const settings = createMemorySettingsStore(initial);
  const tokens = createTokenStore({
    keychain: createMemoryKeychain({ slack: slackToken, discord: discordToken }),
    events,
  });
  const cache = openInboxCache(':memory:');
  const synced: { tool: string; replyWaitMs: number }[] = [];
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
      slack: createSlackConnection({ settings, tokens, slack: createSlackClient(), events, envToken: false }),
      discord: createDiscordConnection({ settings, tokens, discord: createDiscordClient(), events, envToken: false }),
    },
    jira: createJiraClient({ timeoutMs: 300 }),
    github: createGitHubClient({ timeoutMs: 300 }),
    slack: createSlackClient({ timeoutMs: 300, now: () => now }),
    discord: createDiscordClient({ timeoutMs: 300, now: () => now }),
    sessions: createMemorySessionStore([]),
    preferences: createPreferencesService({ settings, events }),
    events,
    onSynced: (tool, _before, _after, chat) => synced.push({ tool, replyWaitMs: chat.replyWaitMs }),
    now: () => now,
  });
  return { inbox, cache, settings, synced };
}

describe('Slack and Discord in the inbox (spec 016)', () => {
  it('AC-10, AC-16: a sync brings both tools’ rows, past the 2 h wait, longest wait first', async () => {
    bothAnswering();
    const { inbox } = setup();

    await inbox.sync();

    const read = await inbox.read();
    expect(read.items.map((item) => [item.id, item.subject])).toEqual([
      [
        `discord:${webPlatform}/1434477000000000001`,
        { kind: 'message', from: 'Arjun M.', channel: 'web-platform', server: 'Acme' },
      ],
      [
        'slack:C024BE91L/1793613600.000100',
        { kind: 'message', from: 'Neha K.', channel: 'web-platform', server: null },
      ],
    ]);
    expect(read.tools.slack).toEqual({ state: 'synced', at: '2026-11-02T13:00:00.000Z' });
    expect(read.tools.discord).toEqual({ state: 'synced', at: '2026-11-02T13:00:00.000Z' });
  });

  it('AC-13, AC-18: changing the wait or a rule changes the list at once, asking nobody', async () => {
    bothAnswering();
    const { inbox, settings } = setup();
    await inbox.sync();

    await settings.update((current) => ({ ...current, inbox: { replyWaitMinutes: 240 } }));
    expect((await inbox.read()).items.map((item) => item.source)).toEqual(['discord']);

    await settings.update((current) => ({ ...current, inbox: { rules: { discord_waiting: false } } }));
    expect((await inbox.read()).items.map((item) => item.source)).toEqual(['slack']);
  });

  it('AC-17: Discord still indexing reads as syncing, and Slack’s rows show', async () => {
    bothAnswering();
    outside.use(discordMentions({ [acme]: 'indexing' }));
    const { inbox } = setup();

    await inbox.sync();

    const read = await inbox.read();
    expect(read.tools.discord).toEqual({ state: 'syncing' });
    expect(read.items.map((item) => item.source)).toEqual(['slack']);
  });

  it('AC-23: Slack failing keeps its last rows and leaves Discord’s alone', async () => {
    bothAnswering();
    const { inbox } = setup();
    await inbox.sync();

    outside.use(
      http.post(`${slackApi}/search.messages`, () => HttpResponse.json({ ok: false, error: 'invalid_auth' })),
    );
    await inbox.sync();

    const read = await inbox.read();
    expect(read.tools.slack).toEqual({
      state: 'failed',
      problem: { kind: 'rejected' },
      lastSyncedAt: '2026-11-02T13:00:00.000Z',
    });
    expect(read.items.map((item) => item.source).sort()).toEqual(['discord', 'slack']);
  });

  it('AC-24: the cache keeps only each row’s fields, never the message past its first line', async () => {
    bothAnswering();
    outside.use(
      slackMentions([{ ...slackMention, text: `${slackMention.text}\nThe whole trace: secret-ish details` }]),
    );
    const { inbox, cache } = setup();

    await inbox.sync();

    expect(JSON.stringify(cache.tool('slack'))).not.toContain('secret-ish details');
    expect(Object.keys(cache.tool('slack')?.records[0] ?? {}).sort()).toEqual([
      'channel',
      'from',
      'id',
      'title',
      'url',
      'waitingSince',
    ]);
  });

  it('AC-9: a tool that isn’t connected reads as such, and its rows go when it disconnects', async () => {
    bothAnswering();
    const { inbox, settings } = setup();
    await inbox.sync();

    await settings.update(({ slack: _, ...rest }) => rest);
    await inbox.sync();

    const read = await inbox.read();
    expect(read.tools.slack).toEqual({ state: 'not_connected' });
    expect(read.items.map((item) => item.source)).toEqual(['discord']);
  });

  it('AC-25: each answered sync hands notifications the wait Settings has, for Slack and Discord alike', async () => {
    bothAnswering();
    const { inbox, settings, synced } = setup();
    await settings.update((current) => ({ ...current, inbox: { replyWaitMinutes: 30 } }));

    await inbox.sync();

    expect(synced.sort((a, b) => a.tool.localeCompare(b.tool))).toEqual([
      { tool: 'discord', replyWaitMs: 30 * 60_000 },
      { tool: 'slack', replyWaitMs: 30 * 60_000 },
    ]);
  });
});
