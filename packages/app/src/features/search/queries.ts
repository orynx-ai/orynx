import { useQuery } from '@tanstack/react-query';
import { searchQueryOptions } from '@devhub/api-client';
import { useApi } from '../../api.tsx';

/**
 * Everything search can find. Asked when the dialog first opens; kept fresh by `inbox.changed`,
 * `status.changed` and `sessions.changed`. Typing never asks again: the browser matches.
 */
export function useSearchIndex() {
  const api = useApi();
  return useQuery(searchQueryOptions(api));
}
