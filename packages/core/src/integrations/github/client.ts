import { z } from 'zod';
import { GitHubLinkSchema } from '@devhub/contracts';

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

/** The pull request a composer chip names (spec 015). */
export interface GitHubPullRef {
  owner: string;
  name: string;
  number: number;
}

/** A pull request as the composer's brief needs it (spec 015, Q4); its diff is read on its own. */
export interface GitHubPullContext {
  title: string;
  body: string | null;
  base: string;
  head: string;
  /** The head commit's checks and statuses that failed, with GitHub's conclusion in plain words. */
  failingChecks: { name: string; conclusion: string }[];
  /** Every comment in the review threads that aren't resolved; `line` is null for one on a whole file. */
  comments: { author: string; path: string; line: number | null; body: string }[];
  /** The changed files with their counts, the first 100, for a diff GitHub finds too large to send. */
  files: { path: string; additions: number; deletions: number }[];
  /** Its page on github.com, and when it was opened. */
  url: string;
  openedAt: string;
  /** Open, not merged or closed; from a fork; and written by the account Orynx reads as (spec 031). */
  open: boolean;
  fork: boolean;
  mine: boolean;
}

/** A pull request that's missing, or hidden from this token (single sign-on included), is `not_found`. */
export type GitHubPullProblem = GitHubProblem | { kind: 'not_found' };

export type GitHubPullContextAnswer = { ok: true; pull: GitHubPullContext } | { ok: false; problem: GitHubPullProblem };

/** A pull request's unified diff, or `too_large` when GitHub won't send it whole (spec 015, Q4). */
export type GitHubPullDiffAnswer =
  | { ok: true; diff: { kind: 'text'; text: string } | { kind: 'too_large' } }
  | { ok: false; problem: GitHubPullProblem };

/**
 * Why GitHub didn't open a pull request (spec 014): it already has an open one from this branch, there's nothing
 * between the base and the branch, the token isn't authorized for the organisation's single sign-on (with
 * GitHub's own link, https on github.com only), or the account can't open pull requests there (a 403, or the 404
 * GitHub gives for a repository it hides), on top of the problems every call has.
 */
export type GitHubOpenProblem =
  GitHubProblem | { kind: 'exists' } | { kind: 'no_commits' } | { kind: 'sso'; url: string } | { kind: 'forbidden' };

/** A pull request's number and its page on github.com. */
export interface GitHubPullLink {
  number: number;
  url: string;
}

/** Where a pull request goes: `owner/name`, from `head` into `base`. */
export interface GitHubPullTarget {
  repository: string;
  head: string;
  base: string;
}

export type GitHubOpened = ({ ok: true } & GitHubPullLink) | { ok: false; problem: GitHubOpenProblem };
export type GitHubFound = { ok: true; pull: GitHubPullLink | null } | { ok: false; problem: GitHubOpenProblem };
export type GitHubDefaultBranch = { ok: true; branch: string } | { ok: false; problem: GitHubOpenProblem };

/** Where a session's pull request is on GitHub, and the commit its branch ends at (spec 047). */
export type GitHubPullState =
  { ok: true; state: 'open' | 'closed' | 'merged'; head: string } | { ok: false; problem: GitHubPullProblem };

/** An unresolved review thread with GitHub's id for it, and every comment in it, oldest first (spec 049). */
export interface GitHubReviewThread {
  id: string;
  path: string;
  line: number | null;
  comments: { author: string; body: string }[];
}

export type GitHubReviewThreads =
  { ok: true; threads: GitHubReviewThread[] } | { ok: false; problem: GitHubPullProblem };

/** A reply or Resolve done; or GitHub's own words when it refused it, at most 500 characters; or a problem. */
export type GitHubThreadChange =
  { ok: true } | { ok: false; problem: GitHubProblem | { kind: 'refused'; message: string } };

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
  /**
   * One GraphQL query for a pull request a composer chip names (spec 015): its title, description, branches,
   * the head commit's failed checks, its unresolved review threads and its changed files.
   */
  pullContext(token: string, pull: GitHubPullRef): Promise<GitHubPullContextAnswer>;
  /** The pull request's diff (`GET /repos/{o}/{r}/pulls/{n}` as `diff`), for the composer's brief (spec 015). */
  pullDiff(token: string, pull: GitHubPullRef): Promise<GitHubPullDiffAnswer>;
  /** Opens a pull request (`POST /repos/{owner}/{repo}/pulls`), only on your press (spec 014). */
  openPull(token: string, pull: GitHubPullTarget & { title: string; body: string }): Promise<GitHubOpened>;
  /** The open pull request from `head` in the repository, if GitHub has one (AC-11). */
  findOpenPull(token: string, pull: Omit<GitHubPullTarget, 'base'>): Promise<GitHubFound>;
  /** The repository's default branch, for a session whose base wasn't on origin. */
  defaultBranch(token: string, repository: string): Promise<GitHubDefaultBranch>;
  /** A pull request's state and head commit (`GET /repos/{o}/{r}/pulls/{n}`), for a session watching it (spec 047). */
  pullState(token: string, pull: { repository: string; number: number }): Promise<GitHubPullState>;
  /** The pull request's unresolved review threads, among its first 50, for Reply to reviewers (spec 049). */
  reviewThreads(token: string, pull: GitHubPullRef): Promise<GitHubReviewThreads>;
  /** Replies to a review thread as you (`addPullRequestReviewThreadReply`), only on your press (spec 049). */
  replyToThread(token: string, threadId: string, body: string): Promise<GitHubThreadChange>;
  /** Resolves a review thread (`resolveReviewThread`), only on your press (spec 049). */
  resolveThread(token: string, threadId: string): Promise<GitHubThreadChange>;
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
  /** Asked for your own pull requests only: one from a fork gets no Fix on Home (spec 047). */
  isCrossRepository: z.boolean().optional(),
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

/** A pull request as GitHub's REST API gives it back: kept only with a link that is https on github.com. */
const RestPullSchema = z.object({ number: z.int().positive(), html_url: GitHubLinkSchema });

const RepositorySchema = z.object({ default_branch: z.string().min(1) });

const PullStateSchema = z.object({
  state: z.enum(['open', 'closed']),
  merged: z.boolean(),
  head: z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/) }),
});

/** What a 422 holds: GitHub's own reasons, read only to tell "already exists" and "no commits" apart. */
const ValidationSchema = z.object({ errors: z.array(z.object({ message: z.string().optional() })).optional() });

/** GitHub's single sign-on header: `required; url=https://github.com/orgs/acme/sso?authorization_request=…`. */
const ssoLink = /url=(\S+)/;

const InboxDataSchema = z.object({
  viewer: z.object({ login: z.string() }),
  reviews: z.object({ nodes: z.array(z.unknown()) }),
  mine: z.object({ nodes: z.array(z.unknown()) }),
});

/** What octokit's GraphqlResponseError holds: GitHub answered 200, with errors and maybe some data. */
const GraphqlFailureSchema = z.object({
  name: z.literal('GraphqlResponseError'),
  errors: z.array(z.object({ type: z.string().optional(), message: z.string().optional() })).optional(),
  data: z.unknown(),
  headers: z.record(z.string(), z.unknown()).optional(),
});

// The composer's pull request (spec 015). A one-off read at Send: 100 files, 100 check contexts and 50 review
// threads of 20 comments, about 12 points.
const pullContextQuery = `
  query DevHubPullContext($owner: String!, $name: String!, $number: Int!) {
    viewer { login }
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        title body baseRefName headRefName url createdAt state isCrossRepository author { login }
        files(first: 100) { nodes { path additions deletions } }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                contexts(first: 100) {
                  nodes {
                    __typename
                    ... on CheckRun { name conclusion }
                    ... on StatusContext { context state }
                  }
                }
              }
            }
          }
        }
        reviewThreads(first: 50) {
          nodes { isResolved path line comments(first: 20) { nodes { author { login } body } } }
        }
      }
    }
  }
`;

const PullContextDataSchema = z.object({
  viewer: z.object({ login: z.string() }),
  repository: z
    .object({
      pullRequest: z
        .object({
          url: GitHubLinkSchema,
          createdAt: z.iso.datetime(),
          state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
          isCrossRepository: z.boolean(),
          author: z.object({ login: z.string() }).nullish(),
          title: z.string(),
          body: z.string().nullish(),
          baseRefName: z.string(),
          headRefName: z.string(),
          files: z.object({ nodes: z.array(z.unknown()) }).nullish(),
          commits: z.object({
            nodes: z.array(
              z.object({
                commit: z.object({
                  statusCheckRollup: z.object({ contexts: z.object({ nodes: z.array(z.unknown()) }) }).nullish(),
                }),
              }),
            ),
          }),
          reviewThreads: z.object({ nodes: z.array(z.unknown()) }),
        })
        .nullable(),
    })
    .nullable(),
});

// Reply to reviewers (spec 049): the first 50 threads of 20 comments, as the brief reads them, each with its id.
const reviewThreadsQuery = `
  query DevHubReviewThreads($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        reviewThreads(first: 50) {
          nodes { id isResolved path line comments(first: 20) { nodes { author { login } body } } }
        }
      }
    }
  }
`;
const replyToThreadMutation = `
  mutation DevHubReplyToThread($thread: ID!, $body: String!) {
    addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $thread, body: $body }) { comment { id } }
  }
`;
const resolveThreadMutation = `
  mutation DevHubResolveThread($thread: ID!) {
    resolveReviewThread(input: { threadId: $thread }) { thread { isResolved } }
  }
`;
const ReviewThreadsDataSchema = z.object({
  repository: z
    .object({ pullRequest: z.object({ reviewThreads: z.object({ nodes: z.array(z.unknown()) }) }).nullable() })
    .nullable(),
});

const FailedContextSchema = z.discriminatedUnion('__typename', [
  z.object({
    __typename: z.literal('CheckRun'),
    name: z.string(),
    conclusion: z.enum(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']),
  }),
  z.object({ __typename: z.literal('StatusContext'), context: z.string(), state: z.enum(['FAILURE', 'ERROR']) }),
]);
const ThreadSchema = z.object({
  id: z.string().optional(),
  isResolved: z.boolean(),
  path: z.string(),
  line: z.int().nullish(),
  comments: z.object({
    nodes: z.array(z.object({ author: z.object({ login: z.string() }).nullish(), body: z.string() })),
  }),
});
const FileCountSchema = z.object({ path: z.string(), additions: z.int(), deletions: z.int() });

/** `TIMED_OUT` reads as "timed out". */
function plainWords(conclusion: string): string {
  return conclusion.toLowerCase().replaceAll('_', ' ');
}

function pullContextOf(data: z.infer<typeof PullContextDataSchema>): GitHubPullContextAnswer {
  const pull = data.repository?.pullRequest;
  if (pull === null || pull === undefined) return { ok: false, problem: { kind: 'not_found' } };
  const contexts = pull.commits.nodes.at(-1)?.commit.statusCheckRollup?.contexts.nodes ?? [];
  const failingChecks = contexts.flatMap((node) => {
    const failed = FailedContextSchema.safeParse(node);
    if (!failed.success) return [];
    return failed.data.__typename === 'CheckRun'
      ? [{ name: failed.data.name, conclusion: plainWords(failed.data.conclusion) }]
      : [{ name: failed.data.context, conclusion: plainWords(failed.data.state) }];
  });
  const comments = pull.reviewThreads.nodes.flatMap((node) => {
    const thread = ThreadSchema.safeParse(node);
    if (!thread.success || thread.data.isResolved) return [];
    const { path, line } = thread.data;
    return thread.data.comments.nodes.map((comment) => ({
      author: comment.author?.login ?? 'Someone',
      path,
      line: line ?? null,
      body: comment.body,
    }));
  });
  const files = (pull.files?.nodes ?? []).flatMap((node) => {
    const file = FileCountSchema.safeParse(node);
    return file.success ? [file.data] : [];
  });
  return {
    ok: true,
    pull: {
      title: pull.title,
      body: pull.body ?? null,
      base: pull.baseRefName,
      head: pull.headRefName,
      failingChecks,
      comments,
      files,
      url: pull.url,
      openedAt: pull.createdAt,
      open: pull.state === 'OPEN',
      fork: pull.isCrossRepository,
      // GitHub's logins aren't case-sensitive; a deleted account's pull request has no author.
      mine: pull.author?.login.toLowerCase() === data.viewer.login.toLowerCase(),
    },
  };
}

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
          isCrossRepository
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
  response: z.object({ headers: z.record(z.string(), z.unknown()), data: z.unknown().optional() }).optional(),
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
      userAgent: 'Orynx',
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

  /** A pull request call's failure: GitHub's reasons for a 403, 404 and 422 first, then the usual problems. */
  function openFailed(error: unknown, signal: AbortSignal): { ok: false; problem: GitHubOpenProblem } {
    const failure = FailureSchema.safeParse(error);
    const known = failure.success ? failure.data : { cause: undefined };
    const usual = problemOf(known, signal.aborted, now);
    const { status, response } = known;
    if (usual.kind === 'rate_limited' || response === undefined) return { ok: false, problem: usual };
    if (status === 403) {
      const header = response.headers['x-github-sso'];
      const url = typeof header === 'string' ? ssoLink.exec(header)?.[1] : undefined;
      if (url !== undefined && GitHubLinkSchema.safeParse(url).success)
        return { ok: false, problem: { kind: 'sso', url } };
      return { ok: false, problem: { kind: 'forbidden' } };
    }
    if (status === 404) return { ok: false, problem: { kind: 'forbidden' } };
    if (status === 422) {
      const reasons = (ValidationSchema.safeParse(response.data).data?.errors ?? []).map((one) => one.message ?? '');
      if (reasons.some((reason) => /already exists/i.test(reason))) return { ok: false, problem: { kind: 'exists' } };
      if (reasons.some((reason) => /no commits between/i.test(reason)))
        return { ok: false, problem: { kind: 'no_commits' } };
    }
    return { ok: false, problem: usual };
  }

  /** `acme/web-app` as octokit's route parameters. */
  function partsOf(repository: string): { owner: string; repo: string } {
    const [owner = '', repo = ''] = repository.split('/');
    return { owner, repo };
  }

  const notGitHub = { ok: false, problem: { kind: 'unreachable', code: undefined } } as const;

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

    async pullContext(token, { owner, name, number }) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const octokit = await octokitFor(token, signal);
        const data = await octokit.graphql(pullContextQuery, { owner, name, number });
        const answer = PullContextDataSchema.safeParse(data);
        return answer.success
          ? pullContextOf(answer.data)
          : { ok: false, problem: { kind: 'unreachable', code: undefined } };
      } catch (error) {
        const graphql = GraphqlFailureSchema.safeParse(error);
        if (!graphql.success) return failed(error, signal);
        const { errors = [], headers = {} } = graphql.data;
        if (errors.some((reported) => reported.type === 'RATE_LIMITED')) {
          return { ok: false, problem: { kind: 'rate_limited', resetAt: resetTime(headers, now) } };
        }
        // Missing, or hidden from this token: single sign-on answers FORBIDDEN with no pull request.
        if (errors.some((reported) => reported.type === 'NOT_FOUND' || reported.type === 'FORBIDDEN')) {
          return { ok: false, problem: { kind: 'not_found' } };
        }
        return { ok: false, problem: { kind: 'github_error', status: 200 } };
      }
    },

    async pullDiff(token, { owner, name, number }) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const octokit = await octokitFor(token, signal);
        const answer = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
          owner,
          repo: name,
          pull_number: number,
          mediaType: { format: 'diff' },
        });
        // Asked for as a diff, the body is text, whatever octokit's types say.
        const text: unknown = answer.data;
        return typeof text === 'string'
          ? { ok: true, diff: { kind: 'text', text } }
          : { ok: false, problem: { kind: 'unreachable', code: undefined } };
      } catch (error) {
        const failure = FailureSchema.safeParse(error);
        // GitHub refuses a diff past its own limit with 406; a missing or hidden pull request is 404.
        if (failure.success && failure.data.status === 406) return { ok: true, diff: { kind: 'too_large' } };
        if (failure.success && failure.data.status === 404) return { ok: false, problem: { kind: 'not_found' } };
        return failed(error, signal);
      }
    },

    async openPull(token, { repository, head, base, title, body }) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const octokit = await octokitFor(token, signal);
        const answer = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
          ...partsOf(repository),
          head,
          base,
          title,
          body,
        });
        const pull = RestPullSchema.safeParse(answer.data);
        return pull.success ? { ok: true, number: pull.data.number, url: pull.data.html_url } : notGitHub;
      } catch (error) {
        return openFailed(error, signal);
      }
    },

    async findOpenPull(token, { repository, head }) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const octokit = await octokitFor(token, signal);
        const parts = partsOf(repository);
        const answer = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
          ...parts,
          head: `${parts.owner}:${head}`,
          state: 'open',
          per_page: 1,
        });
        const found = z.array(z.unknown()).safeParse(answer.data);
        if (!found.success) return notGitHub;
        if (found.data.length === 0) return { ok: true, pull: null };
        const pull = RestPullSchema.safeParse(found.data[0]);
        return pull.success ? { ok: true, pull: { number: pull.data.number, url: pull.data.html_url } } : notGitHub;
      } catch (error) {
        return openFailed(error, signal);
      }
    },

    async defaultBranch(token, repository) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const octokit = await octokitFor(token, signal);
        const answer = await octokit.request('GET /repos/{owner}/{repo}', partsOf(repository));
        const found = RepositorySchema.safeParse(answer.data);
        return found.success ? { ok: true, branch: found.data.default_branch } : notGitHub;
      } catch (error) {
        return openFailed(error, signal);
      }
    },

    async pullState(token, { repository, number }) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const octokit = await octokitFor(token, signal);
        const answer = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
          ...partsOf(repository),
          pull_number: number,
        });
        const pull = PullStateSchema.safeParse(answer.data);
        if (!pull.success) return notGitHub;
        return { ok: true, state: pull.data.merged ? 'merged' : pull.data.state, head: pull.data.head.sha };
      } catch (error) {
        const failure = FailureSchema.safeParse(error);
        if (failure.success && failure.data.status === 404) return { ok: false, problem: { kind: 'not_found' } };
        return failed(error, signal);
      }
    },

    async reviewThreads(token, { owner, name, number }) {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const octokit = await octokitFor(token, signal);
        const data = ReviewThreadsDataSchema.safeParse(
          await octokit.graphql(reviewThreadsQuery, { owner, name, number }),
        );
        if (!data.success) return { ok: false, problem: { kind: 'unreachable', code: undefined } };
        const pull = data.data.repository?.pullRequest;
        if (pull === null || pull === undefined) return { ok: false, problem: { kind: 'not_found' } };
        const threads = pull.reviewThreads.nodes.flatMap((node): GitHubReviewThread[] => {
          const thread = ThreadSchema.safeParse(node);
          if (!thread.success || thread.data.isResolved || thread.data.id === undefined) return [];
          const comments = thread.data.comments.nodes.map((comment) => ({
            author: comment.author?.login ?? 'Someone',
            body: comment.body,
          }));
          return [{ id: thread.data.id, path: thread.data.path, line: thread.data.line ?? null, comments }];
        });
        return { ok: true, threads };
      } catch (error) {
        const graphql = GraphqlFailureSchema.safeParse(error);
        if (!graphql.success) return failed(error, signal);
        const { errors = [], headers = {} } = graphql.data;
        if (errors.some((reported) => reported.type === 'RATE_LIMITED')) {
          return { ok: false, problem: { kind: 'rate_limited', resetAt: resetTime(headers, now) } };
        }
        // Missing, or hidden from this token: single sign-on answers FORBIDDEN with no pull request.
        if (errors.some((reported) => reported.type === 'NOT_FOUND' || reported.type === 'FORBIDDEN')) {
          return { ok: false, problem: { kind: 'not_found' } };
        }
        return { ok: false, problem: { kind: 'github_error', status: 200 } };
      }
    },

    replyToThread(token, threadId, body) {
      return changeThread(token, replyToThreadMutation, { thread: threadId, body });
    },

    resolveThread(token, threadId) {
      return changeThread(token, resolveThreadMutation, { thread: threadId });
    },
  };

  /** A reply or Resolve; GitHub's words when it refused it, so the dialog can say why (spec 049, AC-5). */
  async function changeThread(
    token: string,
    mutation: string,
    variables: Record<string, string>,
  ): Promise<GitHubThreadChange> {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const octokit = await octokitFor(token, signal);
      await octokit.graphql(mutation, variables);
      return { ok: true };
    } catch (error) {
      const graphql = GraphqlFailureSchema.safeParse(error);
      if (!graphql.success) return failed(error, signal);
      const { errors = [], headers = {} } = graphql.data;
      if (errors.some((reported) => reported.type === 'RATE_LIMITED')) {
        return { ok: false, problem: { kind: 'rate_limited', resetAt: resetTime(headers, now) } };
      }
      const said = errors.find((reported) => reported.message !== undefined && reported.message !== '')?.message;
      return said === undefined
        ? { ok: false, problem: { kind: 'github_error', status: 200 } }
        : { ok: false, problem: { kind: 'refused', message: said.slice(0, 500) } };
    }
  }
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
export function networkCode(cause: unknown): string | undefined {
  for (let error = cause, depth = 0; error instanceof Error && depth < 4; error = error.cause, depth += 1) {
    const code = 'code' in error ? error.code : undefined;
    if (typeof code === 'string') return errorCode.test(code) ? code : undefined;
  }
  return undefined;
}
