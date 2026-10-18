import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { ghToken } from './fake-gh.ts';

/** A personal access token GitHub accepts in these tests. */
export const githubToken = 'fake-github-token-for-tests';
/** The account both good tokens belong to. */
export const githubLogin = 'octocat';
export const userUrl = 'https://api.github.com/user';
export const graphqlUrl = 'https://api.github.com/graphql';

export interface AcceptingUserOptions {
  /** Tokens GitHub accepts; the pasted one and the one the fake gh hands out by default. */
  tokens?: readonly string[];
  /** What `X-OAuth-Scopes` says, as GitHub writes it; null leaves the header out, as for a fine-grained token. */
  scopes?: string | null;
  login?: string;
}

/** GitHub's `GET /user` as GitHub answers it: the user for a good token, 401 "Bad credentials" otherwise. */
export function acceptingUser({
  tokens = [githubToken, ghToken],
  scopes = 'repo, read:org',
  login = githubLogin,
}: AcceptingUserOptions = {}) {
  return http.get(userUrl, ({ request }) => {
    const sent = request.headers.get('authorization');
    if (!tokens.some((token) => sent === `token ${token}`)) {
      return HttpResponse.json(
        { message: 'Bad credentials', documentation_url: 'https://docs.github.com/rest', status: '401' },
        { status: 401 },
      );
    }
    return HttpResponse.json(
      { login, id: 583231, name: 'The Octocat' },
      { headers: scopes === null ? {} : { 'X-OAuth-Scopes': scopes } },
    );
  });
}

/**
 * MSW standing in for GitHub, an outside service, for the test file that calls this. It answers
 * `GET /user` and fails any other request, so no test can reach the real internet.
 */
export function useFakeGitHub() {
  const server = setupServer(acceptingUser());
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
    // A listener a failed test left behind must not count another test's requests.
    server.events.removeAllListeners();
  });
  afterAll(() => {
    server.close();
  });
  return server;
}

export interface FakePull {
  owner?: string;
  repository?: string;
  number: number;
  title?: string;
  createdAt?: string;
  author?: { login: string; name?: string | null } | null;
  /** Review requests on its timeline, oldest first: who was asked and when. */
  requests?: readonly { login: string | null; at: string }[];
  /** The latest commit's combined check state, such as SUCCESS, FAILURE, ERROR or PENDING; null for none. */
  checks?: string | null;
  /** When the latest commit was made. */
  committedAt?: string;
  /** The latest commit's checks and statuses. */
  contexts?: readonly (
    | { type: 'CheckRun'; conclusion: string | null; completedAt: string | null }
    | { type: 'StatusContext'; state: string; createdAt: string }
  )[];
  /** Review threads: resolved or not, and who wrote the last comment when. */
  threads?: readonly { resolved: boolean; lastBy: string | null; at: string }[];
}

/** One pull request as the inbox's GraphQL query gets it back. */
export function pullNode(pull: FakePull) {
  const owner = pull.owner ?? 'acme';
  const repository = pull.repository ?? 'web-app';
  const author = pull.author === undefined ? { login: 'priya-s', name: 'Priya Sharma' } : pull.author;
  return {
    id: `PR_${owner}_${repository}_${String(pull.number)}`,
    number: pull.number,
    title: pull.title ?? `Pull request ${String(pull.number)}`,
    url: `https://github.com/${owner}/${repository}/pull/${String(pull.number)}`,
    createdAt: pull.createdAt ?? '2026-10-10T09:00:00Z',
    author,
    repository: { name: repository, nameWithOwner: `${owner}/${repository}` },
    timelineItems: {
      nodes: (pull.requests ?? []).map((request) => ({
        createdAt: request.at,
        requestedReviewer: request.login === null ? { slug: 'web-team' } : { login: request.login },
      })),
    },
    commits: {
      nodes: [
        {
          commit: {
            ...(pull.committedAt === undefined ? {} : { committedDate: pull.committedAt }),
            statusCheckRollup:
              pull.checks === undefined || pull.checks === null
                ? null
                : {
                    state: pull.checks,
                    contexts: {
                      nodes: (pull.contexts ?? []).map(({ type, ...context }) => ({ __typename: type, ...context })),
                    },
                  },
          },
        },
      ],
    },
    reviewThreads: {
      nodes: (pull.threads ?? []).map((thread) => ({
        isResolved: thread.resolved,
        comments: {
          nodes: [{ createdAt: thread.at, author: thread.lastBy === null ? null : { login: thread.lastBy } }],
        },
      })),
    },
  };
}

/**
 * GitHub's GraphQL API answering the inbox's query for a good token: who you are, the pull requests that
 * ask for your review, and your own.
 */
export function acceptingInboxQuery({
  login = githubLogin,
  reviews = [],
  mine = [],
  tokens = [githubToken, ghToken],
}: { login?: string; reviews?: readonly FakePull[]; mine?: readonly FakePull[]; tokens?: readonly string[] } = {}) {
  return http.post(graphqlUrl, ({ request }) => {
    const sent = request.headers.get('authorization');
    if (!tokens.some((token) => sent === `token ${token}`)) {
      return HttpResponse.json(
        { message: 'Bad credentials', documentation_url: 'https://docs.github.com/graphql', status: '401' },
        { status: 401 },
      );
    }
    return HttpResponse.json({
      data: {
        viewer: { login },
        reviews: { nodes: reviews.map(pullNode) },
        mine: { nodes: mine.map(pullNode) },
      },
    });
  });
}

/** A pull request as the composer reads it for a brief (spec 015, Q4). */
export interface FakePullContext {
  owner?: string;
  repository?: string;
  number: number;
  title?: string;
  body?: string | null;
  base?: string;
  head?: string;
  files?: readonly { path: string; additions: number; deletions: number }[];
  /** The head commit's checks and statuses. */
  contexts?: readonly (
    | { type: 'CheckRun'; name: string; conclusion: string | null }
    | { type: 'StatusContext'; context: string; state: string }
  )[];
  threads?: readonly {
    resolved: boolean;
    path: string;
    line: number | null;
    comments: readonly { author: string | null; body: string }[];
  }[];
}

/** GitHub's answer when a repository or pull request is missing or hidden from the token. */
function notFound(owner: string, repository: string) {
  return HttpResponse.json({
    data: { repository: null },
    errors: [
      {
        type: 'NOT_FOUND',
        path: ['repository'],
        message: `Could not resolve to a Repository with the name '${owner}/${repository}'.`,
      },
    ],
  });
}

/**
 * GitHub's GraphQL API answering the composer's pull request query (spec 015) for a good token, for these pull
 * requests only. Any other query falls through to the next handler, such as the inbox's.
 */
export function acceptingPullContext(
  pulls: readonly FakePullContext[],
  { tokens = [githubToken, ghToken] }: { tokens?: readonly string[] } = {},
) {
  return http.post(graphqlUrl, async ({ request }) => {
    const sent = (await request.clone().json()) as { query?: unknown; variables?: Record<string, unknown> };
    if (typeof sent.query !== 'string' || !sent.query.includes('DevHubPullContext')) return undefined;
    if (!tokens.some((token) => request.headers.get('authorization') === `token ${token}`)) {
      return HttpResponse.json({ message: 'Bad credentials', status: '401' }, { status: 401 });
    }
    const { owner, name, number } = sent.variables ?? {};
    const pull = pulls.find(
      (candidate) =>
        (candidate.owner ?? 'acme') === owner &&
        (candidate.repository ?? 'web-app') === name &&
        candidate.number === number,
    );
    if (pull === undefined) return notFound(String(owner), String(name));
    return HttpResponse.json({
      data: {
        repository: {
          pullRequest: {
            title: pull.title ?? `Pull request ${String(pull.number)}`,
            body: pull.body === undefined ? 'What this pull request changes.' : pull.body,
            baseRefName: pull.base ?? 'main',
            headRefName: pull.head ?? `feat/pull-${String(pull.number)}`,
            files: { nodes: pull.files ?? [] },
            commits: {
              nodes: [
                {
                  commit: {
                    statusCheckRollup: {
                      contexts: {
                        nodes: (pull.contexts ?? []).map(({ type, ...context }) => ({ __typename: type, ...context })),
                      },
                    },
                  },
                },
              ],
            },
            reviewThreads: {
              nodes: (pull.threads ?? []).map((thread) => ({
                isResolved: thread.resolved,
                path: thread.path,
                line: thread.line,
                comments: {
                  nodes: thread.comments.map((comment) => ({
                    author: comment.author === null ? null : { login: comment.author },
                    body: comment.body,
                  })),
                },
              })),
            },
          },
        },
      },
    });
  });
}
