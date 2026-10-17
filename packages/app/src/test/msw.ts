import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { apiRoutes, type SessionList } from '@devhub/contracts';
import { makeGitHubConnection, makeJiraConnection, makeSessionList, makeStatus } from '@devhub/contracts/testing';

/** The origin the app under test calls. MSW stands in for the network, nothing else. */
export const testBaseURL = 'http://127.0.0.1:4317';

export function apiUrl(path: string): string {
  return new URL(path, testBaseURL).toString();
}

/** Answers GET /api/sessions with this list, keeping only the first `limit` the way the server does. */
export function sessionsHandler(list: SessionList) {
  return http.get(apiUrl(apiRoutes.sessions), ({ request }) => {
    const limit = new URL(request.url).searchParams.get('limit');
    return HttpResponse.json({ sessions: limit === null ? list.sessions : list.sessions.slice(0, Number(limit)) });
  });
}

/** Default answers for every endpoint; a test overrides one with server.use(...). */
export const server = setupServer(
  http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus())),
  sessionsHandler(makeSessionList([])),
  http.get(apiUrl(apiRoutes.jiraConnection), () => HttpResponse.json(makeJiraConnection())),
  http.get(apiUrl(apiRoutes.githubConnection), () => HttpResponse.json(makeGitHubConnection())),
);
