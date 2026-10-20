import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InboxSource, SyncActivityQuery, SyncTool } from '@devhub/contracts';
import { queryKeys, syncActivityQueryOptions } from '@devhub/api-client';
import { useApi } from '../../api.tsx';

/** One view of the sync log (spec 035). Kept fresh by the `inbox.changed` that ends every sync. */
export function useSyncActivity(query: SyncActivityQuery) {
  const api = useApi();
  return useQuery(syncActivityQueryOptions(api, query));
}

const syncKey = (tool: InboxSource | undefined) => [...queryKeys.inbox, 'sync-now', tool ?? 'all'];

/**
 * Sync now for one tool, or every tool's (Sync all now). It resolves once the sync has ended and the log has been
 * read again, with every tool as it now stands, so the page can say how it went.
 */
export function useSyncNow(tool?: InboxSource) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: syncKey(tool),
    mutationFn: async (): Promise<SyncTool[]> => {
      await api.refreshInbox(tool);
      await queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
      return (await queryClient.query(syncActivityQueryOptions(api, { show: 'all' }))).tools;
    },
  });
}

/** Whether this tool is syncing on a press in this page: its own Sync now, or Sync all now. */
export function useSyncing(tool: InboxSource): boolean {
  return useIsMutating({ mutationKey: syncKey(tool) }) + useIsMutating({ mutationKey: syncKey(undefined) }) > 0;
}
