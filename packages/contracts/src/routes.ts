/** Every HTTP path the local server exposes lives under this prefix. */
export const apiPrefix = '/api';

/** Paths relative to {@link apiPrefix}. The server registers these inside its /api plugin. */
export const apiPaths = {
  status: '/status',
  sessions: '/sessions',
  session: '/sessions/:id',
  sessionStop: '/sessions/:id/stop',
  sessionDiscard: '/sessions/:id/discard',
  sessionApproval: '/sessions/:id/approvals/:approvalId',
  sessionMessages: '/sessions/:id/messages',
  sessionChanges: '/sessions/:id/changes',
  sessionChangesDiff: '/sessions/:id/changes/diff',
  events: '/events',
  jiraConnection: '/jira/connection',
  jiraProjects: '/jira/projects',
  githubConnection: '/github/connection',
  preferences: '/preferences',
  repositories: '/repositories',
  repository: '/repositories/:id',
  folderPicker: '/folder-picker',
  inbox: '/inbox',
  inboxRefresh: '/inbox/refresh',
  inboxCache: '/inbox/cache',
  tickets: '/tickets',
  ticketsSprints: '/tickets/sprints',
  ticketsChoice: '/tickets/choice',
  claudeLogin: '/claude/login',
  claudeLoginCheck: '/claude/login/check',
  search: '/search',
} as const;

type ApiPaths = typeof apiPaths;

/** Full paths the browser calls. */
export const apiRoutes = {
  status: `${apiPrefix}${apiPaths.status}`,
  sessions: `${apiPrefix}${apiPaths.sessions}`,
  session: `${apiPrefix}${apiPaths.session}`,
  sessionStop: `${apiPrefix}${apiPaths.sessionStop}`,
  sessionDiscard: `${apiPrefix}${apiPaths.sessionDiscard}`,
  sessionApproval: `${apiPrefix}${apiPaths.sessionApproval}`,
  sessionMessages: `${apiPrefix}${apiPaths.sessionMessages}`,
  sessionChanges: `${apiPrefix}${apiPaths.sessionChanges}`,
  sessionChangesDiff: `${apiPrefix}${apiPaths.sessionChangesDiff}`,
  events: `${apiPrefix}${apiPaths.events}`,
  jiraConnection: `${apiPrefix}${apiPaths.jiraConnection}`,
  jiraProjects: `${apiPrefix}${apiPaths.jiraProjects}`,
  githubConnection: `${apiPrefix}${apiPaths.githubConnection}`,
  preferences: `${apiPrefix}${apiPaths.preferences}`,
  repositories: `${apiPrefix}${apiPaths.repositories}`,
  repository: `${apiPrefix}${apiPaths.repository}`,
  folderPicker: `${apiPrefix}${apiPaths.folderPicker}`,
  inbox: `${apiPrefix}${apiPaths.inbox}`,
  inboxRefresh: `${apiPrefix}${apiPaths.inboxRefresh}`,
  inboxCache: `${apiPrefix}${apiPaths.inboxCache}`,
  tickets: `${apiPrefix}${apiPaths.tickets}`,
  ticketsSprints: `${apiPrefix}${apiPaths.ticketsSprints}`,
  ticketsChoice: `${apiPrefix}${apiPaths.ticketsChoice}`,
  claudeLogin: `${apiPrefix}${apiPaths.claudeLogin}`,
  claudeLoginCheck: `${apiPrefix}${apiPaths.claudeLoginCheck}`,
  search: `${apiPrefix}${apiPaths.search}`,
} as const satisfies { [K in keyof ApiPaths]: `${typeof apiPrefix}${ApiPaths[K]}` };

export type ApiRoute = (typeof apiRoutes)[keyof typeof apiRoutes];

/** Header that carries the per-start session token on every /api request. */
export const tokenHeader = 'x-devhub-token';

/** Query parameter that carries the token for the event stream, because EventSource cannot set headers. */
export const tokenQueryParam = 'token';
