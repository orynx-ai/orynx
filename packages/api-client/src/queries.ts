import { queryOptions } from '@tanstack/react-query';
import type { SessionListQuery } from '@devhub/contracts';
import type { ApiClient } from './client.ts';

/** One key per resource. Server events invalidate by these keys (learn/live-updates.md). */
export const queryKeys = {
  status: ['status'] as const,
  /** Every session list starts with this key, so one invalidation refreshes them all. */
  sessions: ['sessions'] as const,
  jiraConnection: ['jira', 'connection'] as const,
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

export function jiraConnectionQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.jiraConnection,
    queryFn: () => api.jiraConnection(),
    // Connect and Disconnect publish status.changed, which refreshes this too.
    staleTime: Infinity,
  });
}
