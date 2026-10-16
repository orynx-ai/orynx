import { create } from 'zustand';

/** Set when the server answers 401: it restarted with a new token, so this page must reload. */
interface ConnectionState {
  stale: boolean;
  markStale: () => void;
}

export const useConnectionStore = create<ConnectionState>()((set) => ({
  stale: false,
  markStale: () => {
    set({ stale: true });
  },
}));
