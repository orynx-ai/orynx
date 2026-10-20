import axios, { type AxiosInstance } from 'axios';
import {
  tokenHeader,
  type AddRepositoryRequest,
  type FileCheckAnswer,
  type FileCheckRequest,
  type FilePicks,
  type FolderPick,
  type AgentModels,
  type ClaudeLogin,
  type ConnectionCheck,
  type GitHubConnection,
  type GitHubConnectionRequest,
  type Inbox,
  type InboxSource,
  type JiraConnection,
  type JiraConnectionRequest,
  type JiraProjectList,
  type MarkNotificationsRead,
  type NotificationList,
  type NotificationSettings,
  type NotificationSettingsChange,
  type Preferences,
  type PreferencesChange,
  type Repository,
  type RepositoryId,
  type RepositoryList,
  type OrynxSkillList,
  type ReadySkill,
  type SaveSkillRequest,
  type SkillFolder,
  type UpdateRepositoryRequest,
  type SearchIndex,
  type ServerEvent,
  type ApprovalDecision,
  type CreatePullRequestAnswer,
  type CreatePullRequestRequest,
  type FileDiff,
  type PullRequestDraftAnswer,
  type PushAnswer,
  type PushDraftAnswer,
  type SendMessageAnswer,
  type SendMessageInput,
  type AddTerminalTabAnswer,
  type ClaudeCommandList,
  type TerminalOutput,
  type TerminalSize,
  type Session,
  type Terminal,
  type SessionBrief,
  type SessionChanges,
  type SessionList,
  type SessionListQuery,
  type StartSessionAnswer,
  type StartSessionRequest,
  type Status,
  type OpenSprints,
  type SkillList,
  type SyncActivity,
  type SyncActivityQuery,
  type TicketDetailAnswer,
  type Tickets,
  type TicketsChoice,
} from '@devhub/contracts';
import { getAgentModels, getClaudeLogin, postClaudeLoginCheck } from './endpoints/claude.ts';
import {
  deleteGitHubConnection,
  getGitHubConnection,
  postGitHubConnectionCheck,
  putGitHubConnection,
} from './endpoints/github.ts';
import { deleteInboxCache, getInbox, postInboxRefresh } from './endpoints/inbox.ts';
import { getSyncActivity } from './endpoints/sync-activity.ts';
import {
  deleteJiraConnection,
  getJiraConnection,
  getJiraProjects,
  postJiraConnectionCheck,
  putJiraConnection,
} from './endpoints/jira.ts';
import {
  getNotifications,
  getNotificationSettings,
  patchNotificationSettings,
  postNotificationsRead,
} from './endpoints/notifications.ts';
import { getPreferences, patchPreferences } from './endpoints/preferences.ts';
import {
  deleteRepository,
  getRepositories,
  patchRepository,
  postFolderPicker,
  postRepository,
} from './endpoints/repositories.ts';
import {
  deleteOrynxSkill,
  getOrynxSkills,
  postOrynxSkill,
  postStarterSkills,
  putOrynxSkill,
} from './endpoints/orynx-skills.ts';
import { getSearch } from './endpoints/search.ts';
import {
  getFileDiff,
  getSession,
  getSessionBrief,
  getSessionChanges,
  getSessions,
  postApproval,
  postPullRequest,
  postPullRequestDraft,
  postPush,
  postPushDraft,
  postSession,
  postSessionDiscard,
  postSessionMessage,
  postSessionStop,
} from './endpoints/sessions.ts';
import { getStatus } from './endpoints/status.ts';
import { getTicket, getTickets, getTicketsSprints, putTicketsChoice } from './endpoints/tickets.ts';
import { postFileCheck, postFilePicker } from './endpoints/files.ts';
import { getSkills } from './endpoints/skills.ts';
import {
  deleteTerminalTab,
  getSessionCommands,
  getTerminal,
  postTerminalInput,
  postTerminalSize,
  postTerminalTab,
} from './endpoints/terminal.ts';
import { toApiRequestError } from './errors.ts';
import { subscribeToEvents, subscribeToTerminalOutput, type EventSourceConstructor } from './events.ts';

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
  /** Starts Claude on a ticket (Ship) or from the composer (spec 015), or answers why it can't. */
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
  sendMessage(id: string, request: SendMessageInput): Promise<SendMessageAnswer>;
  /** Exactly what Orynx sent Claude at the start (spec 011, Q5); text null before anything was sent. */
  sessionBrief(id: string): Promise<SessionBrief>;
  /** What changed in the session's worktree (spec 013). */
  sessionChanges(id: string): Promise<SessionChanges>;
  /** One changed file's diff; rejects with not_found for a path that isn't among the changes. */
  sessionDiff(id: string, path: string): Promise<FileDiff>;
  /** Every command Claude ran in the session, with its output, for the Terminal's Claude tab (spec 036). */
  sessionCommands(id: string): Promise<ClaudeCommandList>;
  /** Your shell tabs in the session's Terminal; rejects with not_found for a session that has none (spec 036). */
  terminal(id: string): Promise<Terminal>;
  addTerminalTab(id: string): Promise<AddTerminalTabAnswer>;
  closeTerminalTab(id: string, tabId: string): Promise<void>;
  /** Types into a shell tab: keys you pressed or text you pasted (spec 038). */
  terminalInput(id: string, tabId: string, data: string): Promise<void>;
  /** Sets a shell tab's size in characters (spec 038). */
  resizeTerminal(id: string, tabId: string, size: TerminalSize): Promise<void>;
  /** Opens a shell tab's output, replay first (spec 038). Returns a function that closes it. */
  terminalOutput(
    id: string,
    tabId: string,
    onOutput: (frame: TerminalOutput) => void,
    onError?: () => void,
  ): () => void;
  /** Claude's draft of the pull request, or why there can't be one (spec 014). Each call asks Claude. */
  draftPullRequest(id: string): Promise<PullRequestDraftAnswer>;
  /** Commits, pushes and opens the pull request as you left it: opened, cannot, or failed with why (spec 014). */
  createPullRequest(id: string, request: CreatePullRequestRequest): Promise<CreatePullRequestAnswer>;
  /** Claude's commit message for what's new since the last push, nothing new, or why not (spec 014, Q7). */
  draftPush(id: string): Promise<PushDraftAnswer>;
  /** Commits what's new and pushes it to the pull request with your message (spec 014, Q7). */
  pushChanges(id: string, message: string): Promise<PushAnswer>;
  /** The saved Jira site and email, and whether `.env` holds a Jira token. */
  jiraConnection(): Promise<JiraConnection>;
  /** Checks with Jira, then saves; rejects with integration_rejected, integration_unreachable or keychain_unavailable. */
  connectJira(request: JiraConnectionRequest): Promise<JiraConnection>;
  disconnectJira(): Promise<void>;
  /** Test connection and Reconnect: Jira asked now, and how long it took (spec 030); bad_request when not connected. */
  checkJiraConnection(): Promise<ConnectionCheck>;
  /** The projects the saved Jira connection can see; rejects like {@link connectJira}, or bad_request when not connected. */
  jiraProjects(): Promise<JiraProjectList>;
  /** The saved way of connecting GitHub, whether `.env` holds a GitHub token, and whether gh was found. */
  githubConnection(): Promise<GitHubConnection>;
  /** Gets a token the way asked, checks it with GitHub, then saves; rejects like {@link connectJira}. */
  connectGitHub(request: GitHubConnectionRequest): Promise<GitHubConnection>;
  disconnectGitHub(): Promise<void>;
  /** Test connection and Reconnect: gh and GitHub asked now, and how long it took (spec 030). */
  checkGitHubConnection(): Promise<ConnectionCheck>;
  /** Settings › Coding agent and Inbox rules, with the default for anything never chosen. */
  preferences(): Promise<Preferences>;
  /** Saves one change and returns every preference. */
  changePreferences(change: PreferencesChange): Promise<Preferences>;
  /** The bell's list, newest first, with the unread and waiting counts (spec 029). */
  notifications(): Promise<NotificationList>;
  /** Marks some notifications read, or all of them. */
  markNotificationsRead(request: MarkNotificationsRead): Promise<void>;
  /** Settings › Notifications, with the default for anything never chosen. */
  notificationSettings(): Promise<NotificationSettings>;
  /** Saves one change and returns every setting. */
  changeNotificationSettings(change: NotificationSettingsChange): Promise<NotificationSettings>;
  /** Settings › Repositories, in the order the folders were added. */
  repositories(): Promise<RepositoryList>;
  /** Checks the folder on disk, then saves it; rejects with folder_rejected and the message for the Folder field. */
  addRepository(request: AddRepositoryRequest): Promise<Repository>;
  /** Changes a folder's path or Jira project in place (spec 020); rejects with folder_rejected or not_found. */
  editRepository(id: RepositoryId, request: UpdateRepositoryRequest): Promise<Repository>;
  /** Forgets the folder; nothing on disk changes. */
  removeRepository(id: RepositoryId): Promise<void>;
  /** Opens the computer's folder picker (spec 020); rejects with picker_unavailable where none can open. */
  pickFolder(): Promise<FolderPick>;
  /** Opens the computer's file picker, several files at once (spec 022). */
  pickFiles(): Promise<FilePicks>;
  /** Checks a typed path is a file Claude can read (spec 022). */
  checkFile(request: FileCheckRequest): Promise<FileCheckAnswer>;
  /** Settings › Skills (spec 023): your own skills by Name, and the plugin folder they live in. */
  orynxSkills(): Promise<OrynxSkillList>;
  /** Writes a new skill; rejects with skill_rejected and the words for Name when its folder is taken. */
  addOrynxSkill(request: SaveSkillRequest): Promise<ReadySkill>;
  /** Saves a skill, moving its folder on a rename; rejects with skill_rejected, or not_found when it went. */
  saveOrynxSkill(folder: SkillFolder, request: SaveSkillRequest): Promise<ReadySkill>;
  removeOrynxSkill(folder: SkillFolder): Promise<void>;
  /** Adds the four starter skills whose folders are free. */
  addStarterSkills(): Promise<void>;
  /** Home's "Needs your attention" list, from the server's cache. */
  inbox(): Promise<Inbox>;
  /** Syncs the inbox now, or one tool of it (spec 035); resolves once the sync has ended. */
  refreshInbox(tool?: InboxSource): Promise<void>;
  /** The sync log for the Sync activity modal (spec 035), from the server's cache. */
  syncActivity(query: SyncActivityQuery): Promise<SyncActivity>;
  /** Empties the inbox's cache; the server syncs again on its own. */
  clearInboxCache(): Promise<void>;
  /** Tickets' sprint and its tickets, from the server's cache (spec 008). It syncs with the inbox. */
  tickets(): Promise<Tickets>;
  /** A project's open sprints for Tickets' Sprint menu (spec 020), asked of Jira now. */
  ticketsSprints(project: string): Promise<OpenSprints>;
  /** Saves which sprint Tickets shows (spec 020). */
  chooseTicketsSprint(choice: TicketsChoice): Promise<void>;
  /** One ticket in full for the ticket dialog (spec 022), asked of Jira now, or why there's none. */
  ticket(key: string): Promise<TicketDetailAnswer>;
  /** The composer's skills for a folder, or yours alone (spec 022). */
  skills(repositoryId: string | null): Promise<SkillList>;
  /** Claude Code's login on this computer, as the server last checked it (spec 010). */
  claudeLogin(): Promise<ClaudeLogin>;
  /** Check again: the server asks Claude Code now, or shares a check that's running. */
  checkClaudeLogin(): Promise<ClaudeLogin>;
  /** The models Claude offers now, with their effort levels, for the composer's agent picker. */
  agentModels(): Promise<AgentModels>;
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
    sendMessage: (id, request) =>
      postSessionMessage(http, id, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    sessionBrief: (id) => getSessionBrief(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    sessionChanges: (id) =>
      getSessionChanges(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    sessionDiff: (id, path) =>
      getFileDiff(http, id, path).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    sessionCommands: (id) =>
      getSessionCommands(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    terminal: (id) => getTerminal(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    addTerminalTab: (id) =>
      postTerminalTab(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    closeTerminalTab: (id, tabId) =>
      deleteTerminalTab(http, id, tabId).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    terminalInput: (id, tabId, data) =>
      postTerminalInput(http, id, tabId, data).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    resizeTerminal: (id, tabId, size) =>
      postTerminalSize(http, id, tabId, size).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    terminalOutput: (id, tabId, onOutput, onError) =>
      subscribeToTerminalOutput({
        baseURL: options.baseURL,
        token: options.token,
        id,
        tabId,
        onOutput,
        ...(onError ? { onError } : {}),
        ...(options.EventSource ? { EventSource: options.EventSource } : {}),
      }),
    draftPullRequest: (id) =>
      postPullRequestDraft(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    createPullRequest: (id, request) =>
      postPullRequest(http, id, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    draftPush: (id) => postPushDraft(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    pushChanges: (id, message) =>
      postPush(http, id, message).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    jiraConnection: () => getJiraConnection(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    connectJira: (request) =>
      putJiraConnection(http, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    disconnectJira: () =>
      deleteJiraConnection(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    checkJiraConnection: () =>
      postJiraConnectionCheck(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    jiraProjects: () => getJiraProjects(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    githubConnection: () =>
      getGitHubConnection(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    connectGitHub: (request) =>
      putGitHubConnection(http, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    disconnectGitHub: () =>
      deleteGitHubConnection(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    checkGitHubConnection: () =>
      postGitHubConnectionCheck(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    preferences: () => getPreferences(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    changePreferences: (change) =>
      patchPreferences(http, change).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    notifications: () => getNotifications(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    markNotificationsRead: (request) =>
      postNotificationsRead(http, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    notificationSettings: () =>
      getNotificationSettings(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    changeNotificationSettings: (change) =>
      patchNotificationSettings(http, change).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    repositories: () => getRepositories(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    addRepository: (request) =>
      postRepository(http, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    editRepository: (id, request) =>
      patchRepository(http, id, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    removeRepository: (id) =>
      deleteRepository(http, id).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    pickFolder: () => postFolderPicker(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    pickFiles: () => postFilePicker(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    checkFile: (request) =>
      postFileCheck(http, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    orynxSkills: () => getOrynxSkills(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    addOrynxSkill: (request) =>
      postOrynxSkill(http, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    saveOrynxSkill: (folder, request) =>
      putOrynxSkill(http, folder, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    removeOrynxSkill: (folder) =>
      deleteOrynxSkill(http, folder).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    addStarterSkills: () => postStarterSkills(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    inbox: () => getInbox(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    refreshInbox: (tool) =>
      postInboxRefresh(http, tool).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    syncActivity: (query) =>
      getSyncActivity(http, query).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    clearInboxCache: () => deleteInboxCache(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    tickets: () => getTickets(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    ticketsSprints: (project) =>
      getTicketsSprints(http, project).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    chooseTicketsSprint: (choice) =>
      putTicketsChoice(http, choice).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    ticket: (key) => getTicket(http, key).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    skills: (repositoryId) =>
      getSkills(http, repositoryId).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    claudeLogin: () => getClaudeLogin(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    checkClaudeLogin: () =>
      postClaudeLoginCheck(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    agentModels: () => getAgentModels(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
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
