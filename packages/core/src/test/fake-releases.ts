import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { releasesUrl } from '../integrations/releases/client.ts';

/** One release in GitHub's REST answer, with only the fields Orynx reads (spec 045). */
export interface GitHubReleaseJson {
  tag_name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
}

/** `v0.1.40`, published on 22 Oct 2026 with one line of notes, unless the override says otherwise. */
export function githubRelease(overrides: Partial<GitHubReleaseJson> = {}): GitHubReleaseJson {
  const tag = overrides.tag_name ?? 'v0.1.40';
  return {
    tag_name: tag,
    body: '## New\n\n- Show the inbox tabs',
    draft: false,
    prerelease: false,
    published_at: '2026-10-22T10:00:00Z',
    html_url: `https://github.com/orynx-ai/orynx/releases/tag/${tag}`,
    ...overrides,
  };
}

/** GitHub's `GET /repos/orynx-ai/orynx/releases` answering with these releases, newest first. */
export function answeringReleases(releases: readonly GitHubReleaseJson[] = [githubRelease()]) {
  return http.get(releasesUrl.split('?')[0] ?? releasesUrl, () => HttpResponse.json(releases));
}

/**
 * MSW standing in for GitHub's releases, an outside service, for the test file that calls this. It answers with
 * one release by default and fails any other request, so no test can reach the real internet.
 */
export function useFakeReleases() {
  const server = setupServer(answeringReleases());
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
    server.events.removeAllListeners();
  });
  afterAll(() => {
    server.close();
  });
  return server;
}
