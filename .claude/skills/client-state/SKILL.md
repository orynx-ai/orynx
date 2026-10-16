---
name: client-state
description: Use when a screen needs state that only the browser owns (sidebar collapsed, theme, composer draft and context chips, board vs list view, open menus). Forbids storing server data in zustand, hand-written localStorage code, and one giant global store.
---

# Client state with zustand

Client state is anything the server does not own and does not need: UI preferences, drafts, what is open. It lives in zustand. Server data lives in TanStack Query (`.claude/skills/server-state/SKILL.md`).

| State                                                    | Where                                             |
| -------------------------------------------------------- | ------------------------------------------------- |
| Tickets, inbox items, sessions, connection status        | TanStack Query                                    |
| Theme, sidebar collapsed                                 | `packages/app/src/stores/` (global, persisted)    |
| Composer draft text and context chips, board/list view   | the feature's `store.ts`                          |
| Whether one menu is open, a hover                        | `useState` inside the component                   |
| Form inputs                                              | react-hook-form (`.claude/skills/forms/SKILL.md`) |
| Anything that belongs in the URL (selected tab, filters) | router search params                              |

## Global stores

```ts
// packages/app/src/stores/ui-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: 'devhub.ui' },
  ),
);
```

`useThemeStore` in `packages/app/src/stores/theme-store.ts` holds `theme: "system" | "light" | "dark"` and `setTheme`. Applying a theme sets `data-theme` on `<html>`, and `system` removes the attribute.

## A feature store

1. Create `packages/app/src/features/<feature>/store.ts`.
2. Keep state and the actions that change it together. Name the hook `use<Feature>Store`.
3. Persist only preferences, never drafts that would surprise someone after a restart, unless the spec asks.
4. Persist keys are namespaced: `devhub.<feature>`.

## Reading from a store

- Select the smallest slice: `const collapsed = useUiStore((s) => s.sidebarCollapsed);`
- When you select several values, use `useShallow` from `zustand/react/shallow`.
- Call actions from event handlers, never during render.

## Testing

- Use the real store. Reset it between tests with `useUiStore.setState(initialState)` in `beforeEach`.
- Assert what the person sees after an action ("the sidebar shows only icons"), not the store's internals.

## Don't

- Don't write `localStorage.getItem` / `setItem` by hand; use `persist`.
- Don't copy query data into a store "for convenience".
- Don't make one store for the whole app. One global UI store, plus one per feature when needed.
- Don't keep a URL-worthy choice (tab, filter) only in a store; it belongs in search params so links and Back work.

## Checked by

`/review` (server data in a store is a critical finding) · `pnpm test packages/app`
