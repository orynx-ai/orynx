import { useQuery } from '@tanstack/react-query';
import { inboxQueryOptions } from '@devhub/api-client';
import { useApi } from '../../api.tsx';

/** Home's "Needs your attention" list. Kept fresh by `inbox.changed`, `settings.changed` and `status.changed`. */
export function useInbox() {
  const api = useApi();
  return useQuery(inboxQueryOptions(api));
}

/** How many rows need you, for the sidebar; undefined until the list has loaded. */
export function useInboxCount(): number | undefined {
  const api = useApi();
  return useQuery({ ...inboxQueryOptions(api), select: (inbox) => inbox.items.length }).data;
}
