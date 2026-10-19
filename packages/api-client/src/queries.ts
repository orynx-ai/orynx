import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { SessionListQuery } from '@devhub/contracts';
import type { ApiClient } from './client.ts';

/** One key per resource. Server events invalidate by these keys (learn/live-updates.md). */
export const queryKeys = {
  status: ['status'] as const,
  /** Every session list starts with this key, so one invalidation refreshes them all. */
  sessions: ['sessions'] as const,
  jiraConnection: ['jira', 'connection'] as const,
  jiraProjects: ['jira', 'projects'] as const,
  githubConnection: ['github', 'connection'] as const,
  preferences: ['preferences'] as const,
  repositories: ['repositories'] as const,
  inbox: ['inbox'] as const,
  tickets: ['tickets'] as const,
  /** Not under `tickets`, so a sync's inbox.changed never asks Jira for a project's sprints again. */
  ticketsSprints: ['jira', 'sprints'] as const,
  /** One ticket in full (spec 022); not under `tickets` either, for the same reason. */
  ticket: ['jira', 'ticket'] as const,
  claudeLogin: ['claude', 'login'] as const,
  search: ['search'] as const,
};

export function statusQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.status,
    queryFn: () => api.status(),
    // Freshness comes from the event stream (status.changed), not from polling.
    staleTime: Infinity,
  });
}

export function sessionsQueryOptions(api: ApiClient, query: SessionListQuery = {}) {
  return queryOptions({
    queryKey: [...queryKeys.sessions, query] as const,
    queryFn: () => api.sessions(query),
    // Freshness comes from the event stream (sessions.changed), not from polling.
    staleTime: Infinity,
  });
}

/**
 * Sessions a page at a time, each page starting where the last one's `nextCursor` says (spec 020: the
 * sidebar's infinite list). A `sessions.changed` refetch reads the pages again in order from the first, so
 * each cursor comes from fresh data and a session that moved to the top shows once.
 */
export function sessionPagesQueryOptions(api: ApiClient, query: Omit<SessionListQuery, 'cursor'> = {}) {
  return infiniteQueryOptions({
    queryKey: [...queryKeys.sessions, 'pages', query] as const,
    queryFn: ({ pageParam }) => api.sessions(pageParam === null ? query : { ...query, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Freshness comes from the event stream (sessions.changed), not from polling.
    staleTime: Infinity,
  });
}

/**
 * One session's key, and its query (spec 011). Its key starts with the lists' key, so `sessions.changed` refreshes it too, and
 * `session.changed` refreshes only this one.
 */
export function sessionQueryKey(id: string) {
  return [...queryKeys.sessions, 'detail', id] as const;
}

/**
 * A session's changes (spec 013): under the lists' key, so `sessions.changed` refreshes them, but not under the
 * session's own, so its steps changing doesn't run git. `session.files.changed` refreshes them, diffs included.
 */
export function sessionChangesQueryKey(id: string) {
  return [...queryKeys.sessions, 'changes', id] as const;
}

export function sessionDiffQueryKey(id: string, path: string) {
  return [...sessionChangesQueryKey(id), 'diff', path] as const;
}

export function sessionChangesQueryOptions(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: sessionChangesQueryKey(id),
    queryFn: () => api.sessionChanges(id),
    // Stale at once: coming back to the window refetches, so edits you made in your editor show (Q4).
    staleTime: 0,
  });
}

export function sessionDiffQueryOptions(api: ApiClient, id: string, path: string) {
  return queryOptions({
    queryKey: sessionDiffQueryKey(id, path),
    queryFn: () => api.sessionDiff(id, path),
    staleTime: 0,
  });
}

export function sessionQueryOptions(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: sessionQueryKey(id),
    queryFn: () => api.session(id),
    // Freshness comes from the event stream (session.changed, sessions.changed), not from polling.
    staleTime: Infinity,
  });
}

export function jiraConnectionQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.jiraConnection,
    queryFn: () => api.jiraConnection(),
    // Connect and Disconnect publish status.changed, which refreshes this too.
    staleTime: Infinity,
  });
}

export function githubConnectionQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.githubConnection,
    queryFn: () => api.githubConnection(),
    // Connect and Disconnect publish status.changed, which refreshes this too.
    staleTime: Infinity,
  });
}

export function preferencesQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.preferences,
    queryFn: () => api.preferences(),
    // Every save publishes settings.changed, which refreshes this in every open tab.
    staleTime: Infinity,
  });
}

export function repositoriesQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.repositories,
    queryFn: () => api.repositories(),
    // Every add and remove publishes settings.changed, which refreshes this in every open tab.
    staleTime: Infinity,
  });
}

export function jiraProjectsQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.jiraProjects,
    queryFn: () => api.jiraProjects(),
    // Asked each time the folder dialog or Tickets' Project picker opens (specs 005, 020): nothing is cached.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function inboxQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.inbox,
    queryFn: () => api.inbox(),
    // Freshness comes from the event stream (inbox.changed, settings.changed, status.changed), not from
    // polling: the server syncs on its own every 2 minutes while a page is open.
    staleTime: Infinity,
  });
}

/**
 * A project's open sprints, for Tickets' Sprint menu (spec 020): asked of Jira when the menu needs them,
 * and kept for a minute, so opening the menu again doesn't ask again.
 */
export function ticketsSprintsQueryOptions(api: ApiClient, project: string) {
  return queryOptions({
    queryKey: [...queryKeys.ticketsSprints, project] as const,
    queryFn: () => api.ticketsSprints(project),
    staleTime: 60_000,
  });
}

/**
 * One ticket in full, for the ticket dialog (spec 022, Q8): asked of Jira each time the dialog opens, never on a
 * timer, and not again by itself when it fails, so the dialog's Try again asks.
 */
export function ticketQueryOptions(api: ApiClient, key: string) {
  return queryOptions({
    queryKey: [...queryKeys.ticket, key] as const,
    queryFn: () => api.ticket(key),
    staleTime: 0,
    retry: false,
  });
}

export function ticketsQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.tickets,
    queryFn: () => api.tickets(),
    // Freshness comes from the event stream (inbox.changed when a sync ends, status.changed, sessions.changed),
    // not from polling: the sprint syncs with the inbox every 2 minutes while a page is open.
    staleTime: Infinity,
  });
}

export function claudeLoginQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.claudeLogin,
    queryFn: () => api.claudeLogin(),
    // Freshness comes from the event stream (status.changed when the server's check finds a change).
    staleTime: Infinity,
  });
}

export function searchQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.search,
    queryFn: () => api.search(),
    // Freshness comes from the event stream (inbox.changed when a sync ends, sessions.changed, status.changed),
    // not from polling, and typing never asks again: the browser matches (spec 009).
    staleTime: Infinity,
  });
}
