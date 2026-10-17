import { z } from 'zod';

/**
 * The only file in DevHub that talks to GitHub (integration-adapter skill). The token goes into the
 * Authorization header and nowhere else: a failure comes back as a {@link GitHubProblem}, never as
 * octokit's error, so nothing that held the request can travel on into a log or a response.
 */

export type GitHubProblem =
  /** GitHub refused the token. */
  | { kind: 'rejected' }
  /** The account's rate limit is used up. `resetAt` is when it resets, in milliseconds, if GitHub said. */
  | { kind: 'rate_limited'; resetAt: number | null }
  /** The request never got GitHub's answer. `code` is safe to log, such as ENOTFOUND or a certificate error. */
  | { kind: 'unreachable'; code: string | undefined }
  | { kind: 'timeout' }
  /** GitHub answered with an error that says nothing about the token. */
  | { kind: 'github_error'; status: number };

export type GitHubCheck =
  /** `scopes` is what `X-OAuth-Scopes` lists, or null when GitHub sends no such header (a fine-grained token). */
  { ok: true; login: string; scopes: string[] | null } | { ok: false; problem: GitHubProblem };

export interface GitHubClient {
  readonly timeoutMs: number;
  /** Asks GitHub who this token belongs to (`GET /user`). */
  check(token: string): Promise<GitHubCheck>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface GitHubClientOptions {
  /** How long to wait for GitHub; 10 seconds by default (spec 004). */
  timeoutMs?: number;
  /** The network. Only a test that needs a failure MSW can't make passes one. */
  fetch?: FetchLike;
  /** The clock, in milliseconds, for a `Retry-After` in seconds. */
  now?: () => number;
}

// A GitHub login: letters, digits and hyphens, with an underscore in managed (EMU) accounts.
const UserSchema = z.object({ login: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

// Codes such as "ENOTFOUND" or "UNABLE_TO_GET_ISSUER_CERT_LOCALLY". Anything else is dropped.
const errorCode = /^[A-Z][A-Z0-9_]{0,63}$/;

// octokit writes failures and deprecations to the console by default; DevHub keeps its terminal quiet.
const ignore = (): undefined => undefined;
const quiet = { debug: ignore, info: ignore, warn: ignore, error: ignore };

/** What octokit's RequestError carries; read field by field, never passed on. */
interface Failure {
  status?: unknown;
  response?: { headers?: Record<string, string | undefined> };
  cause?: unknown;
}

export function createGitHubClient({
  timeoutMs = 10_000,
  fetch,
  now = Date.now,
}: GitHubClientOptions = {}): GitHubClient {
  return {
    timeoutMs,
    async check(token) {
      // Loaded on the first call, so starting DevHub never pays for it (about 0.2 s).
      const { Octokit } = await import('@octokit/rest');
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const octokit = new Octokit({
          auth: token,
          userAgent: 'DevHub',
          log: quiet,
          request: { signal, ...(fetch ? { fetch } : {}) },
        });
        const answer = await octokit.request('GET /user');
        const user = UserSchema.safeParse(answer.data);
        // Something answered, but not as GitHub does: a network's sign-in page, say.
        if (!user.success) return { ok: false, problem: { kind: 'unreachable', code: undefined } };
        const header = answer.headers['x-oauth-scopes'];
        const scopes = typeof header === 'string' ? header.split(',').flatMap((scope) => scope.trim() || []) : null;
        return { ok: true, login: user.data.login, scopes };
      } catch (error) {
        return { ok: false, problem: problemOf(error as Failure, signal.aborted, now) };
      }
    },
  };
}

function problemOf(error: Failure, timedOut: boolean, now: () => number): GitHubProblem {
  if (timedOut) return { kind: 'timeout' };
  const headers = error.response?.headers;
  // No answer at all: octokit reports a failed fetch as status 500 without a response.
  if (headers === undefined || typeof error.status !== 'number') {
    return { kind: 'unreachable', code: networkCode(error.cause) };
  }
  const status = error.status;
  if (status === 401) return { kind: 'rejected' };
  if (status === 429 || (status === 403 && (headers['x-ratelimit-remaining'] === '0' || 'retry-after' in headers))) {
    return { kind: 'rate_limited', resetAt: resetTime(headers, now) };
  }
  if (status === 403) return { kind: 'rejected' };
  return { kind: 'github_error', status };
}

function resetTime(headers: Record<string, string | undefined>, now: () => number): number | null {
  const reset = Number(headers['x-ratelimit-reset']);
  if (headers['x-ratelimit-remaining'] === '0' && Number.isFinite(reset) && reset > 0) return reset * 1000;
  const wait = Number(headers['retry-after']);
  if (headers['retry-after'] !== undefined && Number.isFinite(wait) && wait >= 0) return now() + wait * 1000;
  return null;
}

/** The first error code in fetch's chain of causes, kept only when it looks like a code. */
function networkCode(cause: unknown): string | undefined {
  for (let error = cause, depth = 0; error instanceof Error && depth < 4; error = error.cause, depth += 1) {
    const code = 'code' in error ? error.code : undefined;
    if (typeof code === 'string') return errorCode.test(code) ? code : undefined;
  }
  return undefined;
}
