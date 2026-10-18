import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** How Tickets shows the sprint: the same tickets as a board or a list (spec 008). */
export type TicketsView = 'board' | 'list';

/** Tickets' UI-only preferences, remembered on this computer. Server data never goes here. */
interface TicketsState {
  view: TicketsView;
  setView: (view: TicketsView) => void;
}

export const useTicketsStore = create<TicketsState>()(
  persist(
    (set) => ({
      view: 'board',
      setView: (view) => {
        set({ view });
      },
    }),
    { name: 'devhub.tickets' },
  ),
);
