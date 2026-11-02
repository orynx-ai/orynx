import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  acceptingBot,
  discordApi,
  discordToken,
  discordUserId,
  messageContent,
  useFakeDiscord,
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
