import { create } from 'zustand';

/**
 * Whether ⌘K search is open (spec 009). Global, because the shortcut, the sidebar's button and the dialog
 * all reach it. Never remembered: the dialog opens empty every time.
 */
interface SearchState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useSearchStore = create<SearchState>()((set) => ({
  open: false,
  setOpen: (open) => {
    set({ open });
  },
  toggle: () => {
    set((state) => ({ open: !state.open }));
  },
}));
