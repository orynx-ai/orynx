import { create } from 'zustand';

/**
 * What the page already knows of the ticket a title opened (spec 022, AC-43): shown at once while Jira answers.
 * `url` is null where the page holds none, as for a ⌘K result whose ticket has a session.
 */
export interface ShownTicket {
  key: string;
  title: string | null;
  type: string | null;
  url: string | null;
}

/** Which ticket the ticket dialog shows, if any. UI-only: the ticket itself comes from TanStack Query. */
interface TicketDialogState {
  shown: ShownTicket | null;
  show: (ticket: ShownTicket) => void;
  close: () => void;
}

export const useTicketDialogStore = create<TicketDialogState>()((set) => ({
  shown: null,
  show: (ticket) => {
    set({ shown: ticket });
  },
  close: () => {
    set({ shown: null });
  },
}));
