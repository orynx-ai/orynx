import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  acceptingBot,
  discordApi,
  discordChannels,
  discordHistory,
  discordMentions,
  discordMessage,
  discordPosts,
  discordServers,
  discordToken,
  discordUserId,
  messageContent,
  useFakeDiscord,
  type FakeDiscordMessage,
} from '../../test/fake-discord.ts';
import { createDiscordClient } from './client.ts';

const discord = useFakeDiscord();
const now = Date.parse('2026-11-02T10:00:00.000Z');
const client = createDiscordClient({ now: () => now });

describe('Discord client (spec 016)', () => {
  it('AC-6: names the bot, you as its owner, and its servers, sending the token only as Authorization', async () => {
    const sent: string[] = [];
    discord.events.on('request:start', ({ request }) => {
      sent.push(request.url);
    });

    expect(await client.check(discordToken)).toEqual({
      ok: true,
      bot: 'Orynx',
      userId: discordUserId,
      servers: [
        { id: '1100000000000000001', name: 'Acme' },
        { id: '1100000000000000005', name: 'Acme Labs' },
      ],
    });
    expect(sent.join(' ')).not.toContain(discordToken);
  });

  it('AC-6: takes Message Content whether it is on or on until the bot is verified', async () => {
    discord.use(...acceptingBot({ flags: messageContent }));
    expect(await client.check(discordToken)).toMatchObject({ ok: true });
  });

  it('AC-7: Message Content off is its own problem', async () => {
    discord.use(...acceptingBot({ flags: 0 }));
    expect(await client.check(discordToken)).toEqual({ ok: false, problem: { kind: 'intent_off' } });
  });

  it('AC-8: a team’s application needs your user ID, which then names whose mentions count', async () => {
    discord.use(...acceptingBot({ team: true }));
    expect(await client.check(discordToken)).toEqual({ ok: false, problem: { kind: 'user_id_needed' } });
    expect(await client.check(discordToken, '80351110224678913')).toMatchObject({
      ok: true,
      userId: '80351110224678913',
    });
  });

  it('a wrong token is refused', async () => {
    expect(await client.check('fake-wrong-token')).toEqual({ ok: false, problem: { kind: 'rejected' } });
  });

  it('a 429 is the rate limit, with when to try again; no network is unreachable; a 500 keeps its status', async () => {
    discord.use(
      http.get(`${discordApi}/users/@me`, () =>
        HttpResponse.json({ message: 'You are being rate limited.', retry_after: 2.5, global: false }, { status: 429 }),
      ),
    );
    expect(await client.check(discordToken)).toEqual({
      ok: false,
      problem: { kind: 'rate_limited', resetAt: now + 2500 },
    });

    discord.use(http.get(`${discordApi}/users/@me`, () => HttpResponse.error()));
    expect(await client.check(discordToken)).toMatchObject({ ok: false, problem: { kind: 'unreachable' } });

    discord.use(http.get(`${discordApi}/users/@me`, () => HttpResponse.json({}, { status: 500 })));
    expect(await client.check(discordToken)).toEqual({ ok: false, problem: { kind: 'discord_error', status: 500 } });
  });
});

describe('Discord mentions waiting on you (spec 016, B)', () => {
  const since = Date.parse('2026-10-26T10:00:00.000Z');
  const acme = '1100000000000000001';
  const labs = '1100000000000000005';
  const webPlatform = '1100000000000000002';
  const neha = { id: '1100000000000000050', username: 'neha', global_name: 'Neha K.' };
  const mention = (id: string, extra: Partial<FakeDiscordMessage> = {}): FakeDiscordMessage => ({
    id,
    channel_id: webPlatform,
    author: neha,
    content: `<@${discordUserId}> can you confirm the archive API returns 207?`,
    mentions: [{ id: discordUserId, username: 'rakesh', global_name: 'Rakesh D.' }],
    timestamp: '2026-11-02T10:00:00.000Z',
    ...extra,
  });

  it('AC-16, AC-12: a mention nobody answered is a row with its server; one you answered after is not', async () => {
    const searched: string[] = [];
    discord.use(
      discordMentions(
        { [acme]: [mention('1434477000000000001'), mention('1434477000000000003')], [labs]: [] },
        searched,
      ),
      discordChannels({ [webPlatform]: 'web-platform' }),
      discordHistory({
        [webPlatform]: [
          mention('1434477000000000001'),
          mention('1434477000000000003'),
          {
            id: '1434477000000000004',
            channel_id: webPlatform,
            author: { id: discordUserId, username: 'rakesh' },
            content: 'yes',
            timestamp: '2026-11-02T10:05:00.000Z',
          },
        ],
      }),
    );

    expect(await client.waiting(discordToken, { userId: discordUserId }, { since })).toEqual({
      ok: true,
      indexing: false,
      records: [],
    });

    discord.use(discordHistory({ [webPlatform]: [mention('1434477000000000001'), mention('1434477000000000003')] }));
    const answer = await client.waiting(discordToken, { userId: discordUserId }, { since });
    expect(answer).toEqual({
      ok: true,
      indexing: false,
      records: [
        {
          id: `${webPlatform}/1434477000000000001`,
          title: '@Rakesh D. can you confirm the archive API returns 207?',
          from: 'Neha K.',
          channel: 'web-platform',
          server: 'Acme',
          waitingSince: '2026-11-02T10:00:00.000Z',
          url: `https://discord.com/channels/${acme}/${webPlatform}/1434477000000000001`,
        },
        expect.objectContaining({ id: `${webPlatform}/1434477000000000003` }),
      ],
    });
    expect(searched[0]).toContain(`mentions=${discordUserId}`);
    expect(searched[0]).toContain('sort_order=asc');
  });

  it('AC-17: a server still indexing says so, and the others still give their rows', async () => {
    discord.use(
      discordMentions({ [acme]: 'indexing', [labs]: [mention('1434477000000000001')] }),
      discordChannels({ [webPlatform]: 'web-platform' }),
      discordHistory({ [webPlatform]: [mention('1434477000000000001')] }),
    );

    const answer = await client.waiting(discordToken, { userId: discordUserId }, { since });
    expect(answer.ok && answer.indexing).toBe(true);
    expect(answer.ok && answer.records.map((record) => record.server)).toEqual(['Acme Labs']);
  });

  it('a server the bot can’t search is skipped; a bot’s mention never counts', async () => {
    discord.use(
      discordMentions({
        [acme]: 'forbidden',
        [labs]: [
          mention('1434477000000000001', { author: { id: '1100000000000000051', username: 'deploys', bot: true } }),
        ],
      }),
    );

    expect(await client.waiting(discordToken, { userId: discordUserId }, { since })).toEqual({
      ok: true,
      indexing: false,
      records: [],
    });
  });

  it('reads at most `most` channels after mentions a sync, oldest mentions first', async () => {
    const read: string[] = [];
    const mentions = ['1434477000000000001', '1434477000000000002', '1434477000000000003'].map((id) =>
      mention(id, { channel_id: `11000000000000001${id.slice(-2)}` }),
    );
    discord.use(
      discordMentions({ [acme]: mentions }),
      discordChannels(Object.fromEntries(mentions.map((each) => [each.channel_id, 'web-platform']))),
      discordHistory(Object.fromEntries(mentions.map((each) => [each.channel_id, [each]])), read),
    );

    const answer = await client.waiting(discordToken, { userId: discordUserId }, { since, most: 2 });
    expect(read).toEqual(['1100000000000000101', '1100000000000000102']);
    expect(answer.ok && answer.records).toHaveLength(2);
  });
});

describe('a Discord thread as Claude’s context (spec 016, C)', () => {
  const acme = '1100000000000000001';
  const channel = '1100000000000000002';
  const neha = { id: '1100000000000000050', username: 'neha', global_name: 'Neha K.' };
  const arjun = { id: '1100000000000000051', username: 'arjun', global_name: 'Arjun M.' };
  const root: FakeDiscordMessage = {
    id: '1434477000000000001',
    channel_id: channel,
    author: neha,
    content: 'Search returns archived sites for <@1100000000000000051>',
    mentions: [arjun],
    timestamp: '2026-11-02T10:00:00.000Z',
  };
  const reply: FakeDiscordMessage = {
    id: '1434477000000000003',
    channel_id: channel,
    author: arjun,
    content: 'Seeing it too',
    timestamp: '2026-11-02T10:01:00.000Z',
    attachments: [{ filename: 'trace.log' }],
    message_reference: { message_id: root.id },
  };
  const elsewhere: FakeDiscordMessage = {
    id: '1434477000000000002',
    channel_id: channel,
    author: arjun,
    content: 'Lunch?',
    timestamp: '2026-11-02T10:00:30.000Z',
  };
  const target = { guild: acme, channel, message: root.id };

  it('AC-30: a message outside a thread brings itself and the messages that Reply to it', async () => {
    discord.use(
      discordServers({ [acme]: 'Acme' }),
      discordChannels({ [channel]: 'web-platform' }),
      discordMessage({ [channel]: [root, elsewhere, reply] }),
      discordHistory({ [channel]: [root, elsewhere, reply] }),
    );

    expect(await client.thread(discordToken, target)).toEqual({
      ok: true,
      thread: {
        label: { from: 'Neha K.', channel: 'web-platform', server: 'Acme' },
        messages: [
          {
            from: 'Neha K.',
            at: '2026-11-02T10:00:00.000Z',
            text: 'Search returns archived sites for @Arjun M.',
            files: [],
          },
          { from: 'Arjun M.', at: '2026-11-02T10:01:00.000Z', text: 'Seeing it too', files: ['trace.log'] },
        ],
      },
    });
  });

  it('AC-30: a thread channel brings all its messages', async () => {
    discord.use(
      discordServers({ [acme]: 'Acme' }),
      discordChannels({ [channel]: 'thread:archive bug' }),
      discordMessage({ [channel]: [root, elsewhere] }),
      discordHistory({ [channel]: [root, elsewhere] }),
    );

    const answer = await client.thread(discordToken, target);
    expect(answer.ok && answer.thread.label.channel).toBe('archive bug');
    expect(answer.ok && answer.thread.messages.map((message) => message.text)).toEqual([
      'Search returns archived sites for @Arjun M.',
      'Lunch?',
    ]);
  });

  it('AC-32: a deleted message, or one the bot can’t read, is not found', async () => {
    discord.use(discordServers({ [acme]: 'Acme' }), discordChannels({ [channel]: 'web-platform' }), discordMessage({}));
    expect(await client.thread(discordToken, target)).toEqual({ ok: false, problem: { kind: 'not_found' } });
  });
});

describe('a reply in a Discord thread (spec 016, E)', () => {
  const target = { guild: '1100000000000000001', channel: '1100000000000000002', message: '1434477000000000001' };

  it('AC-41: posts as the bot, as a Reply to the message, pinging nobody, and answers its link', async () => {
    const posted: { channel: string; body: unknown }[] = [];
    discord.use(discordPosts(posted));

    expect(await client.postReply(discordToken, target, 'A fix is up')).toEqual({
      ok: true,
      url: 'https://discord.com/channels/1100000000000000001/1100000000000000002/1434480000000000001',
    });
    expect(posted).toEqual([
      {
        channel: '1100000000000000002',
        body: {
          content: 'A fix is up',
          message_reference: { message_id: '1434477000000000001', fail_if_not_exists: false },
          allowed_mentions: { parse: [] },
        },
      },
    ]);
  });

  it('AC-42: a refused post answers in Discord’s own words', async () => {
    discord.use(discordPosts([], true));
    expect(await client.postReply(discordToken, target, 'hi')).toEqual({ ok: false, reason: 'Missing Permissions' });
  });
});
