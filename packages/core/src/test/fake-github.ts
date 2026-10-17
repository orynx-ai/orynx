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
