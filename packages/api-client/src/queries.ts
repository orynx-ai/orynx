import { queryOptions } from '@tanstack/react-query';
import type { ApiClient } from './client.ts';

/** One key per resource. Server events invalidate by these keys (learn/live-updates.md). */
export const queryKeys = {
  status: ['status'] as const,
  /** Every session list starts with this key, so one invalidation refreshes them all. */
  sessions: ['sessions'] as const,
};

export function statusQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: queryKeys.status,
    queryFn: () => api.status(),
    // Freshness comes from the event stream (status.changed), not from polling.
    staleTime: Infinity,
  });
}
