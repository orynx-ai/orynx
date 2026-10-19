import { create } from 'zustand';

/**
 * Send a test notification's pop-up (spec 029, AC-42): the page bar asks for it, the pop-ups show it. It isn't a
 * notification, so it never joins the list. Never remembered.
 */
interface TestPopUpState {
  /** Goes up with each test, so pressing again shows it afresh; 0 while none shows. */
  shown: number;
  show: () => void;
  hide: () => void;
}

export const useTestPopUpStore = create<TestPopUpState>()((set) => ({
  shown: 0,
  show: () => {
    set((state) => ({ shown: state.shown + 1 }));
  },
  hide: () => {
    set({ shown: 0 });
  },
}));
