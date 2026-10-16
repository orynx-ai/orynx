import { useQuery } from '@tanstack/react-query';
import { statusQueryOptions } from '@devhub/api-client';
import { useApi } from '../../api.tsx';

/** What the hub is connected to. Kept fresh by `status.changed` events, not polling. */
export function useStatus() {
  const api = useApi();
  return useQuery(statusQueryOptions(api));
}
