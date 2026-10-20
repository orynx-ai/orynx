import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SyncActivityQuery } from '@devhub/contracts';
import { syncActivityQueryOptions } from '@devhub/api-client';
import { useApi } from '../../api.tsx';

/**
 * One view of the sync log (spec 035). Kept fresh by the `inbox.changed` that ends every sync. The last view
 * stays while another tool's loads, so the pane never empties between picks.
 */
export function useSyncActivity(query: SyncActivityQuery) {
  const api = useApi();
  return useQuery({ ...syncActivityQueryOptions(api, query), placeholderData: keepPreviousData });
}
