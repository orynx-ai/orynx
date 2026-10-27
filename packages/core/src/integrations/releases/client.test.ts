import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { githubRelease, useFakeReleases } from '../../test/fake-releases.ts';
import { createReleasesClient, releasesUrl } from './client.ts';

const server = useFakeReleases();
const releasesPath = releasesUrl.split('?')[0] ?? releasesUrl;

describe('releases client (spec 045)', () => {
  it("AC-12: is one GET of orynx-ai/orynx's last 10 releases, with no token, cookie or account", async () => {
    const sent: Request[] = [];
    server.events.on('request:start', ({ request }) => {
      sent.push(request.clone());
    });
    const answer = await createReleasesClient().releases();

    expect(answer).toEqual({ ok: true, releases: [githubRelease()] });
    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.method).toBe('GET');
    expect(request?.url).toBe('https://api.github.com/repos/orynx-ai/orynx/releases?per_page=10');
    expect(request?.headers.get('authorization')).toBeNull();
    expect(request?.headers.get('cookie')).toBeNull();
    expect(request?.headers.get('user-agent')).toBe('Orynx');
  });

  it('AC-12: asks the address it was given instead, such as a test’s fake releases server', async () => {
    server.use(http.get('http://127.0.0.1:4999/releases', () => HttpResponse.json([])));
    expect(await createReleasesClient({ url: 'http://127.0.0.1:4999/releases' }).releases()).toEqual({
      ok: true,
      releases: [],
    });
  });

  it("AC-10: GitHub's rate limit is rate_limited, with when it resets", async () => {
    server.use(
      http.get(releasesPath, () =>
        HttpResponse.json(
          { message: 'API rate limit exceeded' },
          { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1761130800' } },
        ),
      ),
    );
    expect(await createReleasesClient().releases()).toEqual({
      ok: false,
      problem: { kind: 'rate_limited', resetAt: 1_761_130_800_000 },
    });

    server.use(http.get(releasesPath, () => new HttpResponse(null, { status: 429, headers: { 'retry-after': '60' } })));
    expect(await createReleasesClient({ now: () => 1000 }).releases()).toEqual({
      ok: false,
      problem: { kind: 'rate_limited', resetAt: 61_000 },
    });
  });

  it('AC-10: any other error answer is github_error with its status, and no answer is unreachable', async () => {
    server.use(http.get(releasesPath, () => new HttpResponse(null, { status: 502 })));
    expect(await createReleasesClient().releases()).toEqual({
      ok: false,
      problem: { kind: 'github_error', status: 502 },
    });

    server.use(http.get(releasesPath, () => HttpResponse.error()));
    expect(await createReleasesClient().releases()).toMatchObject({ ok: false, problem: { kind: 'unreachable' } });

    // Something answered, but not as GitHub does: a network's sign-in page, say.
    server.use(http.get(releasesPath, () => HttpResponse.text('<html>Sign in to the wifi</html>')));
    expect(await createReleasesClient().releases()).toEqual({
      ok: false,
      problem: { kind: 'unreachable', code: undefined },
    });
  });

  it('AC-10: a GitHub that never answers is a timeout', async () => {
    // MSW can't hold an answer back past the client's wait, so this one fetch never answers.
    const client = createReleasesClient({
      timeoutMs: 10,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    });
    expect(await client.releases()).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });
});
