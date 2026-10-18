/** Every HTTP path the local server exposes lives under this prefix. */
export const apiPrefix = '/api';

/** Paths relative to {@link apiPrefix}. The server registers these inside its /api plugin. */
export const apiPaths = {
  status: '/status',
  sessions: '/sessions',
  events: '/events',
  jiraConnection: '/jira/connection',
  jiraProjects: '/jira/projects',
  githubConnection: '/github/connection',
  preferences: '/preferences',
  repositories: '/repositories',
  repository: '/repositories/:id',
  inbox: '/inbox',
  inboxRefresh: '/inbox/refresh',
  inboxCache: '/inbox/cache',
  tickets: '/tickets',
  claudeLogin: '/claude/login',
  claudeLoginCheck: '/claude/login/check',
} as const;

type ApiPaths = typeof apiPaths;

/** Full paths the browser calls. */
export const apiRoutes = {
  status: `${apiPrefix}${apiPaths.status}`,
  sessions: `${apiPrefix}${apiPaths.sessions}`,
  events: `${apiPrefix}${apiPaths.events}`,
  jiraConnection: `${apiPrefix}${apiPaths.jiraConnection}`,
  jiraProjects: `${apiPrefix}${apiPaths.jiraProjects}`,
  githubConnection: `${apiPrefix}${apiPaths.githubConnection}`,
  preferences: `${apiPrefix}${apiPaths.preferences}`,
  repositories: `${apiPrefix}${apiPaths.repositories}`,
  repository: `${apiPrefix}${apiPaths.repository}`,
  inbox: `${apiPrefix}${apiPaths.inbox}`,
  inboxRefresh: `${apiPrefix}${apiPaths.inboxRefresh}`,
  inboxCache: `${apiPrefix}${apiPaths.inboxCache}`,
  tickets: `${apiPrefix}${apiPaths.tickets}`,
  claudeLogin: `${apiPrefix}${apiPaths.claudeLogin}`,
  claudeLoginCheck: `${apiPrefix}${apiPaths.claudeLoginCheck}`,
} as const satisfies { [K in keyof ApiPaths]: `${typeof apiPrefix}${ApiPaths[K]}` };

export type ApiRoute = (typeof apiRoutes)[keyof typeof apiRoutes];

/** Header that carries the per-start session token on every /api request. */
export const tokenHeader = 'x-devhub-token';

/** Query parameter that carries the token for the event stream, because EventSource cannot set headers. */
export const tokenQueryParam = 'token';
