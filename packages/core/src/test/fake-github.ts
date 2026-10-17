import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { ghToken } from './fake-gh.ts';

/** A personal access token GitHub accepts in these tests. */
export const githubToken = 'fake-github-token-for-tests';
/** The account both good tokens belong to. */
export const githubLogin = 'octocat';
export const userUrl = 'https://api.github.com/user';

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
