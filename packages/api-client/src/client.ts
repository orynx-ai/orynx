import axios, { type AxiosInstance } from 'axios';
import {
  tokenHeader,
  type GitHubConnection,
  type GitHubConnectionRequest,
  type JiraConnection,
  type JiraConnectionRequest,
  type ServerEvent,
  type SessionList,
  type SessionListQuery,
  type Status,
} from '@devhub/contracts';
import { deleteGitHubConnection, getGitHubConnection, putGitHubConnection } from './endpoints/github.ts';
import { deleteJiraConnection, getJiraConnection, putJiraConnection } from './endpoints/jira.ts';
import { getSessions } from './endpoints/sessions.ts';
import { getStatus } from './endpoints/status.ts';
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
  /** The saved way of connecting GitHub, whether `.env` holds a GitHub token, and whether gh was found. */
  githubConnection(): Promise<GitHubConnection>;
  /** Gets a token the way asked, checks it with GitHub, then saves; rejects like {@link connectJira}. */
  connectGitHub(request: GitHubConnectionRequest): Promise<GitHubConnection>;
  disconnectGitHub(): Promise<void>;
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
    githubConnection: () =>
      getGitHubConnection(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    connectGitHub: (request) =>
      putGitHubConnection(http, request).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
    disconnectGitHub: () =>
      deleteGitHubConnection(http).catch((error: unknown) => Promise.reject(toApiRequestError(error))),
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
