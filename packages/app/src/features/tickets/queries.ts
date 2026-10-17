import { useQuery } from '@tanstack/react-query';
import { ticketsQueryOptions } from '@devhub/api-client';
import { useApi } from '../../api.tsx';

/** Tickets' sprint and its tickets. Kept fresh by `inbox.changed`, `status.changed` and `sessions.changed`. */
export function useTickets() {
  const api = useApi();
  return useQuery(ticketsQueryOptions(api));
}
