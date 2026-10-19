import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { apiRoutes, type Session, type SessionList } from '@devhub/contracts';
import {
  makeGitHubConnection,
  makeInbox,
  makeJiraConnection,
  makePreferences,
  makeSearchIndex,
  makeSessionList,
  makeStatus,
  makeTickets,
} from '@devhub/contracts/testing';

/** The origin the app under test calls. MSW stands in for the network, nothing else. */
export const testBaseURL = 'http://127.0.0.1:4317';

export function apiUrl(path: string): string {
  return new URL(path, testBaseURL).toString();
}

/**
 * The page of this list (newest first) a GET /api/sessions request asks for, as the server pages it: from
 * after the `cursor`'s row, at most `limit`, with the next page's cursor when more follow (spec 020).
 */
export function sessionsPage(list: SessionList, url: string): SessionList {
  const params = new URL(url).searchParams;
  const cursor = params.get('cursor');
  const start = cursor === null ? 0 : list.sessions.findIndex((session) => cursor.endsWith(`.${session.id}`)) + 1;
  const rest = list.sessions.slice(start);
  const limit = params.get('limit') === null ? rest.length : Number(params.get('limit'));
  const sessions = rest.slice(0, limit);
  const last = sessions.at(-1);
  const more = rest.length > limit && last !== undefined;
  return { sessions, nextCursor: more ? `${String(Date.parse(last.updatedAt))}.${last.id}` : null };
}

/** Answers GET /api/sessions with this list, a page at a time as the server does. */
export function sessionsHandler(list: SessionList) {
  return http.get(apiUrl(apiRoutes.sessions), ({ request }) => HttpResponse.json(sessionsPage(list, request.url)));
}

/** Answers GET /api/sessions/:id with one of these sessions, or 404 as the server does for any other id. */
export function sessionHandler(...sessions: Session[]) {
  return http.get(apiUrl(apiRoutes.session), ({ params }) => {
    const found = sessions.find((session) => session.id === params['id']);
    return found === undefined
      ? HttpResponse.json({ code: 'not_found', message: 'There is no session with this id.' }, { status: 404 })
      : HttpResponse.json(found);
  });
}

/** Default answers for every endpoint; a test overrides one with server.use(...). */
export const server = setupServer(
  http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus())),
  sessionsHandler(makeSessionList([])),
  sessionHandler(),
  // Nothing has changed in a session's worktree yet, and no file has a diff (spec 013).
  http.get(apiUrl(apiRoutes.sessionChanges), () =>
    HttpResponse.json({ state: 'ready', files: [], moreFiles: 0, added: 0, removed: 0 }),
  ),
  http.get(apiUrl(apiRoutes.sessionChangesDiff), () =>
    HttpResponse.json({ code: 'not_found', message: 'That file isn’t among this session’s changes.' }, { status: 404 }),
  ),
  http.get(apiUrl(apiRoutes.jiraConnection), () => HttpResponse.json(makeJiraConnection())),
  http.get(apiUrl(apiRoutes.githubConnection), () => HttpResponse.json(makeGitHubConnection())),
  http.get(apiUrl(apiRoutes.preferences), () => HttpResponse.json(makePreferences())),
  http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: [] })),
  http.get(apiUrl(apiRoutes.jiraProjects), () => HttpResponse.json({ projects: [] })),
  // Nothing connected yet, so nothing needs you.
  http.get(apiUrl(apiRoutes.inbox), () =>
    HttpResponse.json(
      makeInbox({ tools: { jira: { state: 'not_connected' }, github: { state: 'not_connected' } }, syncedAt: null }),
    ),
  ),
  http.get(apiUrl(apiRoutes.tickets), () =>
    HttpResponse.json(makeTickets({ jira: { state: 'not_connected' }, sprint: null, tickets: [] })),
  ),
  // Claude Code isn't signed in, as the default status says.
  http.get(apiUrl(apiRoutes.claudeLogin), () => HttpResponse.json({ state: 'signed_out' })),
  http.post(apiUrl(apiRoutes.claudeLoginCheck), () => HttpResponse.json({ state: 'signed_out' })),
  // Signed out, Claude offers no models.
  http.get(apiUrl(apiRoutes.agentModels), () => HttpResponse.json({ state: 'unavailable' })),
  http.get(apiUrl(apiRoutes.search), () =>
    HttpResponse.json(
      makeSearchIndex({ tools: { jira: { state: 'not_connected' }, github: { state: 'not_connected' } } }),
    ),
  ),
);
