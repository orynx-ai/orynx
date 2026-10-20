import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** The profile menu's Appearance: System (match the computer), Light, Dark. */
export const ThemeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof ThemeSchema>;

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const themeStorageKey = 'devhub.theme';

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => {
        set({ theme });
      },
    }),
    { name: themeStorageKey },
  ),
);

/**
 * tokens.css switches on `data-theme` and falls back to the computer's setting when it is
 * absent. apps/web/index.html applies the stored value before first paint, so there is no flash.
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = theme;
}
