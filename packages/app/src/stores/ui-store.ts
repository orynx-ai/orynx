import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** The expanded sidebar's width in px: 260 by default, resizable up to 400 (spec 001, Q10). */
export const sidebarWidthLimits = { min: 260, max: 400, initial: 260 } as const;

/** Keeps a width, including one read back from storage, inside the limits. */
export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return sidebarWidthLimits.initial;
  return Math.min(sidebarWidthLimits.max, Math.max(sidebarWidthLimits.min, Math.round(width)));
}

/** UI-only preferences. Server data never goes here; it lives in TanStack Query. */
interface UiState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarWidth: sidebarWidthLimits.initial,
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },
      setSidebarWidth: (width) => {
        // A drag reports every pointer move; only a real change is stored (and written to storage).
        set((state) => {
          const next = clampSidebarWidth(width);
          return next === state.sidebarWidth ? state : { sidebarWidth: next };
        });
      },
    }),
    { name: 'devhub.ui' },
  ),
);
