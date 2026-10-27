// GitHub's releases for Orynx, an outside service, faked for the e2e run (spec 045). Every hub asks here through
// DEVHUB_RELEASES_URL, so no run reaches api.github.com: the hubs with fakes get no release from preload.ts inside
// their own process, and the others these two from this file, run as its own server (playwright.config.ts).
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

/** Its own port, away from the hubs (43xx, even) and their control ports (one below each). */
export const fakeReleasesPort = 4374;
export const fakeReleasesUrl = `http://127.0.0.1:${String(fakeReleasesPort)}/repos/orynx-ai/orynx/releases`;

/**
 * Two releases, newest first, as GitHub's REST API answers: 0.1.40 with notes and 0.1.39 with none. A clone started
 * by hand from this repo has no release tag in its history on CI, so both are newer than it.
 */
export const fakeReleases = [
  {
    tag_name: 'v0.1.40',
    body: '## New\n\n- Show the inbox tabs\n\n## Fixed\n\n- Keep the branch on delete',
    draft: false,
    prerelease: false,
    published_at: '2026-10-22T10:00:00Z',
    html_url: 'https://github.com/orynx-ai/orynx/releases/tag/v0.1.40',
  },
  {
    tag_name: 'v0.1.39',
    body: null,
    draft: false,
    prerelease: false,
    published_at: '2026-10-20T10:00:00Z',
    html_url: 'https://github.com/orynx-ai/orynx/releases/tag/v0.1.39',
  },
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer((request, response) => {
    if (request.method === 'GET' && request.url?.startsWith('/repos/orynx-ai/orynx/releases') === true) {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(fakeReleases));
      return;
    }
    // Playwright waits for this before it starts the hubs.
    response.writeHead(request.url === '/' ? 200 : 404).end();
  }).listen(fakeReleasesPort, '127.0.0.1');
}
