import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** The three search boxes that remember what you searched (spec 039, Q3). */
export type SearchPlace = 'sessions' | 'search' | 'tickets';

/** How many searches each box keeps. */
export const mostRecentSearches = 5;

/**
 * Your recent searches, a list for each box, newest first, each search once (spec 039). Kept on this computer only:
 * a search never leaves it.
 */
interface RecentSearchesState {
  lists: Record<SearchPlace, string[]>;
  remember: (place: SearchPlace, text: string) => void;
  remove: (place: SearchPlace, text: string) => void;
  clear: (place: SearchPlace) => void;
}

const sameSearch = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const useRecentSearches = create<RecentSearchesState>()(
  persist(
    (set) => ({
      lists: { sessions: [], search: [], tickets: [] },
      remember: (place, text) => {
        const search = text.trim();
        if (search === '') return;
        set((state) => ({
          lists: {
            ...state.lists,
            [place]: [search, ...state.lists[place].filter((kept) => !sameSearch(kept, search))].slice(
              0,
              mostRecentSearches,
            ),
          },
        }));
      },
      remove: (place, text) => {
        set((state) => ({ lists: { ...state.lists, [place]: state.lists[place].filter((kept) => kept !== text) } }));
      },
      clear: (place) => {
        set((state) => ({ lists: { ...state.lists, [place]: [] } }));
      },
    }),
    { name: 'devhub.recent-searches' },
  ),
);
