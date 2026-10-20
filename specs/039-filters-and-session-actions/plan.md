# Plan: Filters and session actions

Spec: `specs/039-filters-and-session-actions/spec.md`

## Order of work

1. **Sessions on the server first: contracts, then core, then api-client.** Rename, Pin and Delete need a `pinnedAt` field, a `PATCH` and a `DELETE` on `/sessions/:id`, a `remove` in the session stores, and a `pinned` filter on the list. Each layer is tested on its own (`app.inject`, MSW) before any screen uses it. `sessions.changed` already refetches every list, so AC-36 needs no new event.
2. **The three `@devhub/ui` pieces next.** `Sheet` (Q6), `SessionItem`'s `size="sm"` and `actions` slot, and `RecentSearches`. Each is built and tested in isolation with its stories, so the app tasks only compose them.
3. **The sidebar.** First its smaller type and icons (Q4), then the ⋯ menu with the Rename and Delete dialogs, then the Pinned group. The menu is one `SessionMenu` component, which the Sessions page and the Session screen reuse.
4. **The Sessions page and the Session screen.** Search and filters in the address, then the menu items in the screen's More actions.
5. **Recent searches.** One persisted zustand store with a list per place, then Sessions, ⌘K and Tickets in turn.
6. **Sync.** "Refresh" becomes "Sync", then "Synced just now" becomes the Sync activity button (Q2), on Home and on Tickets.
7. **Tickets.** The toolbar with Source, Assignee and Filters, the filter sheet, the page bar's Project and Sprint crumbs, the remembered filters, and the New ticket line. Each lands with the e2e file it changes.
8. **The real-browser pass and `/review`.** Check 360 px and 1280 px in light and dark (AC-42), then `/review`.

## Risks

| Risk                                                                                                                      | How we will notice early                                                                    | What we do                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Delete races a run, a push or a terminal still using the worktree.                                                        | The core test deletes while a fake run is live and while a push is pending.                 | Refuse with 409 while the session works. Wait for `publishing` and run `terminal.stopAll` first, as `discardNow` does.                                                         |
| An Ask with no folder has an empty worktree folder of its own, which `worktrees.remove` (a git command) can't take away.  | A core test deletes a folderless Ask and checks the folder is gone.                         | Remove that folder with `rm` and `recursive`, but only when it sits under `<DEVHUB_HOME>/worktrees/`.                                                                          |
| Ordering pinned sessions first breaks the sidebar's cursor paging, which pages by activity time.                          | The sidebar test pins a session that sits on page 2.                                        | The list takes `pinned=true` (every pinned session, no paging) or `pinned=false` (the paged rest). The sidebar asks twice, and the Sessions page groups what it already reads. |
| The ⋯ button inside the row's link would nest one interactive element in another, which is invalid and breaks axe.        | The `SessionItem` story fails axe, and the test finds two separate controls by role.        | `actions` renders as a sibling of the link inside a wrapper, never inside it.                                                                                                  |
| Remembered ticket filters flash the default board before they apply.                                                      | The tickets screen test asserts the first render already has the remembered filters ticked. | Apply them in the route's search middleware or `beforeLoad`, before the first render, never in an effect.                                                                      |
| Existing tests and e2e files name "Refresh", "Sync activity" and the Status, Type, Priority and Due menus in the toolbar. | The task's own test run fails on the old names.                                             | Each task updates the tests it breaks, as listed in its Files. e2e files change only in the tasks that name them.                                                              |
| The smaller sidebar type drifts from `docs/design/design-system.md`, which comes from people.                             | The `design-map` and SidebarNav text disagree with the code.                                | Q6 lets this spec update the SidebarNav section and the design map, and add `Sheet`.                                                                                           |

## Touches

- Packages: contracts, core, api-client, ui, app
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, icon-buttons, test-policy, specs
- Skills to follow: `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/add-ui-component/SKILL.md`, `.claude/skills/server-state/SKILL.md`, `.claude/skills/client-state/SKILL.md`, `.claude/skills/forms/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`, `.claude/skills/clean-ui/SKILL.md`, `.claude/skills/build-a-screen/SKILL.md`
