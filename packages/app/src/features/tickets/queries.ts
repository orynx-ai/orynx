import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  orynxTicketQueryOptions,
  queryKeys,
  ticketQueryOptions,
  ticketsQueryOptions,
  ticketsSprintsQueryOptions,
} from '@devhub/api-client';
import {
  isOrynxKey,
  type CreateOrynxTicket,
  type TicketColumn,
  type Tickets,
  type TicketsChoice,
  type UpdateOrynxTicket,
} from '@devhub/contracts';
import { useApi } from '../../api.tsx';

/** Tickets' sprint and its tickets. Kept fresh by `inbox.changed`, `status.changed` and `sessions.changed`. */
export function useTickets() {
  const api = useApi();
  return useQuery(ticketsQueryOptions(api));
}

/**
 * Q6: your tickets in the sprint, Done included, and your Orynx tickets that aren't Done (spec 037). Outside the
 * hook, so it isn't run again on every render.
 */
function yoursInSprint(tickets: Tickets): number {
  return tickets.tickets.filter(
    (ticket) => ticket.assignee?.mine === true && !(isOrynxKey(ticket.key) && ticket.column === 'done'),
  ).length;
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
const chooseKey = ['tickets', 'choice'] as const;

export function useChooseTicketsSprint() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: chooseKey,
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

/**
 * Whether the last pick of a project or sprint didn't save, from the page bar or the filter sheet: the page then
 * says so in one line, until the next pick (spec 005, Q7c; spec 039 moved the pickers out of the toolbar).
 */
export function useTicketsChoiceFailed(): boolean {
  const statuses = useMutationState({
    filters: { mutationKey: chooseKey },
    select: (mutation) => mutation.state.status,
  });
  return statuses.at(-1) === 'error';
}

/** One ticket in full for the ticket dialog (spec 022), asked of Jira each time the dialog opens. */
export function useTicket(key: string) {
  const api = useApi();
  return useQuery(ticketQueryOptions(api, key));
}

/** Every place an Orynx ticket shows, refreshed after this tab's own change, before tickets.changed even comes. */
function useOrynxTicketsChanged() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [queryKeys.tickets, queryKeys.orynxTicket, queryKeys.search].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

/** One of Orynx's own tickets for the ticket dialog (spec 037); tickets.changed keeps it fresh. */
export function useOrynxTicket(key: string) {
  const api = useApi();
  return useQuery(orynxTicketQueryOptions(api, key));
}

export function useCreateOrynxTicket() {
  const api = useApi();
  const changed = useOrynxTicketsChanged();
  return useMutation({ mutationFn: (ticket: CreateOrynxTicket) => api.createOrynxTicket(ticket), onSuccess: changed });
}

export function useUpdateOrynxTicket() {
  const api = useApi();
  const changed = useOrynxTicketsChanged();
  return useMutation({
    mutationFn: ({ key, change }: { key: string; change: UpdateOrynxTicket }) => api.updateOrynxTicket(key, change),
    onSuccess: changed,
  });
}

export function useDeleteOrynxTicket() {
  const api = useApi();
  const changed = useOrynxTicketsChanged();
  return useMutation({ mutationFn: (key: string) => api.deleteOrynxTicket(key), onSuccess: changed });
}

/** Moves several Orynx tickets to one column, from Tickets' floating bar; the page refreshes once, after all. */
export function useMoveOrynxTickets() {
  const api = useApi();
  const changed = useOrynxTicketsChanged();
  return useMutation({
    mutationFn: ({ keys, status }: { keys: readonly string[]; status: TicketColumn }) =>
      Promise.all(keys.map((key) => api.updateOrynxTicket(key, { status }))),
    // Settled, not success: some may have moved before one failed.
    onSettled: changed,
  });
}

/** Deletes several Orynx tickets, from Tickets' floating bar. */
export function useDeleteOrynxTickets() {
  const api = useApi();
  const changed = useOrynxTicketsChanged();
  return useMutation({
    mutationFn: (keys: readonly string[]) => Promise.all(keys.map((key) => api.deleteOrynxTicket(key))),
    onSettled: changed,
  });
}
