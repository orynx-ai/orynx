/** Every HTTP path the local server exposes lives under this prefix. */
export const apiPrefix = '/api';

/** Paths relative to {@link apiPrefix}. The server registers these inside its /api plugin. */
export const apiPaths = {
  status: '/status',
  sessions: '/sessions',
  events: '/events',
  jiraConnection: '/jira/connection',
  githubConnection: '/github/connection',
} as const;

type ApiPaths = typeof apiPaths;

/** Full paths the browser calls. */
export const apiRoutes = {
  status: `${apiPrefix}${apiPaths.status}`,
  sessions: `${apiPrefix}${apiPaths.sessions}`,
  events: `${apiPrefix}${apiPaths.events}`,
  jiraConnection: `${apiPrefix}${apiPaths.jiraConnection}`,
  githubConnection: `${apiPrefix}${apiPaths.githubConnection}`,
} as const satisfies { [K in keyof ApiPaths]: `${typeof apiPrefix}${ApiPaths[K]}` };

export type ApiRoute = (typeof apiRoutes)[keyof typeof apiRoutes];

/** Header that carries the per-start session token on every /api request. */
export const tokenHeader = 'x-devhub-token';

/** Query parameter that carries the token for the event stream, because EventSource cannot set headers. */
export const tokenQueryParam = 'token';
