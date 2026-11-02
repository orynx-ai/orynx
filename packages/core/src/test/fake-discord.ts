import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

/** A bot token Discord accepts in these tests. Not a real token's shape, so the secrets gate stays quiet. */
export const discordToken = 'fake-discord-token-for-tests';
export const discordApi = 'https://discord.com/api/v10';
/** You, the bot application's owner. */
export const discordUserId = '80351110224678912';
export const botId = '1100000000000000099';
/** Discord's Message Content intent, as the application's flags carry it: on, or on until the bot is verified. */
export const messageContent = 1 << 18;
export const messageContentLimited = 1 << 19;

export interface FakeDiscordApp {
  tokens?: readonly string[];
  /** The application's flags; Message Content (limited) is on by default. */
  flags?: number;
  /** A team owns the application, so it has no owner who is a person. */
  team?: boolean;
  servers?: readonly { id: string; name: string }[];
}

function sentToken(request: Request, tokens: readonly string[]): boolean {
  return tokens.some((token) => request.headers.get('authorization') === `Bot ${token}`);
}

const unauthorized = () => HttpResponse.json({ message: '401: Unauthorized', code: 0 }, { status: 401 });

/** The bot, its application and its servers, as Discord answers them for a good token, 401 for any other. */
export function acceptingBot({
  tokens = [discordToken],
  flags = messageContentLimited,
  team = false,
  servers = [
    { id: '1100000000000000001', name: 'Acme' },
    { id: '1100000000000000005', name: 'Acme Labs' },
  ],
}: FakeDiscordApp = {}) {
  return [
    http.get(`${discordApi}/users/@me`, ({ request }) =>
      sentToken(request, tokens) ? HttpResponse.json({ id: botId, username: 'Orynx', bot: true }) : unauthorized(),
    ),
    http.get(`${discordApi}/applications/@me`, ({ request }) =>
      sentToken(request, tokens)
        ? HttpResponse.json({
            id: '1100000000000000098',
            name: 'Orynx',
            flags,
            owner: team ? { id: '1100000000000000097', username: 'team1100000000000000097' } : { id: discordUserId },
            team: team ? { id: '1100000000000000097', name: 'Acme team' } : null,
          })
        : unauthorized(),
    ),
    http.get(`${discordApi}/users/@me/guilds`, ({ request }) =>
      sentToken(request, tokens) ? HttpResponse.json(servers) : unauthorized(),
    ),
  ];
}

/**
 * MSW standing in for Discord, an outside service, for the test file that calls this. It answers for the bot and
 * fails any other request, so no test can reach the real internet.
 */
export function useFakeDiscord() {
  const server = setupServer(...acceptingBot());
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
    server.events.removeAllListeners();
  });
  afterAll(() => {
    server.close();
  });
  return server;
}
