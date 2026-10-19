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

/** The REST address of one pull request. */
export function pullUrl(owner: string, repository: string, number: number): string {
  return `https://api.github.com/repos/${owner}/${repository}/pulls/${String(number)}`;
}

/**
 * GitHub's REST API giving these pull requests' diffs (spec 015) for a good token that asks for the diff media
 * type. `tooLarge` answers 406, as GitHub does past its own limit.
 */
export function acceptingPullDiff(
  pulls: readonly { owner?: string; repository?: string; number: number; diff?: string; tooLarge?: boolean }[],
  { tokens = [githubToken, ghToken] }: { tokens?: readonly string[] } = {},
) {
  return http.get('https://api.github.com/repos/:owner/:repository/pulls/:number', ({ request, params }) => {
    if (!tokens.some((token) => request.headers.get('authorization') === `token ${token}`)) {
      return HttpResponse.json({ message: 'Bad credentials', status: '401' }, { status: 401 });
    }
    const pull = pulls.find(
      (candidate) =>
        (candidate.owner ?? 'acme') === params['owner'] &&
        (candidate.repository ?? 'web-app') === params['repository'] &&
        String(candidate.number) === params['number'],
    );
    if (pull === undefined) return HttpResponse.json({ message: 'Not Found', status: '404' }, { status: 404 });
    if (!(request.headers.get('accept') ?? '').includes('diff')) {
      return HttpResponse.json({ message: 'Ask for the diff media type', status: '415' }, { status: 415 });
    }
    if (pull.tooLarge === true) {
      return HttpResponse.json(
        {
          message: 'Sorry, the diff exceeded the maximum number of lines (20000)',
          errors: [{ resource: 'PullRequest', field: 'diff', code: 'too_large' }],
          status: '406',
        },
        { status: 406 },
      );
    }
    return new HttpResponse(pull.diff ?? '', {
      headers: { 'content-type': 'application/vnd.github.diff; charset=utf-8' },
    });
  });
}

/** A pull request GitHub holds, as the fake opens and lists them (spec 014). */
export interface FakeOpenedPull {
  owner: string;
  repository: string;
  number: number;
  head: string;
  base: string;
  title: string;
  body: string;
}

export const pullsUrl = 'https://api.github.com/repos/:owner/:repo/pulls';
export const repositoryUrl = 'https://api.github.com/repos/:owner/:repo';

function refused(request: Request, tokens: readonly string[]) {
  const sent = request.headers.get('authorization');
  return tokens.some((token) => sent === `token ${token}`)
    ? null
    : HttpResponse.json({ message: 'Bad credentials', status: '401' }, { status: 401 });
}

/**
 * GitHub's pull requests on any repository, as its REST API answers them: `POST …/pulls` opens one (and a second
 * from the same head is "already exists", as GitHub says it), `GET …/pulls?head=owner:branch&state=open` lists the
 * open ones from a branch. `opened` holds every pull request the fake has, oldest first, for a test to read.
 */
export function acceptingPulls({
  opened = [],
  firstNumber = 2841,
  tokens = [githubToken, ghToken],
}: { opened?: FakeOpenedPull[]; firstNumber?: number; tokens?: readonly string[] } = {}) {
  return [
    http.post(pullsUrl, async ({ request, params }) => {
      const no = refused(request, tokens);
      if (no !== null) return no;
      const owner = String(params['owner']);
      const repository = String(params['repo']);
      const sent = (await request.json()) as { title: string; body: string; head: string; base: string };
      if (opened.some((pull) => pull.owner === owner && pull.repository === repository && pull.head === sent.head)) {
        return HttpResponse.json(
          {
            message: 'Validation Failed',
            errors: [
              {
                resource: 'PullRequest',
                code: 'custom',
                message: `A pull request already exists for ${owner}:${sent.head}.`,
              },
            ],
          },
          { status: 422 },
        );
      }
      const pull = { owner, repository, number: firstNumber + opened.length, ...sent };
      opened.push(pull);
      return HttpResponse.json(
        { number: pull.number, html_url: `https://github.com/${owner}/${repository}/pull/${String(pull.number)}` },
        { status: 201 },
      );
    }),
    http.get(pullsUrl, ({ request, params }) => {
      const no = refused(request, tokens);
      if (no !== null) return no;
      const owner = String(params['owner']);
      const repository = String(params['repo']);
      const head = new URL(request.url).searchParams.get('head') ?? '';
      const found = opened.filter(
        (pull) => pull.owner === owner && pull.repository === repository && `${owner}:${pull.head}` === head,
      );
      return HttpResponse.json(
        found.map((pull) => ({
          number: pull.number,
          html_url: `https://github.com/${owner}/${repository}/pull/${String(pull.number)}`,
        })),
      );
    }),
  ];
}

/** GitHub's `GET /repos/{owner}/{repo}`, naming its default branch. */
export function acceptingRepository({
  defaultBranch = 'main',
  tokens = [githubToken, ghToken],
}: { defaultBranch?: string; tokens?: readonly string[] } = {}) {
  return http.get(repositoryUrl, ({ request, params }) => {
    const no = refused(request, tokens);
    if (no !== null) return no;
    return HttpResponse.json({
      full_name: `${String(params['owner'])}/${String(params['repo'])}`,
      default_branch: defaultBranch,
    });
  });
}
