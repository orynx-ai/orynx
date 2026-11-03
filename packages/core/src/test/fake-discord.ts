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

/** A message as Discord's API gives it. */
export interface FakeDiscordMessage {
  id: string;
  channel_id: string;
  author: { id: string; username: string; global_name?: string | null; bot?: boolean };
  content?: string;
  mentions?: { id: string; username: string; global_name?: string | null }[];
  timestamp: string;
  attachments?: { filename: string }[];
  message_reference?: { message_id: string };
}

/**
 * Each server's message search for mentions: its matches, oldest first, or `indexing` (Discord's 202 while it builds
 * its index), or `forbidden` (the bot can't read it). `asked` collects each search's query.
 */
export function discordMentions(
  byServer: Record<string, readonly FakeDiscordMessage[] | 'indexing' | 'forbidden'>,
  asked: string[] = [],
) {
  return http.get(`${discordApi}/guilds/:guild/messages/search`, ({ params, request }) => {
    const guild = String(params['guild']);
    asked.push(`${guild}?${new URL(request.url).searchParams.toString()}`);
    const found = byServer[guild] ?? [];
    if (found === 'indexing') {
      return HttpResponse.json(
        { message: 'Index not yet available. Try again later', code: 110000, retry_after: 2 },
        { status: 202 },
      );
    }
    if (found === 'forbidden') return HttpResponse.json({ message: 'Missing Access', code: 50001 }, { status: 403 });
    return HttpResponse.json({
      total_results: found.length,
      messages: found.map((message) => [{ ...message, hit: true }]),
    });
  });
}

/** Channels by id, with their names; a name starting `thread:` is a thread channel (type 11). */
export function discordChannels(channels: Record<string, string>) {
  return http.get(`${discordApi}/channels/:channel`, ({ params }) => {
    const name = channels[String(params['channel'])];
    if (name === undefined) return HttpResponse.json({ message: 'Unknown Channel', code: 10003 }, { status: 404 });
    const thread = name.startsWith('thread:');
    return HttpResponse.json({ id: params['channel'], name: thread ? name.slice(7) : name, type: thread ? 11 : 0 });
  });
}

/** Servers by id, with their names, as `GET /guilds/:id` gives them. */
export function discordServers(servers: Record<string, string>) {
  return http.get(`${discordApi}/guilds/:guild`, ({ params }) => {
    const name = servers[String(params['guild'])];
    return name === undefined
      ? HttpResponse.json({ message: 'Unknown Guild', code: 10004 }, { status: 404 })
      : HttpResponse.json({ id: params['guild'], name });
  });
}

/** Each channel's messages, oldest first; a read gives those after `after`, newest first, as Discord does. */
export function discordHistory(byChannel: Record<string, readonly FakeDiscordMessage[]>, asked: string[] = []) {
  return http.get(`${discordApi}/channels/:channel/messages`, ({ params, request }) => {
    const channel = String(params['channel']);
    const after = BigInt(new URL(request.url).searchParams.get('after') ?? '0');
    asked.push(channel);
    const messages = (byChannel[channel] ?? []).filter((message) => BigInt(message.id) > after).reverse();
    return HttpResponse.json(messages);
  });
}

/** One message by its id, from the same channels' messages. */
export function discordMessage(byChannel: Record<string, readonly FakeDiscordMessage[]>) {
  return http.get(`${discordApi}/channels/:channel/messages/:message`, ({ params }) => {
    const found = byChannel[String(params['channel'])]?.find((message) => message.id === params['message']);
    return found === undefined
      ? HttpResponse.json({ message: 'Unknown Message', code: 10008 }, { status: 404 })
      : HttpResponse.json(found);
  });
}

/** Posting a message in a channel, keeping what was posted; `refuse` makes Discord answer 403 Missing Permissions. */
export function discordPosts(posted: { channel: string; body: unknown }[] = [], refuse = false) {
  return http.post(`${discordApi}/channels/:channel/messages`, async ({ params, request }) => {
    if (refuse) return HttpResponse.json({ message: 'Missing Permissions', code: 50013 }, { status: 403 });
    posted.push({ channel: String(params['channel']), body: await request.json() });
    return HttpResponse.json({ id: '1434480000000000001', channel_id: params['channel'] });
  });
}

/**
 * MSW standing in for Discord, an outside service, for the test file that calls this. It answers for the bot and
 * fails any other request, so no test can reach the real internet.
 */
export function useFakeDiscord() {
  const server = setupServer(...acceptingBot(), discordMentions({}), discordChannels({}), discordHistory({}));
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
