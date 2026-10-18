import axios, { type AxiosInstance } from 'axios';
import {
  tokenHeader,
  type AddRepositoryRequest,
  type FolderPick,
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
  type UpdateRepositoryRequest,
  type SearchIndex,
  type ServerEvent,
  type ApprovalDecision,
  type FileDiff,
  type SendMessageAnswer,
  type Session,
  type SessionChanges,
  type SessionList,
  type SessionListQuery,
  type StartSessionAnswer,
  type StartSessionRequest,
  type Status,
  type Tickets,
} from '@devhub/contracts';
import { getClaudeLogin, postClaudeLoginCheck } from './endpoints/claude.ts';
import { deleteGitHubConnection, getGitHubConnection, putGitHubConnection } from './endpoints/github.ts';
import { deleteInboxCache, getInbox, postInboxRefresh } from './endpoints/inbox.ts';
import { deleteJiraConnection, getJiraConnection, getJiraProjects, putJiraConnection } from './endpoints/jira.ts';
import { getPreferences, patchPreferences } from './endpoints/preferences.ts';
import {
  deleteRepository,
  getRepositories,
  patchRepository,
  postFolderPicker,
  postRepository,
} from './endpoints/repositories.ts';
import { getSearch } from './endpoints/search.ts';
import {
  getFileDiff,
  getSession,
  getSessionChanges,
  getSessions,
  postApproval,
  postSession,
  postSessionDiscard,
  postSessionMessage,
  postSessionStop,
} from './endpoints/sessions.ts';
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
  /** One session, as the Session screen shows it; rejects with not_found for an unknown id (spec 011). */
  session(id: string): Promise<Session>;
  /** Starts Claude on a ticket, or answers why it can't. */
  startSession(request: StartSessionRequest): Promise<StartSessionAnswer>;
  stopSession(id: string): Promise<void>;
  /** Deletes the session's worktree and branch, stopping it first if it's working. */
  discardSession(id: string): Promise<void>;
  /**
   * Answers a call waiting in a session (spec 012); rejects with already_answered when another answer came
   * first, and settings_unsaved when Always allow couldn't save the list.
   */
  respondToApproval(id: string, approvalId: string, decision: ApprovalDecision): Promise<void>;
  /** A follow-up (spec 013): answers sent, or why it can't go. */
  sendMessage(id: string, text: string): Promise<SendMessageAnswer>;
  /** What changed in the session's worktree (spec 013). */
  sessionChanges(id: string): Promise<SessionChanges>;
  /** One changed file's diff; rejects with not_found for a path that isn't among the changes. */
  sessionDiff(id: string, path: string): Promise<FileDiff>;
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
  /** Changes a folder's path or Jira project in place (spec 020); rejects with folder_rejected or not_found. */
  editRepository(id: RepositoryId, request: UpdateRepositoryRequest): Promise<Repository>;
  removeRepository(id: RepositoryId): Promise<void>;
  /** Opens the computer's folder picker (spec 020); rejects with picker_unavailable where none can open. */
  pickFolder(): Promise<FolderPick>;
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
    session: (id) => getSession(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    startSession: (request) =>
      postSession(http, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    stopSession: (id) => postSessionStop(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    discardSession: (id) =>
      postSessionDiscard(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    respondToApproval: (id, approvalId, decision) =>
      postApproval(http, id, approvalId, decision).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    sendMessage: (id, text) =>
      postSessionMessage(http, id, text).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    sessionChanges: (id) =>
      getSessionChanges(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    sessionDiff: (id, path) =>
      getFileDiff(http, id, path).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
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
    editRepository: (id, request) =>
      patchRepository(http, id, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    removeRepository: (id) =>
      deleteRepository(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    pickFolder: () => postFolderPicker(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
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
