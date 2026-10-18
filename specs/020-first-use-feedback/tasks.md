# Tasks: First-use feedback

One task is one commit. Test first, then code. Tick a task only when its Check passes.

## D. Tooltips (first, because every part uses them)

- [x] Task 1: `Tooltip` in `@devhub/ui`: Radix Tooltip drawn like a menu (Q1), its own provider when none is above it, opens on rest and on focus, Escape closes (AC-9, AC-10)
      Check: pnpm test packages/ui/src/components/tooltip.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/tooltip.tsx, tooltip.stories.tsx, tooltip.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 2: `IconButton` in `@devhub/ui`: `label` is the tooltip and, unless `aria-label` says more, the name; Button's icon stories move to it (AC-9, AC-10)
      Check: pnpm test packages/ui/src/components/icon-button.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/icon-button.tsx, icon-button.stories.tsx, icon-button.test.tsx, button.stories.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 3: The ui's own icon buttons get tooltips: Composer's Send, a context chip's Remove, Pagination's arrows; the card's Build becomes `WorkItemShip` ("Ship PROJ-1423", tooltip "Ship") (AC-11, AC-16)
      Check: pnpm test packages/ui
      Files: packages/ui/src/components/{composer,context-chip,pagination,work-item-card}.tsx and their tests and stories
- [x] Task 4: `pnpm gate icon-buttons` (failing from the start), CLAUDE.md rule 7, `pnpm agent-rules` (AC-12)
      Check: pnpm gates:test; pnpm gate icon-buttons handbook-size agent-rules
      Files: scripts/lib/policies/icon-buttons.ts, scripts/gates/icon-buttons.ts, scripts/gates/icon-buttons.test.ts, scripts/run-gates.ts, CLAUDE.md, AGENTS.md, .github/copilot-instructions.md, .cursor/rules/00-core.mdc

## B, C. The sidebar

- [x] Task 5: The tooltip provider at the app's root; the sidebar loses New task and gains Sessions on the rail; Collapse, Expand, Search, the rail's places and the footer get tooltips in place of `title` (AC-7, AC-8, AC-11)
      Check: pnpm test packages/app/src/shell; pnpm exec playwright test e2e/shell.spec.ts
      Files: packages/app/src/devhub-app.tsx, packages/app/src/shell/sidebar.tsx, sidebar-footer.tsx, sidebar.test.tsx, sidebar-footer.test.tsx, app-shell.test.tsx, e2e/shell.spec.ts

## A. Every session, 16 at a time

- [x] Task 6: `GET /api/sessions` pages with `cursor` and answers `nextCursor`; a bad cursor answers 400 (AC-6)
      Check: pnpm test packages/contracts/src/session.test.ts packages/core/src/routes/sessions.test.ts packages/api-client/src/sessions.test.ts
      Files: packages/contracts/src/session.ts, testing.ts, packages/core/src/sessions/session-store.ts, packages/core/src/routes/sessions.ts, packages/api-client/src/endpoints/sessions.ts, queries.ts and their tests
- [x] Task 7: The sidebar lists every recent session, 16 at a time, loading the next page at the list's end, with skeleton rows and Try again (AC-1 to AC-5)
      Check: pnpm test packages/app/src/features/sessions
      Files: packages/app/src/features/sessions/components/sidebar-sessions.tsx, sidebar-sessions.test.tsx, queries.ts, packages/app/src/test/setup.ts

## E. The local-first note

- [x] Task 8: The note's Hide this note button, remembered in the ui store (AC-13)
      Check: pnpm test packages/app/src/features/settings/settings-screen.test.tsx packages/ui/src/components/callout.test.tsx
      Files: packages/ui/src/components/callout.tsx (an `onClose` slot), its story and test, packages/app/src/stores/ui-store.ts, packages/app/src/features/settings/settings-screen.tsx, settings-screen.test.tsx

## F. Ship

- [x] Task 9: "Ship" starts Claude on Tickets' cards and list (`ShipWithClaude`, renamed from `BuildWithClaude`) (AC-16). Done with task 3, since the card's rename broke the app's tests
      Check: pnpm test packages/app/src/features/sessions packages/app/src/features/tickets; pnpm exec playwright test e2e/sessions.spec.ts e2e/approvals.spec.ts
      Files: packages/app/src/features/sessions/components/ship-with-claude.tsx (+ test), tickets components and tests, e2e specs that press Build
- [x] Task 10: Home's rows end in icon buttons: Ship and Open in Jira, Open in GitHub, Open session (AC-14, AC-15)
      Check: pnpm test packages/app/src/features/home packages/ui/src/components/attention-row.test.tsx; pnpm exec playwright test e2e/home-inbox.spec.ts
      Files: packages/app/src/features/home/components/attention-panel.tsx, inbox-words.ts and tests, packages/ui/src/components/attention-row.tsx (+ story, test), e2e/home-inbox.spec.ts

## G. Folders

- [x] Task 11: `PATCH /api/repositories/:id` edits a folder with the add checks; the same folder may be listed again for another Jira project, never twice for the same one (Q3) (AC-20, AC-21)
      Check: pnpm test packages/contracts/src/repositories.test.ts packages/core/src/repositories packages/core/src/routes/repositories.test.ts packages/api-client/src/repositories.test.ts
      Files: packages/contracts/src/repositories.ts, routes.ts, packages/core/src/repositories/repository-service.ts, packages/core/src/routes/repositories.ts, packages/api-client/src/endpoints/repositories.ts, client.ts and tests
- [x] Task 12: The folder dialog (Add, Edit, Duplicate) and each folder's More actions menu with Delete (AC-17 to AC-21)
      Check: pnpm test packages/app/src/features/settings; pnpm exec playwright test e2e/settings.spec.ts
      Files: packages/app/src/features/settings/components/folder-dialog.tsx (from add-folder-form.tsx), repository-row.tsx, repositories-panel.tsx, queries.ts and tests, e2e/settings.spec.ts
- [x] Task 12a: `POST /api/folder-picker` opens the OS folder picker (osascript, zenity or kdialog, PowerShell) and answers the path, null on Cancel, or `picker_unavailable` (AC-35, AC-36)
      Check: pnpm test packages/contracts packages/core/src/folder-picker packages/core/src/routes/folder-picker.test.ts packages/api-client
      Files: packages/contracts/src/repositories.ts, errors.ts, routes.ts, packages/core/src/folder-picker/*, packages/core/src/routes/folder-picker.ts, packages/core/src/create-server.ts, packages/api-client/src/endpoints/repositories.ts, client.ts
- [x] Task 12b: Choose folder in the folder dialog fills Folder from the picker (AC-35, AC-36)
      Check: pnpm test packages/app/src/features/settings
      Files: packages/app/src/features/settings/components/folder-dialog.tsx (+ test), queries.ts
- [x] Task 12c: `Combobox` in `@devhub/ui`: a Select-like field opening a searchable listbox in a popover (AC-37)
      Check: pnpm test packages/ui/src/components/combobox.test.tsx; pnpm gate component-coverage style-policy icon-buttons
      Files: packages/ui/src/components/combobox.tsx (+ story, test), packages/ui/src/index.ts, docs/design-map.md
- [x] Task 12d: The folder dialog's Jira project field is a Combobox (AC-37)
      Check: pnpm test packages/app/src/features/settings; pnpm exec playwright test e2e/settings.spec.ts
      Files: packages/app/src/features/settings/components/folder-dialog.tsx (+ test), e2e/settings.spec.ts
- [x] Task 13: Ship's menu ends in Add local folder, which opens the dialog with the ticket's project and starts Claude in the new folder (AC-22 to AC-24)
      Check: pnpm test packages/app/src/features/sessions
      Files: packages/app/src/features/sessions/components/ship-with-claude.tsx, ship-with-claude.test.tsx

## H. Tickets

- [x] Task 14: The Jira client reads a project's open sprints, one sprint, and who you are (AC-26, AC-28)
      Check: pnpm test packages/core/src/integrations/jira
      Files: packages/core/src/integrations/jira/client.ts, client.test.ts, packages/core/src/test/fake-jira.ts
- [x] Task 15: The Tickets choice: saved in `settings.json`, read by the sprint sync, `GET /api/tickets/sprints?project=` and `PUT /api/tickets/choice`; a record read for another choice reads as syncing (AC-25 to AC-29)
      Check: pnpm test packages/contracts/src/tickets.test.ts packages/core/src/tickets packages/core/src/routes/tickets.test.ts
      Files: packages/contracts/src/tickets.ts, routes.ts, testing.ts, packages/core/src/tickets/tickets-service.ts, packages/core/src/integrations/jira/sprint-map.ts, packages/core/src/settings/settings-store.ts, packages/core/src/routes/tickets.ts and tests
- [x] Task 16: The api-client's sprints query and choice call (AC-26, AC-29)
      Check: pnpm test packages/api-client
      Files: packages/api-client/src/endpoints/tickets.ts, client.ts, queries.ts, tickets.test.ts
- [x] Task 17: Tickets' Project picker (a Combobox) and Sprint picker (AC-25 to AC-29, AC-38)
      Check: pnpm test packages/app/src/features/tickets
      Files: packages/app/src/features/tickets/components/sprint-pickers.tsx (+ test), tickets-screen.tsx, tickets-toolbar.tsx, queries.ts, ticket-words.ts and tests
- [x] Task 17b: No sprint: the choice, Jira's issues in no sprint, and its place in the Sprint menu and the page (AC-39)
      Check: pnpm test packages/contracts packages/core/src/tickets packages/core/src/integrations/jira packages/app/src/features/tickets
      Files: packages/contracts/src/tickets.ts, packages/core/src/integrations/jira/client.ts, sprint-map.ts, packages/core/src/tickets/tickets-service.ts, packages/app/src/features/tickets/* and tests
- [x] Task 17c: Compact Project and Sprint lists: `size="sm"` on Menu and Combobox (AC-40)
      Check: pnpm test packages/ui packages/app/src/features/tickets; pnpm gate style-policy component-coverage
      Files: packages/ui/src/components/menu.tsx, combobox.tsx and their stories and tests, docs/design-map.md, packages/app/src/features/tickets/components/sprint-pickers.tsx
- [ ] Task 18: `FilterMenu` in `@devhub/ui` (Home's filter picker, moved there), and Home uses it (AC-30)
      Check: pnpm test packages/ui/src/components/filter-menu.test.tsx packages/app/src/features/home
      Files: packages/ui/src/components/filter-menu.tsx (+ story, test), packages/ui/src/index.ts, docs/design-map.md, packages/app/src/features/home/components/inbox-toolbar.tsx
- [ ] Task 19: Tickets' five filters: the model, the address (spec 008's addresses still work), the toolbar, Clear filters (AC-30 to AC-33)
      Check: pnpm test packages/app/src/features/tickets; pnpm exec playwright test e2e/tickets.spec.ts
      Files: packages/app/src/features/tickets/filters.ts, filters.test.ts, components/tickets-toolbar.tsx (+ test), tickets-screen.tsx, tickets-screen.test.tsx, e2e/tickets.spec.ts

## Finish

- [ ] Task 20: e2e for the new flows: scrolling the sidebar's sessions, the folder dialog from Ship, picking a sprint, tooltips on hover and focus (AC-2, AC-7, AC-9, AC-10, AC-23, AC-26)
      Check: pnpm test:e2e
      Files: e2e/shell.spec.ts, e2e/sessions.spec.ts, e2e/settings.spec.ts, e2e/tickets.spec.ts, e2e/fake-tools
- [ ] Task 21: `learn/` pages, the design map, and the user's script for `docs/product/spec.md`
      Check: pnpm gate learn-freshness
      Files: learn/the-tickets-board.md, learn/settings-and-folders.md, learn/sessions-and-worktrees.md, learn/the-inbox.md, docs/design-map.md, specs/020-first-use-feedback/product-spec-edits.sh
- [ ] Task 22: Browser check of every changed screen at 360 and 1280 px, light and dark, with CLS and axe; record it in the spec (AC-34)
      Check: pnpm verify
      Files: specs/020-first-use-feedback/spec.md
- [ ] Task 23: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
