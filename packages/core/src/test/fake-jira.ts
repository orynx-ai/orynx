import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

/** A site, email and token Jira Cloud accepts in these tests. */
export const jiraSite = 'your-team.atlassian.net';
export const jiraEmail = 'dev@example.com';
export const goodToken = 'fake-good-token';
/** What `Authorization: Basic …` carries for the good email and token; it must never be logged either. */
export const goodBasicValue = Buffer.from(`${jiraEmail}:${goodToken}`).toString('base64');

export const myselfUrl = (site: string = jiraSite) => `https://${site}/rest/api/3/myself`;
export const projectSearchUrl = (site: string = jiraSite) => `https://${site}/rest/api/3/project/search`;

const refused = () =>
  HttpResponse.json(
    { errorMessages: ['Client must be authenticated to access this resource.'] },
    { status: 401, headers: { 'X-Seraph-LoginReason': 'AUTHENTICATED_FAILED' } },
  );

/** Jira's /myself as Atlassian answers it: the user for good credentials, 401 otherwise. */
export function acceptingMyself(site: string = jiraSite) {
  return http.get(myselfUrl(site), ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    return HttpResponse.json({ accountId: '5b10ac8d82e05b22cc7d4ef5', displayName: 'Dev Example', active: true });
  });
}

/**
 * Jira's paged project search as Atlassian answers it, for the good credentials: `startAt` and
 * `maxResults` pick the page, and `isLast` says whether more follow.
 */
export function acceptingProjectSearch(projects: readonly { key: string; name: string }[], site: string = jiraSite) {
  return http.get(projectSearchUrl(site), ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    const params = new URL(request.url).searchParams;
    const startAt = Number(params.get('startAt') ?? 0);
    const maxResults = Number(params.get('maxResults') ?? 50);
    const values = projects.slice(startAt, startAt + maxResults);
    return HttpResponse.json({
      startAt,
      maxResults,
      total: projects.length,
      isLast: startAt + values.length >= projects.length,
      values: values.map((project, index) => ({ id: String(10_000 + startAt + index), ...project })),
    });
  });
}

/**
 * MSW standing in for Jira Cloud, an outside service, for the test file that calls this. It answers
 * /myself on the test site and fails any other request, so no test can reach the real internet.
 */
export function useFakeJira() {
  const server = setupServer(acceptingMyself());
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
