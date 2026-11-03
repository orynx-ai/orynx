import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ComposerChip } from '@devhub/contracts';
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
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createTokenStore } from '../secrets/token-store.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import {
  discordChannels,
  discordHistory,
  discordMessage,
  discordServers,
  discordToken,
  discordUserId,
} from '../test/fake-discord.ts';
import { knownUsers, slackApi, slackChannels, slackThreads, slackToken, slackUserId } from '../test/fake-slack.ts';
import { createContextReader } from './context-reader.ts';

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

const connected: Settings = {
  slack: { workspace: 'Acme', url: 'https://acme.slack.com/', userId: slackUserId, name: 'Rakesh D.' },
  discord: { bot: 'Orynx', userId: discordUserId },
};
const slackChip: ComposerChip = { kind: 'slack_thread', channel: 'C024BE91L', ts: '1793613600.000100' };
const discordChip: ComposerChip = {
  kind: 'discord_thread',
  guild: '1100000000000000001',
  channel: '1100000000000000002',
  message: '1434477000000000001',
};

function setUp(initial: Settings = connected) {
  const events = createEventBus();
  const settings = createMemorySettingsStore(initial);
  const tokens = createTokenStore({
    keychain: createMemoryKeychain({ slack: slackToken, discord: discordToken }),
    events,
  });
  const jira = createJiraClient({ timeoutMs: 300 });
  const github = createGitHubClient({ timeoutMs: 300 });
  const slack = createSlackClient({ timeoutMs: 300 });
  const discord = createDiscordClient({ timeoutMs: 300 });
  return createContextReader({
    home: '/Users/dev',
    jira,
    jiraConnection: createJiraConnection({ settings, tokens, jira, events, envToken: false }),
    github,
    githubConnection: createGitHubConnection({
      settings,
      tokens,
      github,
      gh: createGhCli({ searchPath: '' }),
      events,
      envToken: false,
    }),
    slack,
    slackConnection: createSlackConnection({ settings, tokens, slack, events, envToken: false }),
    discord,
    discordConnection: createDiscordConnection({ settings, tokens, discord, events, envToken: false }),
  });
}

describe('threads as context (spec 016, C)', () => {
  it('AC-30: reads a Slack and a Discord thread into the brief, in the order added', async () => {
    const root = {
      id: '1434477000000000001',
      channel_id: '1100000000000000002',
      author: { id: '1100000000000000050', username: 'arjun', global_name: 'Arjun M.' },
      content: 'Mind a look?',
      timestamp: '2026-11-02T09:00:00.000Z',
    };
    outside.use(
      knownUsers({ U0NEHA0001: { display: 'Neha K.' } }),
      slackChannels({ C024BE91L: 'web-platform' }),
      slackThreads({ 'C024BE91L/1793613600.000100': [{ ts: '1793613600.000100', user: 'U0NEHA0001', text: 'Bug!' }] }),
      discordServers({ '1100000000000000001': 'Acme' }),
      discordChannels({ '1100000000000000002': 'web-platform' }),
      discordMessage({ '1100000000000000002': [root] }),
      discordHistory({ '1100000000000000002': [root] }),
    );

    const read = await setUp().read([slackChip, discordChip]);

    expect(read.ok && read.chips.map((chip) => chip.kind === 'thread' && [chip.tool, chip.label])).toEqual([
      ['slack', { from: 'Neha K.', channel: 'web-platform', server: null }],
      ['discord', { from: 'Arjun M.', channel: 'web-platform', server: 'Acme' }],
    ]);
  });

  it('AC-27, AC-32: a thread whose tool isn’t connected, or that’s gone, fails by its place', async () => {
    outside.use(
      knownUsers(),
      slackChannels({ C024BE91L: 'web-platform' }),
      slackThreads({ 'C024BE91L/1793613600.000100': [{ ts: '1793613600.000100', user: slackUserId, text: 'hi' }] }),
    );
    expect(await setUp({ slack: connected.slack }).read([slackChip, discordChip])).toEqual({
      ok: false,
      chip: 1,
      problem: 'not_connected',
    });
    outside.use(slackThreads({}));
    expect(await setUp().read([slackChip])).toEqual({ ok: false, chip: 0, problem: 'not_found' });
  });

  it('a Slack that doesn’t answer is unreachable', async () => {
    outside.use(http.post(`${slackApi}/conversations.info`, () => HttpResponse.error()));
    expect(await setUp().read([slackChip])).toEqual({ ok: false, chip: 0, problem: 'unreachable' });
  });
});
