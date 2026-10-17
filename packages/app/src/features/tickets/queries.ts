import { useQuery } from '@tanstack/react-query';
import { ticketsQueryOptions } from '@devhub/api-client';
import { useApi } from '../../api.tsx';

/** Tickets' sprint and its tickets. Kept fresh by `inbox.changed`, `status.changed` and `sessions.changed`. */
export function useTickets() {
  const api = useApi();
  return useQuery(ticketsQueryOptions(api));
}

/** Q6: how many tickets in your sprint are assigned to you, Done included, for the sidebar; undefined until loaded. */
export function useTicketsCount(): number | undefined {
  const api = useApi();
  return useQuery({
    ...ticketsQueryOptions(api),
    select: (tickets) => tickets.tickets.filter((ticket) => ticket.assignee?.mine === true).length,
  }).data;
}
