import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, ticketsQueryOptions, ticketsSprintsQueryOptions } from '@devhub/api-client';
import type { Tickets, TicketsChoice } from '@devhub/contracts';
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

/** A project's open sprints, asked of Jira only while the Sprint menu is open (spec 020). */
export function useTicketsSprints(project: string | null, open: boolean) {
  const api = useApi();
  return useQuery({ ...ticketsSprintsQueryOptions(api, project ?? ''), enabled: open && project !== null });
}

/**
 * Saves which sprint Tickets shows (spec 020). The page shows the new pick loading at once: the sprint kept
 * was read for the old one, and the server says `syncing` until a pass has read the new one, then
 * `inbox.changed` brings it.
 */
export function useChooseTicketsSprint() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (choice: TicketsChoice) => api.chooseTicketsSprint(choice),
    onMutate: async (choice) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tickets });
      queryClient.setQueryData<Tickets>(
        queryKeys.tickets,
        (old) => old && { ...old, choice, jira: { state: 'syncing' }, sprint: null, tickets: [], truncated: false },
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.tickets }),
  });
}
