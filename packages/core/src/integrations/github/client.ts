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

/** One pull request as the inbox's GraphQL query gets it back (spec 007). */
export type GitHubPull = z.infer<typeof PullSchema>;

/** Who the token belongs to, the open pull requests that ask for their review, and their own. */
export type GitHubInbox =
  { ok: true; login: string; reviews: GitHubPull[]; mine: GitHubPull[] } | { ok: false; problem: GitHubProblem };

export interface GitHubClient {
  readonly timeoutMs: number;
  /** Asks GitHub who this token belongs to (`GET /user`). */
  check(token: string): Promise<GitHubCheck>;
  /**
   * One GraphQL query for the inbox: open, non-draft pull requests in unarchived repositories that ask for
   * your review by name, and your own with their latest commit's checks and their review threads. At most
   * 100 of each.
   */
  inbox(token: string): Promise<GitHubInbox>;
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

const ActorSchema = z.object({ login: z.string(), name: z.string().nullish() }).nullish();

const ContextSchema = z.discriminatedUnion('__typename', [
  z.object({ __typename: z.literal('CheckRun'), conclusion: z.string().nullish(), completedAt: z.string().nullish() }),
  z.object({ __typename: z.literal('StatusContext'), state: z.string(), createdAt: z.string() }),
]);

/** Lists GitHub can leave holes in, for an item the token may not see. */
function nodes<T extends z.ZodType>(item: T) {
  return z.object({ nodes: z.array(item.nullable()) });
}

const PullSchema = z.object({
  number: z.int().positive(),
  title: z.string(),
  url: z.string(),
  createdAt: z.string(),
  author: ActorSchema,
  repository: z.object({ name: z.string(), nameWithOwner: z.string() }),
  timelineItems: nodes(
    z.object({ createdAt: z.string(), requestedReviewer: z.object({ login: z.string().optional() }).nullish() }),
  ).optional(),
  commits: nodes(
    z.object({
      commit: z.object({
        committedDate: z.string().optional(),
        statusCheckRollup: z.object({ state: z.string(), contexts: nodes(ContextSchema) }).nullish(),
      }),
    }),
  ).optional(),
  reviewThreads: nodes(
    z.object({
      isResolved: z.boolean(),
      comments: nodes(z.object({ createdAt: z.string(), author: z.object({ login: z.string() }).nullish() })),
    }),
  ).optional(),
});

const InboxDataSchema = z.object({
  viewer: z.object({ login: z.string() }),
  reviews: z.object({ nodes: z.array(z.unknown()) }),
  mine: z.object({ nodes: z.array(z.unknown()) }),
});

/** What octokit's GraphqlResponseError holds: GitHub answered 200, with errors and maybe some data. */
const GraphqlFailureSchema = z.object({
  name: z.literal('GraphqlResponseError'),
  errors: z.array(z.object({ type: z.string().optional() })).optional(),
  data: z.unknown(),
  headers: z.record(z.string(), z.unknown()).optional(),
});

const searchFilters = 'is:pr is:open draft:false archived:false';

/**
 * GitHub prices a query by the most nodes it could return: each connection's limit times the limits
 * above it, over 100. Here: 100 + 100 for the two searches, 100 × 20 timeline events, 100 commits,
 * 100 × 100 check contexts and 100 × 20 review threads with their last comment (2,000), about 24 points.
 * At one sync every 2 minutes that's about 720 of the 5,000 points an hour, which gh and other tools on
 * the same account share. Raise a limit only with that sum in mind.
 */
const threadsPerPull = 20;

const inboxQuery = `
  query DevHubInbox($reviews: String!, $mine: String!) {
    viewer { login }
    reviews: search(type: ISSUE, query: $reviews, first: 100) {
      nodes {
        ... on PullRequest {
          number title url createdAt
          author { login ... on User { name } }
          repository { name nameWithOwner }
          timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 20) {
            nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer { ... on User { login } } } }
          }
        }
      }
    }
    mine: search(type: ISSUE, query: $mine, first: 100) {
      nodes {
        ... on PullRequest {
          number title url createdAt
          author { login ... on User { name } }
          repository { name nameWithOwner }
          commits(last: 1) {
            nodes {
              commit {
                committedDate
                statusCheckRollup {
                  state
                  contexts(first: 100) {
                    nodes {
                      __typename
                      ... on CheckRun { conclusion completedAt }
                      ... on StatusContext { state createdAt }
                    }
                  }
                }
              }
            }
          }
          reviewThreads(first: ${String(threadsPerPull)}) {
            nodes { isResolved comments(last: 1) { nodes { createdAt author { login } } } }
          }
        }
      }
    }
  }
`;

/** The pull requests in a search's answer; anything that isn't one (a hole, an issue) is left out. */
export function githubPulls(found: readonly unknown[]): GitHubPull[] {
  return found.flatMap((node) => {
    const pull = PullSchema.safeParse(node);
    return pull.success ? [pull.data] : [];
  });
}

function inboxOf(data: z.infer<typeof InboxDataSchema>): GitHubInbox {
  return {
    ok: true,
    login: data.viewer.login,
    reviews: githubPulls(data.reviews.nodes),
    mine: githubPulls(data.mine.nodes),
  };
}

// Codes such as "ENOTFOUND" or "UNABLE_TO_GET_ISSUER_CERT_LOCALLY". Anything else is dropped.
const errorCode = /^[A-Z][A-Z0-9_]{0,63}$/;

// octokit writes failures and deprecations to the console by default; DevHub keeps its terminal quiet.
const ignore = (): undefined => undefined;
const quiet = { debug: ignore, info: ignore, warn: ignore, error: ignore };

/**
 * The few fields of octokit's RequestError that say what went wrong. Anything else it holds, the request
 * and its headers included, is dropped here and never passed on.
 */
const FailureSchema = z.object({
  status: z.number().optional(),
  response: z.object({ headers: z.record(z.string(), z.unknown()) }).optional(),
  cause: z.unknown(),
});
type Failure = z.infer<typeof FailureSchema>;

export function createGitHubClient({
  timeoutMs = 10_000,
  fetch,
  now = Date.now,
}: GitHubClientOptions = {}): GitHubClient {
  async function octokitFor(token: string, signal: AbortSignal) {
    // Loaded on the first call, so starting DevHub never pays for it (about 0.2 s).
    const { Octokit } = await import('@octokit/rest');
    return new Octokit({
      auth: token,
      // Said here, not left to octokit's default: the token goes to api.github.com and nowhere else,
      // and a redirect is a failure rather than a trip somewhere else with the header.
      baseUrl: 'https://api.github.com',
      userAgent: 'DevHub',
      log: quiet,
      request: { signal, redirect: 'error', ...(fetch ? { fetch } : {}) },
    });
  }

  function failed(error: unknown, signal: AbortSignal): { ok: false; problem: GitHubProblem } {
    const failure = FailureSchema.safeParse(error);
    return {
      ok: false,
      problem: problemOf(failure.success ? failure.data : { cause: undefined }, signal.aborted, now),
    };
  }

  return {
    timeoutMs,
    async check(token) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const octokit = await octokitFor(token, signal);
        const answer = await octokit.request('GET /user');
        const user = UserSchema.safeParse(answer.data);
        // Something answered, but not as GitHub does: a network's sign-in page, say.
        if (!user.success) return { ok: false, problem: { kind: 'unreachable', code: undefined } };
        const header = answer.headers['x-oauth-scopes'];
        const scopes = typeof header === 'string' ? header.split(',').flatMap((scope) => scope.trim() || []) : null;
        return { ok: true, login: user.data.login, scopes };
      } catch (error) {
        return failed(error, signal);
      }
    },

    async inbox(token) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const octokit = await octokitFor(token, signal);
        const data = await octokit.graphql(inboxQuery, {
          reviews: `${searchFilters} user-review-requested:@me`,
          mine: `${searchFilters} author:@me`,
        });
        const answer = InboxDataSchema.safeParse(data);
        return answer.success ? inboxOf(answer.data) : { ok: false, problem: { kind: 'unreachable', code: undefined } };
      } catch (error) {
        const graphql = GraphqlFailureSchema.safeParse(error);
        if (!graphql.success) return failed(error, signal);
        const { errors = [], data, headers = {} } = graphql.data;
        if (errors.some((reported) => reported.type === 'RATE_LIMITED')) {
          return { ok: false, problem: { kind: 'rate_limited', resetAt: resetTime(headers, now) } };
        }
        // Some data and some errors, as for a repository behind single sign-on: take what came, as GitHub does.
        const partial = InboxDataSchema.safeParse(data);
        return partial.success ? inboxOf(partial.data) : { ok: false, problem: { kind: 'github_error', status: 200 } };
      }
    },
  };
}

function problemOf(error: Failure, timedOut: boolean, now: () => number): GitHubProblem {
  if (timedOut) return { kind: 'timeout' };
  const headers = error.response?.headers;
  const status = error.status;
  // No answer at all: octokit reports a failed fetch as status 500 without a response.
  if (headers === undefined || status === undefined) return { kind: 'unreachable', code: networkCode(error.cause) };
  if (status === 401) return { kind: 'rejected' };
  if (status === 429 || (status === 403 && (headers['x-ratelimit-remaining'] === '0' || 'retry-after' in headers))) {
    return { kind: 'rate_limited', resetAt: resetTime(headers, now) };
  }
  if (status === 403) return { kind: 'rejected' };
  return { kind: 'github_error', status };
}

function resetTime(headers: Record<string, unknown>, now: () => number): number | null {
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
