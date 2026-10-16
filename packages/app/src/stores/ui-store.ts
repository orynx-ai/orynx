import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** UI-only preferences. Server data never goes here; it lives in TanStack Query. */
interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },
    }),
    { name: 'devhub.ui' },
  ),
);
