import { z } from 'zod';
import { slackScopes } from '@devhub/contracts';
import { networkCode } from '../github/client.ts';
import { slackRecord, type SlackMessageRecord } from './map.ts';
import { firstUnanswered, mentionWaits, type SlackMessage } from './rules.ts';

/**
 * The only file in Orynx that talks to Slack (integration-adapter skill). The token goes into the Authorization
 * header and nowhere else: a failure comes back as a {@link SlackProblem}, never as the SDK's error, so nothing that
 * held the request can travel on into a log or a response.
 */

export type SlackProblem =
  /** Slack refused the token: wrong, revoked, or its account deactivated. */
  | { kind: 'rejected' }
  /** The token lacks scopes Orynx needs (spec 016, A), in the order Orynx asks for them. */
  | { kind: 'missing_scopes'; missing: string[] }
  /** Slack's rate limit; `resetAt` is when to try again, in milliseconds, if Slack said. */
  | { kind: 'rate_limited'; resetAt: number | null }
  /** The request never got Slack's answer. `code` is safe to log, such as ENOTFOUND. */
  | { kind: 'unreachable'; code: string | undefined }
  | { kind: 'timeout' }
  /** Slack answered with an error that says nothing about the token; `error` is Slack's own code. */
  | { kind: 'slack_error'; error: string };

/** Who the token belongs to, as the connection keeps it (spec 016, AC-2). */
export type SlackCheck =
  { ok: true; userId: string; name: string; workspace: string; url: string } | { ok: false; problem: SlackProblem };

/** The messages waiting on your reply, as inbox rows (spec 016, B). */
export type SlackWaiting = { ok: true; records: SlackMessageRecord[] } | { ok: false; problem: SlackProblem };

export interface SlackClient {
  /** Asks Slack who the token belongs to, and that it holds every scope Orynx needs. */
  check(token: string): Promise<SlackCheck>;
  /**
   * Your mentions and DMs since `since` that you haven't answered: one search for the mentions, then each one's
   * thread and each DM's history, at most `most` of those a sync (100 by default), half kept for DMs.
   */
  waiting(
    token: string,
    account: { userId: string; url: string },
    options: { since: number; most?: number },
  ): Promise<SlackWaiting>;
}

export interface SlackClientOptions {
  timeoutMs?: number;
  now?: () => number;
}

/** Slack's answer to any call, as far as Orynx reads it. */
interface Answer {
  ok?: boolean;
  response_metadata?: { scopes?: string[] };
  [field: string]: unknown;
}

/** A message as Slack's search and history give it; anything else in it is never read. */
const RawMessageSchema = z.object({
  ts: z.string().regex(/^\d+\.\d+$/),
  user: z.string().nullish(),
  bot_id: z.string().nullish(),
  text: z.string().nullish(),
  thread_ts: z.string().nullish(),
  files: z.array(z.object({ name: z.string().catch('a file') })).nullish(),
});
const MatchSchema = RawMessageSchema.extend({
  permalink: z.string().optional(),
  channel: z.object({
    id: z.string(),
    name: z.string().optional(),
    is_im: z.boolean().optional(),
    is_mpim: z.boolean().optional(),
  }),
});
type Match = z.infer<typeof MatchSchema>;

/** The messages in a list Slack gave, leaving out any Orynx can't read. */
function readList<T extends z.ZodType>(schema: T, list: unknown): z.infer<T>[] {
  return Array.isArray(list)
    ? list.flatMap((item) => {
        const read = schema.safeParse(item);
        return read.success ? [read.data] : [];
      })
    : [];
}

function asMessage(channel: string, raw: z.infer<typeof RawMessageSchema>, threadTs: string | null): SlackMessage {
  return {
    channel,
    ts: raw.ts,
    threadTs: raw.thread_ts ?? threadTs,
    user: raw.user ?? null,
    bot: raw.bot_id != null,
    text: raw.text ?? '',
    files: raw.files ?? [],
  };
}

/** A search match's thread, which Slack names only in its permalink. */
function threadOf(match: Match): string | null {
  return /[?&]thread_ts=(\d+\.\d+)/.exec(match.permalink ?? '')?.[1] ?? null;
}

const day = 86_400_000;

const refused = new Set(['invalid_auth', 'not_authed', 'token_revoked', 'token_expired', 'account_inactive']);
/** A Slack error code is lower-case words joined by underscores; anything else isn't kept. */
const slackCode = /^[a-z_]{1,64}$/;

export function createSlackClient({ timeoutMs = 10_000, now = Date.now }: SlackClientOptions = {}): SlackClient {
  async function call(token: string, method: string, args: Record<string, unknown> = {}): Promise<Answer> {
    const { WebClient } = await import('@slack/web-api');
    const web = new WebClient(token, {
      timeout: timeoutMs,
      // One try, and a 429 comes back at once instead of waiting: the inbox tries again at its next sync.
      retryConfig: { retries: 0 },
      rejectRateLimitedCalls: true,
      logger: silent,
    });
    return (await web.apiCall(method, args)) as Answer;
  }

  function failed(error: unknown): { ok: false; problem: SlackProblem } {
    return { ok: false, problem: problemOf(error, now) };
  }

  return {
    async waiting(token, { userId, url }, { since, most = 100 }) {
      try {
        const names = new Map<string, string>();
        async function nameOf(id: string): Promise<string> {
          if (!names.has(id))
            names.set(id, nameOfUser((await call(token, 'users.info', { user: id }))['user']) ?? 'someone');
          return names.get(id) ?? 'someone';
        }
        // Slack's after: leaves out the day it names, so the day before; the rules hold the exact 7 days.
        const after = new Date(since - day).toISOString().slice(0, 10);
        const found = await call(token, 'search.messages', {
          query: `<@${userId}> after:${after}`,
          sort: 'timestamp',
          sort_dir: 'asc',
          count: 100,
        });
        const matches = readList(MatchSchema, (found['messages'] as { matches?: unknown } | undefined)?.matches);
        const dms = readList(
          z.object({ id: z.string() }),
          (await call(token, 'users.conversations', { types: 'im,mpim', exclude_archived: true, limit: 200 }))[
            'channels'
          ],
        );

        // shortcut: half the checks are kept for DMs, read in the order Slack lists them; with more DMs than that,
        // some wait for a sync where fewer mentions need checking.
        const forDms = Math.min(dms.length, Math.floor(most / 2));
        const waitingMentions: SlackMessage[] = [];
        const candidates = matches
          .filter((match) => match.channel.is_im !== true && match.channel.is_mpim !== true)
          .map((match) => ({ match, message: asMessage(match.channel.id, match, threadOf(match)) }))
          .filter(({ message }) => mentionWaits(message, [], userId, since))
          .slice(0, most - forDms);
        const channelNames = new Map<string, string | null>();
        for (const { match, message } of candidates) {
          const thread = await call(token, 'conversations.replies', {
            channel: message.channel,
            ts: message.threadTs ?? message.ts,
            limit: 200,
          });
          const replies = readList(RawMessageSchema, thread['messages']).map((raw) =>
            asMessage(message.channel, raw, null),
          );
          if (mentionWaits(message, replies, userId, since)) {
            waitingMentions.push(message);
            channelNames.set(message.channel, match.channel.name ?? null);
          }
        }
        const waitingDms: SlackMessage[] = [];
        for (const dm of dms.slice(0, forDms + Math.max(0, most - forDms - candidates.length))) {
          const history = await call(token, 'conversations.history', {
            channel: dm.id,
            oldest: String(since / 1000),
            limit: 100,
          });
          const messages = readList(RawMessageSchema, history['messages']).map((raw) => asMessage(dm.id, raw, null));
          const first = firstUnanswered(messages, userId, since);
          if (first !== null) waitingDms.push(first);
        }

        // Every person a row names or mentions, so titles read as Slack shows them.
        for (const message of [...waitingMentions, ...waitingDms]) {
          for (const [, id] of message.text.matchAll(/<@([UW][A-Z0-9]+)/g)) if (id !== undefined) await nameOf(id);
        }
        const records: SlackMessageRecord[] = [];
        for (const message of waitingMentions) {
          const from = await nameOf(message.user ?? '');
          records.push(slackRecord(message, { from, channel: channelNames.get(message.channel) ?? null }, url, names));
        }
        for (const message of waitingDms) {
          records.push(slackRecord(message, { from: await nameOf(message.user ?? ''), channel: null }, url, names));
        }
        return { ok: true, records };
      } catch (error) {
        return failed(error);
      }
    },

    async check(token) {
      try {
        const who = await call(token, 'auth.test');
        const held = new Set(who.response_metadata?.scopes ?? []);
        const missing = slackScopes.filter((scope) => !held.has(scope));
        if (missing.length > 0) return { ok: false, problem: { kind: 'missing_scopes', missing } };
        const userId = String(who['user_id']);
        const person = await call(token, 'users.info', { user: userId });
        return {
          ok: true,
          userId,
          name: nameOfUser(person['user']) ?? String(who['user']),
          workspace: String(who['team']),
          url: String(who['url']),
        };
      } catch (error) {
        return failed(error);
      }
    },
  };
}

/** A person's name as Slack shows it: the display name, else the full name. */
function nameOfUser(user: unknown): string | null {
  if (typeof user !== 'object' || user === null) return null;
  const { profile, real_name: real } = user as { profile?: { display_name?: unknown }; real_name?: unknown };
  const display = profile?.display_name;
  if (typeof display === 'string' && display !== '') return display;
  return typeof real === 'string' && real !== '' ? real : null;
}

/** The SDK's error as one of Orynx's problems, keeping nothing of the request. */
function problemOf(error: unknown, now: () => number): SlackProblem {
  if (typeof error !== 'object' || error === null || !('code' in error))
    return { kind: 'unreachable', code: undefined };
  const failure = error as {
    code: string;
    data?: { error?: unknown };
    retryAfter?: unknown;
    statusCode?: unknown;
    original?: unknown;
  };
  switch (failure.code) {
    case 'slack_webapi_platform_error': {
      const code = typeof failure.data?.error === 'string' ? failure.data.error : '';
      if (refused.has(code)) return { kind: 'rejected' };
      return { kind: 'slack_error', error: slackCode.test(code) ? code : 'unknown' };
    }
    case 'slack_webapi_rate_limited_error':
      return {
        kind: 'rate_limited',
        resetAt: typeof failure.retryAfter === 'number' ? now() + failure.retryAfter * 1000 : null,
      };
    case 'slack_webapi_http_error':
      return failure.statusCode === 401
        ? { kind: 'rejected' }
        : { kind: 'slack_error', error: `http_${String(failure.statusCode)}` };
    default: {
      const code = networkCode(failure.original);
      const timedOut = failure.original instanceof Error && failure.original.name === 'TimeoutError';
      return timedOut || code === 'ETIMEDOUT' || code === 'ECONNABORTED'
        ? { kind: 'timeout' }
        : { kind: 'unreachable', code };
    }
  }
}

/** The SDK writes nothing anywhere: its errors come back as problems. */
const silent = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  setLevel: () => undefined,
  getLevel: () => 'error' as never,
  setName: () => undefined,
};
