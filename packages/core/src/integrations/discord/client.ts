import { z } from 'zod';
import { networkCode } from '../github/client.ts';
import type { ChatThread, PostedReply } from '../slack/client.ts';
import { discordRecord, plainText, type DiscordMessageRecord } from './map.ts';
import { mentionWaits, snowflakeAt, type DiscordMessage } from './rules.ts';

/**
 * The only file in Orynx that talks to Discord (integration-adapter skill), over Node's own fetch against Discord's
 * REST API (spec 016, Q4). The bot's token goes into the Authorization header and nowhere else: a failure comes back
 * as a {@link DiscordProblem}, never as fetch's error.
 */

export type DiscordProblem =
  /** Discord refused the token. */
  | { kind: 'rejected' }
  /** The bot's Message Content intent is off, so Discord would send every message empty (AC-7). */
  | { kind: 'intent_off' }
  /** A team owns the bot's application, so Orynx can't tell whose mentions count without your user ID (AC-8). */
  | { kind: 'user_id_needed' }
  /** Discord's rate limit; `resetAt` is when to try again, in milliseconds, if Discord said. */
  | { kind: 'rate_limited'; resetAt: number | null }
  /** The request never got Discord's answer. `code` is safe to log, such as ENOTFOUND. */
  | { kind: 'unreachable'; code: string | undefined }
  | { kind: 'timeout' }
  /** Discord answered with an error that says nothing about the token. */
  | { kind: 'discord_error'; status: number };

export interface DiscordServer {
  id: string;
  name: string;
}

/** The bot, whose mentions it reads, and the servers it was added to (spec 016, AC-6). */
export type DiscordCheck =
  { ok: true; bot: string; userId: string; servers: DiscordServer[] } | { ok: false; problem: DiscordProblem };

/**
 * The mentions waiting on your reply, as inbox rows (spec 016, B). `indexing` is true when a server's search isn't
 * ready yet (AC-17): its mentions come at a later sync.
 */
export type DiscordWaiting =
  { ok: true; records: DiscordMessageRecord[]; indexing: boolean } | { ok: false; problem: DiscordProblem };

/** A thread Discord gave, or `not_found`: deleted, or somewhere the bot can't read. */
export type DiscordThreadAnswer =
  { ok: true; thread: ChatThread } | { ok: false; problem: DiscordProblem | { kind: 'not_found' } };

export interface DiscordClient {
  /** Asks Discord about the bot: its name, its owner (or `userId` for a team's), Message Content, and its servers. */
  check(token: string, userId?: string): Promise<DiscordCheck>;
  /**
   * Your mentions since `since` in the bot's servers that you haven't answered: a search a server, then each
   * mention's channel after it, at most `most` of those a sync (100 by default), the oldest mentions first.
   */
  waiting(
    token: string,
    account: { userId: string },
    options: { since: number; most?: number },
  ): Promise<DiscordWaiting>;
  /**
   * A message's thread for Claude's brief (spec 016, C): a thread channel's messages, or a message and the messages
   * that Reply to it among the next 100.
   */
  thread(token: string, chip: { guild: string; channel: string; message: string }): Promise<DiscordThreadAnswer>;
  /** Posts `text` as the bot, as a Reply to the message, pinging nobody (spec 016, E). */
  postReply(
    token: string,
    chip: { guild: string; channel: string; message: string },
    text: string,
  ): Promise<PostedReply>;
}

export interface DiscordClientOptions {
  timeoutMs?: number;
  now?: () => number;
}

export const discordApi = 'https://discord.com/api/v10';
/** The application's flags for Message Content: on, or on until the bot is verified. */
const messageContentFlags = (1 << 18) | (1 << 19);

const BotSchema = z.object({ username: z.string().min(1) });
const ApplicationSchema = z.object({
  flags: z.int().catch(0),
  owner: z.object({ id: z.string() }).nullish(),
  team: z.object({ id: z.string() }).nullish(),
});
const ServersSchema = z.array(z.object({ id: z.string(), name: z.string() }));
const PersonSchema = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullish(),
  bot: z.boolean().optional(),
});
const MessageSchema = z.object({
  id: z.string().regex(/^\d+$/),
  channel_id: z.string(),
  author: PersonSchema,
  content: z.string().catch(''),
  mentions: z.array(PersonSchema).catch([]),
  timestamp: z.string(),
  attachments: z.array(z.object({ filename: z.string() })).catch([]),
  message_reference: z.object({ message_id: z.string().optional() }).nullish(),
});
type RawMessage = z.infer<typeof MessageSchema>;
const MessagesSchema = z.array(z.unknown());
/** A search's matches: each one is the message among its neighbours that has `hit`. */
const SearchSchema = z.object({ messages: z.array(z.array(z.unknown())).catch([]) });

/** A person by the name Discord shows: their display name, else their username. */
function nameOf(person: z.infer<typeof PersonSchema>): string {
  return person.global_name ?? person.username;
}

function asMessage(raw: RawMessage): DiscordMessage {
  return {
    id: raw.id,
    channel: raw.channel_id,
    author: { id: raw.author.id, name: nameOf(raw.author), bot: raw.author.bot === true },
    content: raw.content,
    mentions: raw.mentions.map((person) => person.id),
    at: raw.timestamp,
    files: raw.attachments.map((file) => ({ name: file.filename })),
  };
}

/** The messages in a list Discord gave, leaving out any Orynx can't read. */
function readMessages(list: readonly unknown[]): RawMessage[] {
  return list.flatMap((item) => {
    const read = MessageSchema.safeParse(item);
    return read.success ? [read.data] : [];
  });
}

/** Discord's 202 while it builds a server's search index (spec 016, AC-17). */
const notIndexedYet = new Error('not indexed yet');

/** A failed call, carrying what Discord said; the message never holds the request. */
class DiscordFailure extends Error {
  readonly problem: DiscordProblem;

  constructor(problem: DiscordProblem) {
    super(problem.kind);
    this.problem = problem;
  }
}

export function createDiscordClient({ timeoutMs = 10_000, now = Date.now }: DiscordClientOptions = {}): DiscordClient {
  async function get<T extends z.ZodType>(token: string, path: string, schema: T): Promise<z.infer<T>> {
    let response: Response;
    try {
      response = await fetch(`${discordApi}${path}`, {
        headers: { authorization: `Bot ${token}`, 'user-agent': 'Orynx (https://orynx.local, 1)' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new DiscordFailure(timedOut ? { kind: 'timeout' } : { kind: 'unreachable', code: networkCode(error) });
    }
    if (response.status === 401) throw new DiscordFailure({ kind: 'rejected' });
    if (response.status === 202) throw notIndexedYet;
    if (response.status === 429) throw new DiscordFailure({ kind: 'rate_limited', resetAt: await resetOf(response) });
    if (!response.ok) throw new DiscordFailure({ kind: 'discord_error', status: response.status });
    const read = schema.safeParse(await response.json().catch(() => null));
    if (!read.success) throw new DiscordFailure({ kind: 'discord_error', status: response.status });
    return read.data;
  }

  /** When to try again: Discord's `retry_after` seconds, else its Retry-After header. */
  async function resetOf(response: Response): Promise<number | null> {
    const body: unknown = await response.json().catch(() => null);
    const seconds =
      typeof body === 'object' && body !== null && 'retry_after' in body && typeof body.retry_after === 'number'
        ? body.retry_after
        : Number(response.headers.get('retry-after'));
    return Number.isFinite(seconds) && seconds >= 0 ? now() + Math.round(seconds * 1000) : null;
  }

  /** A read the bot may not be allowed: null when Discord says it can't see that server or channel. */
  async function allowed<T>(read: () => Promise<T>): Promise<T | null> {
    try {
      return await read();
    } catch (error) {
      if (error instanceof DiscordFailure && error.problem.kind === 'discord_error' && error.problem.status === 403) {
        return null;
      }
      throw error;
    }
  }

  return {
    async waiting(token, { userId }, { since, most = 100 }) {
      try {
        const servers = await get(token, '/users/@me/guilds', ServersSchema);
        const names = new Map<string, string>();
        const found: { server: z.infer<typeof ServersSchema>[number]; message: DiscordMessage }[] = [];
        let indexing = false;
        for (const server of servers) {
          const query = new URLSearchParams({
            mentions: userId,
            min_id: snowflakeAt(since),
            sort_by: 'timestamp',
            sort_order: 'asc',
            limit: '25',
          });
          let search;
          try {
            search = await allowed(() =>
              get(token, `/guilds/${server.id}/messages/search?${query.toString()}`, SearchSchema),
            );
          } catch (error) {
            if (error !== notIndexedYet) throw error;
            indexing = true;
            continue;
          }
          for (const group of search?.messages ?? []) {
            const raw = group.find((each) => typeof each === 'object' && each !== null && 'hit' in each) ?? group[0];
            const [hit] = readMessages([raw]);
            if (hit === undefined) continue;
            for (const person of [hit.author, ...hit.mentions]) names.set(person.id, nameOf(person));
            found.push({ server, message: asMessage(hit) });
          }
        }

        const candidates = found
          .filter(({ message }) => mentionWaits(message, [], userId, since))
          .sort((a, b) => (BigInt(a.message.id) < BigInt(b.message.id) ? -1 : 1))
          .slice(0, most);
        const channelNames = new Map<string, string>();
        const records: DiscordMessageRecord[] = [];
        for (const { server, message } of candidates) {
          const after = await allowed(() =>
            get(token, `/channels/${message.channel}/messages?after=${message.id}&limit=100`, MessagesSchema),
          );
          if (after === null || !mentionWaits(message, readMessages(after).map(asMessage), userId, since)) continue;
          if (!channelNames.has(message.channel)) {
            const channel = await allowed(() =>
              get(token, `/channels/${message.channel}`, z.object({ name: z.string() })),
            );
            channelNames.set(message.channel, channel?.name ?? 'a channel');
          }
          records.push(
            discordRecord(
              message,
              { guild: server.id, server: server.name, channel: channelNames.get(message.channel) ?? 'a channel' },
              names,
            ),
          );
        }
        return { ok: true, records, indexing };
      } catch (error) {
        if (error instanceof DiscordFailure) return { ok: false, problem: error.problem };
        throw error;
      }
    },

    async thread(token, { guild, channel, message }) {
      try {
        const root = await allowed(() => get(token, `/channels/${channel}/messages/${message}`, z.unknown()));
        const [first] = readMessages([root]);
        const place = await allowed(() =>
          get(token, `/channels/${channel}`, z.object({ name: z.string().nullish(), type: z.int().catch(0) })),
        );
        const server = await allowed(() => get(token, `/guilds/${guild}`, z.object({ name: z.string() })));
        if (first === undefined || place === null) return { ok: false, problem: { kind: 'not_found' } };
        // Discord's thread channels are types 10 to 12: the thread is the channel. Anything else: Replies to it.
        const inThread = place.type >= 10 && place.type <= 12;
        const path = inThread
          ? `/channels/${channel}/messages?limit=100`
          : `/channels/${channel}/messages?after=${message}&limit=100`;
        const later = readMessages(await get(token, path, MessagesSchema));
        const replies = inThread ? later : later.filter((each) => each.message_reference?.message_id === message);
        const all = [first, ...replies.filter((each) => each.id !== first.id)].sort((a, b) =>
          BigInt(a.id) < BigInt(b.id) ? -1 : 1,
        );
        const names = new Map<string, string>();
        for (const each of all)
          for (const person of [each.author, ...each.mentions]) names.set(person.id, nameOf(person));
        return {
          ok: true,
          thread: {
            label: { from: nameOf(first.author), channel: place.name ?? 'a channel', server: server?.name ?? null },
            messages: all.map((each) => ({
              from: nameOf(each.author),
              at: new Date(each.timestamp).toISOString(),
              text: plainText(each.content, names),
              files: each.attachments.map((file) => file.filename),
            })),
          },
        };
      } catch (error) {
        if (error instanceof DiscordFailure) {
          const gone = error.problem.kind === 'discord_error' && error.problem.status === 404;
          return { ok: false, problem: gone ? { kind: 'not_found' } : error.problem };
        }
        throw error;
      }
    },

    async postReply(token, { guild, channel, message }, text) {
      let response: Response;
      try {
        response = await fetch(`${discordApi}/channels/${channel}/messages`, {
          method: 'POST',
          headers: {
            authorization: `Bot ${token}`,
            'content-type': 'application/json',
            'user-agent': 'Orynx (https://orynx.local, 1)',
          },
          body: JSON.stringify({
            content: text,
            message_reference: { message_id: message, fail_if_not_exists: false },
            allowed_mentions: { parse: [] },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === 'TimeoutError';
        return { ok: false, reason: timedOut ? "discord.com didn't answer in 10 seconds" : "can't reach discord.com" };
      }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const words = typeof body === 'object' && body !== null && 'message' in body ? String(body.message) : '';
        return {
          ok: false,
          reason: words === '' ? `Discord answered ${String(response.status)}` : words.slice(0, 500),
        };
      }
      const id = typeof body === 'object' && body !== null && 'id' in body ? String(body.id) : message;
      return { ok: true, url: `https://discord.com/channels/${guild}/${channel}/${id}` };
    },

    async check(token, userId) {
      try {
        const bot = await get(token, '/users/@me', BotSchema);
        const application = await get(token, '/applications/@me', ApplicationSchema);
        if ((application.flags & messageContentFlags) === 0) return { ok: false, problem: { kind: 'intent_off' } };
        const owner = application.team == null ? application.owner?.id : undefined;
        const you = userId ?? owner;
        if (you === undefined) return { ok: false, problem: { kind: 'user_id_needed' } };
        const servers = await get(token, '/users/@me/guilds', ServersSchema);
        return { ok: true, bot: bot.username, userId: you, servers };
      } catch (error) {
        if (error instanceof DiscordFailure) return { ok: false, problem: error.problem };
        throw error;
      }
    },
  };
}
