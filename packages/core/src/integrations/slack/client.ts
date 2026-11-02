import { slackScopes } from '@devhub/contracts';
import { networkCode } from '../github/client.ts';

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

export interface SlackClient {
  /** Asks Slack who the token belongs to, and that it holds every scope Orynx needs. */
  check(token: string): Promise<SlackCheck>;
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
          name: nameOf(person['user']) ?? String(who['user']),
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
function nameOf(user: unknown): string | null {
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
