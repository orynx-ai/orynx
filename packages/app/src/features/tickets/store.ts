import type { TicketColumn } from '@devhub/contracts';
import type { TicketsSearch } from './filters.ts';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** How Tickets shows the sprint: the same tickets as a board or a list (spec 008). */
export type TicketsView = 'board' | 'list';

/** Tickets' UI-only preferences, remembered on this computer. Server data never goes here. */
interface TicketsState {
  view: TicketsView;
  setView: (view: TicketsView) => void;
  /** The tickets ticked to Ship together, by key, in the order ticked; kept only while Orynx is open. */
  selected: string[];
  toggleSelected: (key: string) => void;
  clearSelected: () => void;
  /**
   * The filters last in the address, as it writes them (only what differs from the default), so Tickets opens on
   * them again when it's opened with none (spec 039, AC-7). Remembered on this computer; the search text isn't.
   */
  filters: TicketsSearch;
  keepFilters: (filters: TicketsSearch) => void;
  /** The column a new Orynx ticket starts in while the New ticket form is open (spec 037); null while it's closed. */
  newTicket: TicketColumn | null;
  openNewTicket: (column: TicketColumn) => void;
  closeNewTicket: () => void;
}

export const useTicketsStore = create<TicketsState>()(
  persist(
    (set) => ({
      view: 'board',
      setView: (view) => {
        set({ view });
      },
      filters: {},
      keepFilters: (filters) => {
        set({ filters });
      },
      selected: [],
      toggleSelected: (key) => {
        set((state) => ({
          selected: state.selected.includes(key)
            ? state.selected.filter((held) => held !== key)
            : [...state.selected, key],
        }));
      },
      clearSelected: () => {
        set({ selected: [] });
      },
      newTicket: null,
      openNewTicket: (column) => {
        set({ newTicket: column });
      },
      closeNewTicket: () => {
        set({ newTicket: null });
      },
    }),
    { name: 'devhub.tickets', partialize: (state) => ({ view: state.view, filters: state.filters }) },
  ),
);
