import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  acceptingInboxQuery,
  acceptingPullContext,
  acceptingPullDiff,
  acceptingPulls,
  acceptingRepository,
  githubLogin,
  githubToken,
  graphqlUrl,
  pullNode,
  pullUrl,
  pullsUrl,
  repositoryUrl,
  userUrl,
  useFakeGitHub,
  type FakeOpenedPull,
  type FakePullContext,
} from '../../test/fake-github.ts';
import { createGitHubClient, type GitHubCheck } from './client.ts';

const github = useFakeGitHub();
const client = createGitHubClient({ timeoutMs: 200 });

function answerUser(response: () => Response | Promise<Response>) {
  github.use(http.get(userUrl, response));
}

/** No outcome may carry the token (AC-17). */
function expectNoSecret(check: GitHubCheck) {
  expect(JSON.stringify(check)).not.toContain(githubToken);
}

describe('GitHub client', () => {
  it('AC-3, AC-5: GitHub names the account and its scopes for a good token, sent only to api.github.com', async () => {
    const seen: Request[] = [];
    github.events.on('request:start', ({ request }) => {
      seen.push(request.clone());
    });

    expect(await client.check(githubToken)).toEqual({ ok: true, login: githubLogin, scopes: ['repo', 'read:org'] });
    expect(seen.map((request) => request.url)).toEqual([userUrl]);
    expect(seen[0]?.headers.get('authorization')).toBe(`token ${githubToken}`);
    github.events.removeAllListeners();
  });

  it('AC-7: a fine-grained token sends no scopes, so they are unknown', async () => {
    answerUser(() => HttpResponse.json({ login: githubLogin }));
    expect(await client.check(githubToken)).toEqual({ ok: true, login: githubLogin, scopes: null });
  });

  it('AC-7: a classic token with no scopes at all', async () => {
    answerUser(() => HttpResponse.json({ login: githubLogin }, { headers: { 'X-OAuth-Scopes': '' } }));
    expect(await client.check(githubToken)).toEqual({ ok: true, login: githubLogin, scopes: [] });
  });

  it('AC-6: GitHub refuses a wrong token with 401', async () => {
    const check = await client.check('fake-wrong-token');
    expect(check).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expectNoSecret(check);
  });

  it('AC-6: a 403 that is not the rate limit is a refused token', async () => {
    answerUser(() => HttpResponse.json({ message: 'Forbidden' }, { status: 403 }));
    expect(await client.check(githubToken)).toEqual({ ok: false, problem: { kind: 'rejected' } });
  });

  it.each([403, 429])('AC-8: the rate limit is used up (%i), and resets at the time GitHub gives', async (status) => {
    answerUser(() =>
      HttpResponse.json(
        { message: 'API rate limit exceeded' },
        { status, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1792234500' } },
      ),
    );
    expect(await client.check(githubToken)).toEqual({
      ok: false,
      problem: { kind: 'rate_limited', resetAt: 1_792_234_500_000 },
    });
  });

  it('AC-8: a secondary rate limit says how many seconds to wait instead', async () => {
    const at = createGitHubClient({ now: () => 1_792_234_000_000 });
    answerUser(() => HttpResponse.json({ message: 'Slow down' }, { status: 429, headers: { 'Retry-After': '60' } }));
    expect(await at.check(githubToken)).toEqual({
      ok: false,
      problem: { kind: 'rate_limited', resetAt: 1_792_234_060_000 },
    });
  });

  it('AC-8: a 429 that says nothing about when it resets', async () => {
    answerUser(() => HttpResponse.json({ message: 'Slow down' }, { status: 429 }));
    expect(await client.check(githubToken)).toEqual({ ok: false, problem: { kind: 'rate_limited', resetAt: null } });
  });

  it.each([500, 502, 503])('AC-8: GitHub answers with an error (%i)', async (status) => {
    answerUser(() => HttpResponse.json({ message: 'Unicorn' }, { status }));
    expect(await client.check(githubToken)).toEqual({ ok: false, problem: { kind: 'github_error', status } });
  });

  it("AC-8: github.com can't be reached", async () => {
    answerUser(() => HttpResponse.error());
    const check = await client.check(githubToken);
    expect(check).toEqual({ ok: false, problem: { kind: 'unreachable', code: undefined } });
    expectNoSecret(check);
  });

  it('AC-8: something answers, but not as GitHub does, such as a network login page', async () => {
    answerUser(() => HttpResponse.html('<html><body>Sign in to the Wi-Fi</body></html>'));
    expect(await client.check(githubToken)).toEqual({ ok: false, problem: { kind: 'unreachable', code: undefined } });
  });

  it("AC-8: github.com doesn't answer in time", async () => {
    answerUser(async () => {
      await delay('infinite');
      return HttpResponse.json({});
    });
    expect(await client.check(githubToken)).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });

  it.each([
    ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'],
    ['ENOTFOUND', 'ENOTFOUND'],
    [githubToken, undefined],
  ])('AC-8: keeps the network error code %s for the terminal only when it looks like a code', async (code, kept) => {
    // MSW can't fail a request with a code, so this one stands in for fetch, the network itself.
    const failing = createGitHubClient({
      fetch: () =>
        Promise.reject(new TypeError('fetch failed', { cause: Object.assign(new Error('connect failed'), { code }) })),
    });
    const check = await failing.check(githubToken);
    expect(check).toEqual({ ok: false, problem: { kind: 'unreachable', code: kept } });
    expectNoSecret(check);
  });

  it('AC-17: never follows a redirect, so the token can only ever go to api.github.com', async () => {
    const elsewhere: string[] = [];
    github.use(
      http.get(
        userUrl,
        () => new HttpResponse(null, { status: 302, headers: { Location: 'https://elsewhere.example/user' } }),
      ),
      http.get('https://elsewhere.example/user', ({ request }) => {
        elsewhere.push(request.headers.get('authorization') ?? '');
        return HttpResponse.json({ login: githubLogin });
      }),
    );

    expect(await client.check(githubToken)).toEqual({ ok: false, problem: { kind: 'unreachable', code: undefined } });
    expect(elsewhere).toEqual([]);
  });

  it('treats a failure that is not an error object as unreachable', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the network can reject with anything
    const failing = createGitHubClient({ fetch: () => Promise.reject(null) });
    expect(await failing.check(githubToken)).toEqual({ ok: false, problem: { kind: 'unreachable', code: undefined } });
  });

  it('waits 10 seconds by default', () => {
    expect(createGitHubClient().timeoutMs).toBe(10_000);
  });
});

describe('GitHub client: the inbox (spec 007)', () => {
  it('AC-6, AC-8: asks api.github.com once for open, non-draft review requests to you by name and for your own', async () => {
    const seen: { url: string; authorization: string | null; body: unknown }[] = [];
    github.use(acceptingInboxQuery({ reviews: [{ number: 2841 }], mine: [{ number: 2836 }] }));
    github.events.on('request:start', ({ request }) => {
      const copy = request.clone();
      void copy.json().then((body) => {
        seen.push({ url: copy.url, authorization: copy.headers.get('authorization'), body });
      });
    });

    const answer = await client.inbox(githubToken);

    expect(answer).toMatchObject({
      ok: true,
      login: githubLogin,
      reviews: [{ number: 2841 }],
      mine: [{ number: 2836 }],
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      url: graphqlUrl,
      authorization: `token ${githubToken}`,
      body: {
        variables: {
          reviews: 'is:pr is:open draft:false archived:false user-review-requested:@me',
          mine: 'is:pr is:open draft:false archived:false author:@me',
        },
      },
    });
    github.events.removeAllListeners();
  });

  it('leaves out search results that aren’t pull requests', async () => {
    github.use(
      http.post(graphqlUrl, () =>
        HttpResponse.json({
          data: {
            viewer: { login: githubLogin },
            reviews: { nodes: [null, {}, pullNode({ number: 7 })] },
            mine: { nodes: [] },
          },
        }),
      ),
    );

    const answer = await client.inbox(githubToken);

    expect(answer.ok && answer.reviews.map((pull) => pull.number)).toEqual([7]);
  });

  it('takes the pull requests that came when GitHub also reports errors, as it does for single sign-on', async () => {
    github.use(
      http.post(graphqlUrl, () =>
        HttpResponse.json({
          data: {
            viewer: { login: githubLogin },
            reviews: { nodes: [pullNode({ number: 9 }), null] },
            mine: { nodes: [] },
          },
          errors: [{ type: 'FORBIDDEN', message: 'Resource protected by organization SAML enforcement.' }],
        }),
      ),
    );

    const answer = await client.inbox(githubToken);

    expect(answer.ok && answer.reviews.map((pull) => pull.number)).toEqual([9]);
  });

  it('AC-25: a refused token comes back as a problem that never holds the token', async () => {
    github.use(acceptingInboxQuery());

    const answer = await client.inbox('fake-wrong-token-for-tests');

    expect(answer).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expect(JSON.stringify(answer)).not.toContain('fake-wrong-token-for-tests');
  });

  it('AC-24: GraphQL’s own rate limit is a rate limit, with GitHub’s reset time', async () => {
    github.use(
      http.post(graphqlUrl, () =>
        HttpResponse.json(
          { errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded for user ID 583231.' }] },
          { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792245900' } },
        ),
      ),
    );

    expect(await client.inbox(githubToken)).toEqual({
      ok: false,
      problem: { kind: 'rate_limited', resetAt: 1_792_245_900_000 },
    });
  });

  it('AC-24: an answer with errors and no data is a GitHub error', async () => {
    github.use(http.post(graphqlUrl, () => HttpResponse.json({ errors: [{ message: 'Something went wrong' }] })));

    expect(await client.inbox(githubToken)).toEqual({ ok: false, problem: { kind: 'github_error', status: 200 } });
  });

  it('AC-24: a slow GitHub is a timeout, and a broken one an error', async () => {
    github.use(
      http.post(graphqlUrl, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    expect(await client.inbox(githubToken)).toEqual({ ok: false, problem: { kind: 'timeout' } });

    github.use(http.post(graphqlUrl, () => HttpResponse.json({ message: 'Server Error' }, { status: 502 })));
    expect(await client.inbox(githubToken)).toEqual({ ok: false, problem: { kind: 'github_error', status: 502 } });
  });
});

describe('GitHub client: a pull request for the composer (spec 015)', () => {
  const pull = { owner: 'acme', name: 'web-app', number: 2836 };

  it('AC-20 (Q4): reads the title, description, branches, failing checks, unresolved comments and changed files in one query', async () => {
    const seen: Request[] = [];
    github.events.on('request:start', ({ request }) => {
      seen.push(request.clone());
    });
    github.use(
      acceptingPullContext([
        {
          number: 2836,
          title: 'Lazy-load the people directory',
          body: 'Loads 50 people at a time.',
          base: 'main',
          head: 'feat/lazy-people',
          files: [{ path: 'src/people.ts', additions: 12, deletions: 3 }],
          contexts: [
            { type: 'CheckRun', name: 'test (ubuntu)', conclusion: 'FAILURE' },
            { type: 'CheckRun', name: 'lint', conclusion: 'SUCCESS' },
            { type: 'CheckRun', name: 'e2e', conclusion: 'TIMED_OUT' },
            { type: 'CheckRun', name: 'deploy', conclusion: null },
            { type: 'StatusContext', context: 'ci/circleci', state: 'ERROR' },
            { type: 'StatusContext', context: 'coverage', state: 'SUCCESS' },
          ],
          threads: [
            {
              resolved: false,
              path: 'src/people.ts',
              line: 12,
              comments: [{ author: 'octocat', body: 'Name this constant.' }],
            },
            { resolved: true, path: 'src/old.ts', line: 3, comments: [{ author: 'octocat', body: 'Done.' }] },
            { resolved: false, path: 'README.md', line: null, comments: [{ author: null, body: 'Typo.' }] },
          ],
        },
      ]),
    );

    expect(await client.pullContext(githubToken, pull)).toEqual({
      ok: true,
      pull: {
        title: 'Lazy-load the people directory',
        body: 'Loads 50 people at a time.',
        base: 'main',
        head: 'feat/lazy-people',
        failingChecks: [
          { name: 'test (ubuntu)', conclusion: 'failure' },
          { name: 'e2e', conclusion: 'timed out' },
          { name: 'ci/circleci', conclusion: 'error' },
        ],
        comments: [
          { author: 'octocat', path: 'src/people.ts', line: 12, body: 'Name this constant.' },
          { author: 'Someone', path: 'README.md', line: null, body: 'Typo.' },
        ],
        files: [{ path: 'src/people.ts', additions: 12, deletions: 3 }],
        url: 'https://github.com/acme/web-app/pull/2836',
        openedAt: '2026-10-15T09:00:00Z',
        open: true,
        fork: false,
        mine: false,
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe(graphqlUrl);
    expect(seen[0]?.headers.get('authorization')).toBe(`token ${githubToken}`);
    expect(((await seen[0]?.json()) as { variables: unknown }).variables).toEqual(pull);
  });

  it('AC-14, AC-19 (spec 031): says whether you wrote it, whether it’s open and whether it comes from a fork', async () => {
    const read = async (pull: Partial<FakePullContext>) => {
      github.use(acceptingPullContext([{ number: 2836, ...pull }]));
      const answer = await client.pullContext(githubToken, { owner: 'acme', name: 'web-app', number: 2836 });
      return answer.ok ? { mine: answer.pull.mine, open: answer.pull.open, fork: answer.pull.fork } : answer;
    };
    expect(await read({ author: githubLogin })).toEqual({ mine: true, open: true, fork: false });
    // GitHub's logins aren't case-sensitive.
    expect(await read({ author: githubLogin.toUpperCase() })).toEqual({ mine: true, open: true, fork: false });
    expect(await read({ author: 'hubot' })).toEqual({ mine: false, open: true, fork: false });
    // A deleted account's pull request has no author.
    expect(await read({ author: null })).toEqual({ mine: false, open: true, fork: false });
    expect(await read({ author: githubLogin, state: 'MERGED' })).toEqual({ mine: true, open: false, fork: false });
    expect(await read({ author: githubLogin, state: 'CLOSED' })).toEqual({ mine: true, open: false, fork: false });
    expect(await read({ author: githubLogin, fork: true })).toEqual({ mine: true, open: true, fork: true });
  });

  it('AC-21: a pull request GitHub hides or hasn’t got, even behind single sign-on, is not found', async () => {
    github.use(acceptingPullContext([{ number: 2836 }]));
    expect(await client.pullContext(githubToken, { ...pull, number: 9 })).toEqual({
      ok: false,
      problem: { kind: 'not_found' },
    });
    github.use(
      http.post(graphqlUrl, () =>
        HttpResponse.json({
          data: { repository: null },
          errors: [{ type: 'FORBIDDEN', message: 'Resource protected by organization SAML enforcement.' }],
        }),
      ),
    );
    expect(await client.pullContext(githubToken, pull)).toEqual({ ok: false, problem: { kind: 'not_found' } });
  });

  it('AC-21: a refused token, the rate limit and a slow GitHub are problems that never hold the token', async () => {
    github.use(acceptingPullContext([{ number: 2836 }]));
    const refused = await client.pullContext('fake-wrong-token-for-tests', pull);
    expect(refused).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expect(JSON.stringify(refused)).not.toContain('fake-wrong-token-for-tests');

    github.use(
      http.post(graphqlUrl, () =>
        HttpResponse.json(
          { errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded.' }] },
          { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792245900' } },
        ),
      ),
    );
    expect(await client.pullContext(githubToken, pull)).toEqual({
      ok: false,
      problem: { kind: 'rate_limited', resetAt: 1_792_245_900_000 },
    });

    github.use(
      http.post(graphqlUrl, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    expect(await client.pullContext(githubToken, pull)).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });
});

describe('GitHub client: a pull request’s diff for the composer (spec 015)', () => {
  const pull = { owner: 'acme', name: 'web-app', number: 2836 };
  const diff =
    'diff --git a/src/people.ts b/src/people.ts\n--- a/src/people.ts\n+++ b/src/people.ts\n@@ -1 +1 @@\n-const page = 20;\n+const page = 50;\n';

  it('AC-20 (Q4): reads the unified diff from api.github.com, asking for the diff media type', async () => {
    const seen: Request[] = [];
    github.events.on('request:start', ({ request }) => {
      seen.push(request.clone());
    });
    github.use(acceptingPullDiff([{ number: 2836, diff }]));

    expect(await client.pullDiff(githubToken, pull)).toEqual({ ok: true, diff: { kind: 'text', text: diff } });
    expect(seen[0]?.url).toBe(pullUrl('acme', 'web-app', 2836));
    expect(seen[0]?.headers.get('accept')).toContain('diff');
  });

  it('AC-20 (Q4): a diff GitHub finds too large is said, so the brief can give counts instead', async () => {
    github.use(acceptingPullDiff([{ number: 2836, tooLarge: true }]));
    expect(await client.pullDiff(githubToken, pull)).toEqual({ ok: true, diff: { kind: 'too_large' } });
  });

  it('AC-21: a missing pull request is not found, and a refused token never shows in the answer', async () => {
    github.use(acceptingPullDiff([{ number: 2836, diff }]));
    expect(await client.pullDiff(githubToken, { ...pull, number: 9 })).toEqual({
      ok: false,
      problem: { kind: 'not_found' },
    });
    const refused = await client.pullDiff('fake-wrong-token-for-tests', pull);
    expect(refused).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expect(JSON.stringify(refused)).not.toContain('fake-wrong-token-for-tests');
  });
});

describe('GitHub client: pull requests (spec 014)', () => {
  const target = { repository: 'acme/web-app', head: 'feat/PROJ-1423', base: 'main' };
  const draft = { title: 'PROJ-1423: Add bulk archive', body: 'What changed.' };

  function answerCreate(response: () => Response | Promise<Response>) {
    github.use(http.post(pullsUrl, response));
  }

  it('AC-5: opens the pull request from the branch into the base, sending the token to api.github.com only', async () => {
    const opened: FakeOpenedPull[] = [];
    const seen: Request[] = [];
    github.use(...acceptingPulls({ opened }));
    github.events.on('request:start', ({ request }) => {
      seen.push(request.clone());
    });

    const answer = await client.openPull(githubToken, { ...target, ...draft });
    expect(answer).toEqual({ ok: true, number: 2841, url: 'https://github.com/acme/web-app/pull/2841' });
    expect(opened).toEqual([
      { owner: 'acme', repository: 'web-app', number: 2841, head: target.head, base: target.base, ...draft },
    ]);
    expect(seen.map((request) => request.url)).toEqual(['https://api.github.com/repos/acme/web-app/pulls']);
    expect(seen[0]?.headers.get('authorization')).toBe(`token ${githubToken}`);
    github.events.removeAllListeners();
  });

  it('AC-11: says GitHub already has an open pull request from the branch, and finds it', async () => {
    const opened: FakeOpenedPull[] = [
      {
        owner: 'acme',
        repository: 'web-app',
        number: 2840,
        head: 'feat/PROJ-1423',
        base: 'main',
        title: 'Mine',
        body: '',
      },
    ];
    github.use(...acceptingPulls({ opened }));
    expect(await client.openPull(githubToken, { ...target, ...draft })).toEqual({
      ok: false,
      problem: { kind: 'exists' },
    });
    expect(await client.findOpenPull(githubToken, target)).toEqual({
      ok: true,
      pull: { number: 2840, url: 'https://github.com/acme/web-app/pull/2840' },
    });
    expect(await client.findOpenPull(githubToken, { ...target, head: 'feat/PROJ-9' })).toEqual({
      ok: true,
      pull: null,
    });
  });

  it("AC-10: says there's nothing to merge from the branch into the base", async () => {
    answerCreate(() =>
      HttpResponse.json(
        {
          message: 'Validation Failed',
          errors: [{ resource: 'PullRequest', code: 'custom', message: 'No commits between main and feat/PROJ-1423' }],
        },
        { status: 422 },
      ),
    );
    expect(await client.openPull(githubToken, { ...target, ...draft })).toEqual({
      ok: false,
      problem: { kind: 'no_commits' },
    });
  });

  it('AC-10: any other refusal of the pull request is a GitHub error', async () => {
    answerCreate(() =>
      HttpResponse.json(
        { message: 'Validation Failed', errors: [{ code: 'invalid', field: 'base' }] },
        { status: 422 },
      ),
    );
    expect(await client.openPull(githubToken, { ...target, ...draft })).toEqual({
      ok: false,
      problem: { kind: 'github_error', status: 422 },
    });
  });

  it("AC-10: says the token isn't authorized for the organisation's single sign-on, with GitHub's own link", async () => {
    const sso = 'https://github.com/orgs/acme/sso?authorization_request=A1B2C3';
    answerCreate(() =>
      HttpResponse.json(
        { message: 'Resource protected by organization SAML enforcement.' },
        { status: 403, headers: { 'X-GitHub-SSO': `required; url=${sso}` } },
      ),
    );
    expect(await client.openPull(githubToken, { ...target, ...draft })).toEqual({
      ok: false,
      problem: { kind: 'sso', url: sso },
    });
  });

  it('AC-10: a sign-on link that isn’t https on github.com is never passed on', async () => {
    answerCreate(() =>
      HttpResponse.json(
        { message: 'SAML' },
        { status: 403, headers: { 'X-GitHub-SSO': 'required; url=https://evil.example/sso' } },
      ),
    );
    expect(await client.openPull(githubToken, { ...target, ...draft })).toEqual({
      ok: false,
      problem: { kind: 'forbidden' },
    });
  });

  it.each([403, 404])("AC-10: your account can't open pull requests there (%i)", async (status) => {
    answerCreate(() => HttpResponse.json({ message: 'Not Found' }, { status }));
    expect(await client.openPull(githubToken, { ...target, ...draft })).toEqual({
      ok: false,
      problem: { kind: 'forbidden' },
    });
  });

  it('AC-10: the rate limit, a refused token, a slow or unreachable GitHub, as for the other calls', async () => {
    answerCreate(() =>
      HttpResponse.json(
        { message: 'API rate limit exceeded' },
        { status: 403, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1792234500' } },
      ),
    );
    expect(await client.openPull(githubToken, { ...target, ...draft })).toEqual({
      ok: false,
      problem: { kind: 'rate_limited', resetAt: 1_792_234_500_000 },
    });
    github.use(...acceptingPulls());
    const refusedToken = await client.openPull('fake-wrong-token', { ...target, ...draft });
    expect(refusedToken).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expect(JSON.stringify(refusedToken)).not.toContain('fake-wrong-token');
    answerCreate(() => HttpResponse.error());
    expect(await client.openPull(githubToken, { ...target, ...draft })).toEqual({
      ok: false,
      problem: { kind: 'unreachable', code: undefined },
    });
    answerCreate(async () => {
      await delay('infinite');
      return HttpResponse.json({});
    });
    expect(await client.openPull(githubToken, { ...target, ...draft })).toEqual({
      ok: false,
      problem: { kind: 'timeout' },
    });
  });

  it("AC-16: doesn't keep a pull request whose link isn't https on github.com", async () => {
    answerCreate(() =>
      HttpResponse.json({ number: 2841, html_url: 'https://evil.example/acme/web-app/pull/2841' }, { status: 201 }),
    );
    expect(await client.openPull(githubToken, { ...target, ...draft })).toEqual({
      ok: false,
      problem: { kind: 'unreachable', code: undefined },
    });
  });

  it("names a repository's default branch on GitHub", async () => {
    github.use(acceptingRepository({ defaultBranch: 'trunk' }));
    expect(await client.defaultBranch(githubToken, 'acme/web-app')).toEqual({ ok: true, branch: 'trunk' });
    github.use(http.get(repositoryUrl, () => HttpResponse.json({ message: 'Not Found' }, { status: 404 })));
    expect(await client.defaultBranch(githubToken, 'acme/web-app')).toEqual({
      ok: false,
      problem: { kind: 'forbidden' },
    });
  });
});
