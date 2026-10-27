import { networkCode, type GitHubProblem } from '../github/client.ts';

/**
 * The only file that asks GitHub for Orynx's releases (spec 045). The repository is public, so it sends no token,
 * cookie or account, and nothing about you (AC-12). GitHub allows 60 such calls an hour; the update service asks
 * at most once a minute.
 */

export const releasesUrl = 'https://api.github.com/repos/orynx-ai/orynx/releases?per_page=10';

/** Every GitHub problem but `rejected`: there's no token to refuse. */
export type ReleasesProblem = Exclude<GitHubProblem, { kind: 'rejected' }>;

/** GitHub's list as it sent it, for `publishedReleases` to read. */
export type ReleasesAnswer = { ok: true; releases: unknown[] } | { ok: false; problem: ReleasesProblem };

export interface ReleasesClient {
  releases(): Promise<ReleasesAnswer>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ReleasesClientOptions {
  /** A test's fake releases server (DEVHUB_RELEASES_URL); GitHub's by default. */
  url?: string;
  /** How long to wait for GitHub; 10 seconds by default, as for every integration. */
  timeoutMs?: number;
  /** The network. Only a test that needs a failure MSW can't make passes one. */
  fetch?: FetchLike;
  /** The clock, in milliseconds, for a `Retry-After` in seconds. */
  now?: () => number;
}

function resetTime(headers: Headers, now: () => number): number | null {
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (headers.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset) && reset > 0) return reset * 1000;
  const wait = headers.get('retry-after');
  if (wait !== null && Number.isFinite(Number(wait)) && Number(wait) >= 0) return now() + Number(wait) * 1000;
  return null;
}

export function createReleasesClient({
  url = releasesUrl,
  timeoutMs = 10_000,
  fetch = globalThis.fetch,
  now = Date.now,
}: ReleasesClientOptions = {}): ReleasesClient {
  return {
    async releases() {
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const response = await fetch(url, {
          headers: {
            accept: 'application/vnd.github+json',
            'user-agent': 'Orynx',
            'x-github-api-version': '2022-11-28',
          },
          credentials: 'omit',
          signal,
        });
        const { status, headers } = response;
        if (!response.ok) {
          const limited =
            status === 429 ||
            (status === 403 && (headers.get('x-ratelimit-remaining') === '0' || headers.has('retry-after')));
          return {
            ok: false,
            problem: limited
              ? { kind: 'rate_limited', resetAt: resetTime(headers, now) }
              : { kind: 'github_error', status },
          };
        }
        const found: unknown = await response.json().catch(() => null);
        // Something answered, but not as GitHub does: a network's sign-in page, say.
        if (!Array.isArray(found)) return { ok: false, problem: { kind: 'unreachable', code: undefined } };
        return { ok: true, releases: found };
      } catch (error) {
        if (signal.aborted) return { ok: false, problem: { kind: 'timeout' } };
        return { ok: false, problem: { kind: 'unreachable', code: networkCode(error) } };
      }
    },
  };
}
