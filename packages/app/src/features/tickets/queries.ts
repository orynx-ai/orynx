import { useQuery } from '@tanstack/react-query';
import { ticketsQueryOptions } from '@devhub/api-client';
import type { Tickets } from '@devhub/contracts';
import { useApi } from '../../api.tsx';

/** Tickets' sprint and its tickets. Kept fresh by `inbox.changed`, `status.changed` and `sessions.changed`. */
export function useTickets() {
  const api = useApi();
  return useQuery(ticketsQueryOptions(api));
}

/** Q6: your tickets in the sprint, Done included. Outside the hook, so it isn't run again on every render. */
function yoursInSprint(tickets: Tickets): number {
  return tickets.tickets.filter((ticket) => ticket.assignee?.mine === true).length;
}

/** How many tickets in your sprint are assigned to you, for the sidebar; undefined until loaded. */
export function useTicketsCount(): number | undefined {
  const api = useApi();
  return useQuery({ ...ticketsQueryOptions(api), select: yoursInSprint }).data;
}
