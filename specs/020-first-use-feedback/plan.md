# Plan: First-use feedback

Spec: `specs/020-first-use-feedback/spec.md`

## Order of work

1. **Tooltip and IconButton in `@devhub/ui` first (D).** Every other part draws its icon buttons with them, so they come before any screen. Then the ui's own icon buttons (Send, a chip's Remove, the pagination arrows, a card's Ship) move onto them, and the `icon-buttons` gate goes on as failing once nothing old is left for it to find.
2. **The shell (B, C, D).** The tooltip provider at the app's root, then the sidebar: New task goes, Sessions joins the rail, and every rail icon gets its tooltip.
3. **Sessions in pages (A).** Contract → core → api-client, so the cursor is proven with `app.inject()` before the sidebar uses it, then the sidebar's infinite list.
4. **Small app changes (E, F).** The local-first note's close button; "Ship" in place of "Build"; Home's icon actions.
5. **Folders (G).** Server first (edit in place, and the duplicate rule of Q3), then the dialog and the row's menu, then the Ship menu's Add local folder, which reuses the dialog.
6. **Tickets (H).** The Jira client's new reads (a project's sprints, one sprint, who you are) with MSW, then the saved choice and the sync that reads it, then the api-client, then the pickers. The filters are browser-only, so they come last: the shared `FilterMenu` in `@devhub/ui` (Home's filter picker, moved), the filter model, then the toolbar.
7. **e2e, docs and the browser check.** The e2e specs that name New task, Build, Remove or the old chips change with the code they test; the last tasks add the new flows end to end, update `learn/`, leave the user the product-spec script and check every changed screen at 360 and 1280 px in both themes.

## Risks

| Risk                                                                                               | How we will notice early                                                    | What we do                                                                                                     |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Radix Tooltip needs a provider, and ui components are tested without the app around them           | The IconButton test renders it bare                                         | `Tooltip` brings its own provider when none is above it                                                        |
| A tooltip over a menu trigger fights the menu for the pointer, or stays open over the menu         | The Ship and More actions tests open the menu with a tooltip on its trigger | The tooltip closes when its trigger is pressed (Radix's default), and the menu test checks it's gone           |
| jsdom has no `IntersectionObserver`, so the sidebar can't scroll to its end in tests               | The first sidebar test fails to load page two                               | A stand-in in `test/setup.ts` (like ResizeObserver's) that tests trigger; the real scroll is proven in e2e     |
| A `sessions.changed` refetch of two pages shows a session twice                                    | AC-3's test moves a page-two session to the top                             | TanStack refetches the pages in order from the first, so each cursor comes from fresh data; the test proves it |
| Jira's board and sprint reads differ per site (kanban boards, sprints on several boards)           | Client tests with MSW, built from Jira's documented answers                 | Scrum boards only, at most 10 per project; sprints deduplicated by id; a board that refuses is skipped         |
| The tickets cache holds the old sprint after the choice changes, so the page shows it for one sync | AC-26's test picks a sprint and checks the old tickets are gone at once     | The record says which choice it was read for; a record for another choice reads as syncing                     |
| Edit and Duplicate break a session that was started from a folder                                  | Session tests still pass with the folder edited                             | A session keeps its own path; editing changes only what the next session starts in                             |
| 013 and 014 change the same files                                                                  | `git merge-tree origin/main` before the PR                                  | This branch stays out of the Session screen; a clash is resolved on merge                                      |
| The e2e specs that click New task, Build or Remove fail                                            | Each task's e2e run                                                         | They change in the same task as the code they test                                                             |

## Touches

- Packages: contracts, core, api-client, ui, app; `scripts/gates` (new `icon-buttons`); `CLAUDE.md` rule 7 and the files `pnpm agent-rules` makes.
- Gates that check this work: style-policy, component-coverage, design-source, boundaries, test-policy, specs, handbook-size, learn-freshness, agent-rules, and the new icon-buttons.
- Skills to follow: `add-ui-component`, `clean-ui`, `build-a-screen`, `honest-tests`, `add-api-endpoint`, `integration-adapter`, `server-state`, `client-state`, `forms`, `write-a-gate`.
