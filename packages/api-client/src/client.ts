import axios, { type AxiosInstance } from 'axios';
import {
  tokenHeader,
  type AddRepositoryRequest,
  type ClaudeLogin,
  type GitHubConnection,
  type GitHubConnectionRequest,
  type Inbox,
  type JiraConnection,
  type JiraConnectionRequest,
  type JiraProjectList,
  type Preferences,
  type PreferencesChange,
  type Repository,
  type RepositoryId,
  type RepositoryList,
  type SearchIndex,
  type ServerEvent,
  type SessionList,
  type SessionListQuery,
  type Status,
  type Tickets,
} from '@devhub/contracts';
import { getClaudeLogin, postClaudeLoginCheck } from './endpoints/claude.ts';
import { deleteGitHubConnection, getGitHubConnection, putGitHubConnection } from './endpoints/github.ts';
import { deleteInboxCache, getInbox, postInboxRefresh } from './endpoints/inbox.ts';
import { deleteJiraConnection, getJiraConnection, getJiraProjects, putJiraConnection } from './endpoints/jira.ts';
import { getPreferences, patchPreferences } from './endpoints/preferences.ts';
import { deleteRepository, getRepositories, postRepository } from './endpoints/repositories.ts';
import { getSearch } from './endpoints/search.ts';
import { getSessions } from './endpoints/sessions.ts';
import { getStatus } from './endpoints/status.ts';
import { getTickets } from './endpoints/tickets.ts';
import { toApiRequestError } from './errors.ts';
import { subscribeToEvents, type EventSourceConstructor } from './events.ts';

export interface ApiClientOptions {
  /** Origin of the page; /api paths resolve against it (Vite proxies them in dev). */
  baseURL: string;
  /** The per-start session token from <meta name="devhub-token">. */
  token: string;
  /** Called on any 401, which means the server restarted and this page holds an old token. */
  onUnauthorized?: () => void;
  EventSource?: EventSourceConstructor;
}

export interface ApiClient {
  readonly http: AxiosInstance;
  status(): Promise<Status>;
  /** Sessions with the newest activity first; leave `limit` out for all of them. */
  sessions(query?: SessionListQuery): Promise<SessionList>;
  /** The saved Jira site and email, and whether `.env` holds a Jira token. */
  jiraConnection(): Promise<JiraConnection>;
  /** Checks with Jira, then saves; rejects with integration_rejected, integration_unreachable or keychain_unavailable. */
  connectJira(request: JiraConnectionRequest): Promise<JiraConnection>;
  disconnectJira(): Promise<void>;
  /** The projects the saved Jira connection can see; rejects like {@link connectJira}, or bad_request when not connected. */
  jiraProjects(): Promise<JiraProjectList>;
  /** The saved way of connecting GitHub, whether `.env` holds a GitHub token, and whether gh was found. */
  githubConnection(): Promise<GitHubConnection>;
  /** Gets a token the way asked, checks it with GitHub, then saves; rejects like {@link connectJira}. */
  connectGitHub(request: GitHubConnectionRequest): Promise<GitHubConnection>;
  disconnectGitHub(): Promise<void>;
  /** Settings › Coding agent and Inbox rules, with the default for anything never chosen. */
  preferences(): Promise<Preferences>;
  /** Saves one change and returns every preference. */
  changePreferences(change: PreferencesChange): Promise<Preferences>;
  /** Settings › Repositories, in the order the folders were added. */
  repositories(): Promise<RepositoryList>;
  /** Checks the folder on disk, then saves it; rejects with folder_rejected and the message for the Folder field. */
  addRepository(request: AddRepositoryRequest): Promise<Repository>;
  /** Forgets the folder; nothing on disk changes. */
  removeRepository(id: RepositoryId): Promise<void>;
  /** Home's "Needs your attention" list, from the server's cache. */
  inbox(): Promise<Inbox>;
  /** Syncs the inbox now; resolves once the sync has ended. */
  refreshInbox(): Promise<void>;
  /** Empties the inbox's cache; the server syncs again on its own. */
  clearInboxCache(): Promise<void>;
  /** Tickets' sprint and its tickets, from the server's cache (spec 008). It syncs with the inbox. */
  tickets(): Promise<Tickets>;
  /** Claude Code's login on this computer, as the server last checked it (spec 010). */
  claudeLogin(): Promise<ClaudeLogin>;
  /** Check again: the server asks Claude Code now, or shares a check that's running. */
  checkClaudeLogin(): Promise<ClaudeLogin>;
  /** Everything ⌘K search can find, from the server's cache and sessions (spec 009). */
  search(): Promise<SearchIndex>;
  /** Opens the live event stream; returns a function that closes it. */
  subscribe(onEvent: (event: ServerEvent) => void, onError?: () => void): () => void;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const http = axios.create({
    baseURL: options.baseURL,
    headers: { [tokenHeader]: options.token },
    // Longer than the server's slowest answer: GitHub's gh way waits up to 5 s for gh, then 10 s for
    // GitHub. A shorter wait would show "Could not reach the DevHub server" while the server is fine.
    timeout: 20_000,
  });

  http.interceptors.response.use(undefined, (error: unknown) => {
    const apiError = toApiRequestError(error);
    if (apiError.status === 401) options.onUnauthorized?.();
    return Promise.reject(apiError);
  });

  return {
    http,
    status: () => getStatus(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    sessions: (query) => getSessions(http, query).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    jiraConnection: () => getJiraConnection(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    connectJira: (request) =>
      putJiraConnection(http, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    disconnectJira: () =>
      deleteJiraConnection(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    jiraProjects: () => getJiraProjects(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    githubConnection: () =>
      getGitHubConnection(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    connectGitHub: (request) =>
      putGitHubConnection(http, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    disconnectGitHub: () =>
      deleteGitHubConnection(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    preferences: () => getPreferences(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    changePreferences: (change) =>
      patchPreferences(http, change).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    repositories: () => getRepositories(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    addRepository: (request) =>
      postRepository(http, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    removeRepository: (id) =>
      deleteRepository(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    inbox: () => getInbox(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    refreshInbox: () => postInboxRefresh(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    clearInboxCache: () => deleteInboxCache(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    tickets: () => getTickets(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    claudeLogin: () => getClaudeLogin(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    checkClaudeLogin: () =>
      postClaudeLoginCheck(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    search: () => getSearch(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    subscribe: (onEvent, onError) =>
      subscribeToEvents({
        baseURL: options.baseURL,
        token: options.token,
        onEvent,
        ...(onError ? { onError } : {}),
        ...(options.EventSource ? { EventSource: options.EventSource } : {}),
      }),
  };
}
