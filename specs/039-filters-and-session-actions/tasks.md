# Tasks: Filters and session actions

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Contracts for Rename, Pin and Delete: `pinnedAt` on a session's summary, the change body (title 1–200 characters after trimming, pinned), `pinned` on the list query, and PATCH and DELETE on `/sessions/:id` (AC-26, AC-28, AC-29, AC-32)
      Check: pnpm test packages/contracts/src/session.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts
- [x] Task 2: Session stores: `remove(id)` in the file and memory stores, `pinnedAt` in listed sessions, and `pinned` filtering in `listSessions` (AC-26, AC-27, AC-32)
      Check: pnpm test packages/core/src/sessions/file-session-store.test.ts
      Files: packages/core/src/sessions/session-store.ts, packages/core/src/sessions/file-session-store.ts, file-session-store.test.ts
- [x] Task 3: Session service and routes. `change` renames or pins and keeps the activity time. `delete` refuses while Claude works, ends terminals, removes the worktree but keeps the branch, then removes the record and says `sessions.changed` (AC-26–AC-28, AC-32, AC-33, AC-36)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/routes/sessions.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/routes/sessions.ts, their tests
- [x] Task 4: api-client: `changeSession`, `deleteSession` and the `pinned` list option (AC-26, AC-28, AC-32)
      Check: pnpm test packages/api-client/src/sessions.test.ts
      Files: packages/api-client/src/sessions.ts, packages/api-client/src/sessions.test.ts
- [x] Task 5: `Sheet` in `@devhub/ui`, on the right, from shadcn's Sheet, restyled to the dialog tokens, with stories and a test. Add it to the design system and the design map (Q6) (AC-2, AC-4)
      Check: pnpm test packages/ui/src/components/sheet.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/sheet.tsx, sheet.stories.tsx, sheet.test.tsx, packages/ui/src/index.ts, docs/design/design-system.md, docs/design-map.md
- [x] Task 6: `SessionItem` `size="sm"` (14 px title, 12 px second line, 20 px state circle, 36 px row) and an `actions` slot beside the link, shown on hover or focus-within and always under 768 px (AC-24, AC-39)
      Check: pnpm test packages/ui/src/components/session-item.test.tsx; pnpm gate style-policy icon-buttons
      Files: packages/ui/src/components/session-item.tsx, session-item.stories.tsx, session-item.test.tsx
- [x] Task 7: `RecentSearches` in `@devhub/ui`: a "Recent searches" heading with Clear, and rows to pick and remove, with ↑ and ↓ between rows (AC-21–AC-23)
      Check: pnpm test packages/ui/src/components/recent-searches.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/recent-searches.tsx, recent-searches.stories.tsx, recent-searches.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 8: The sidebar's smaller type and icons: places, Search and session rows at `small`, second lines at `label`, 16 px icons, 36 px rows. Update the SidebarNav section (Q4, Q6) (AC-39)
      Check: pnpm test packages/app/src/shell packages/app/src/features/sessions/components/sidebar-sessions.test.tsx; pnpm gate style-policy
      Files: packages/app/src/shell/sidebar.tsx, sidebar-footer.tsx, packages/app/src/features/sessions/components/sidebar-sessions.tsx, docs/design/design-system.md
- [x] Task 9: `SessionMenu` (⋯ with Rename, Pin or Unpin, and Delete), `RenameSessionDialog` (react-hook-form + the contract) and `DeleteSessionDialog` (the unpushed-changes line, disabled while working, a toast), on each sidebar row (AC-24, AC-25, AC-28–AC-33)
      Check: pnpm test packages/app/src/features/sessions/components
      Files: packages/app/src/features/sessions/components/session-menu.tsx, rename-session.tsx, delete-session.tsx, their tests, sidebar-sessions.tsx, packages/app/src/features/sessions/queries.ts
- [x] Task 10: Pinned group at the top of the sidebar's sessions: `pinned=true` in full and the paged rest (AC-26, AC-27)
      Check: pnpm test packages/app/src/features/sessions/components/sidebar-sessions.test.tsx
      Files: packages/app/src/features/sessions/components/sidebar-sessions.tsx, its test, packages/app/src/features/sessions/queries.ts
- [x] Task 11: The Session screen's More actions gets Rename, Pin or Unpin, and Delete, above Discard changes; a delete goes to the Sessions page (AC-34, AC-35)
      Check: pnpm test packages/app/src/features/sessions/components/session-header.test.tsx packages/app/src/features/sessions/session-screen.test.tsx
      Files: packages/app/src/features/sessions/components/session-header.tsx, its test, session-screen.test.tsx
- [x] Task 12: The Sessions page: Search sessions, Status and Kind filters in the address, a Pinned group, the ⋯ menu on each row, "No sessions match" with Clear filters, and loading and error under the toolbar (AC-18–AC-20, AC-43)
      Check: pnpm test packages/app/src/features/sessions/sessions-screen.test.tsx; pnpm gate design-source
      Files: packages/app/src/features/sessions/sessions-screen.tsx, its test, packages/app/src/features/sessions/session-filters.ts, its test, packages/app/src/router.tsx
- [x] Task 13: The recent searches store (one list per place, the last 5, kept on this computer), and Sessions' recent searches (AC-21–AC-23)
      Check: pnpm test packages/app/src/stores/recent-searches.test.ts packages/app/src/features/sessions/sessions-screen.test.tsx
      Files: packages/app/src/stores/recent-searches.ts, its test, packages/app/src/features/sessions/sessions-screen.tsx
- [ ] Task 14: ⌘K's recent searches, in place of the hint line (AC-44)
      Check: pnpm test packages/app/src/features/search/components/search-dialog.test.tsx
      Files: packages/app/src/features/search/components/search-dialog.tsx, its test
- [ ] Task 15: Tickets' recent searches (AC-45)
      Check: pnpm test packages/app/src/features/tickets/tickets-screen.test.tsx
      Files: packages/app/src/features/tickets/tickets-screen.tsx, its test
- [ ] Task 16: "Refresh" becomes "Sync" and "Syncing" (AC-14, AC-15)
      Check: pnpm test packages/app/src/features/home/components/sync-status.test.tsx packages/app/src/features/tickets/tickets-screen.test.tsx; pnpm test:e2e e2e/home-inbox.spec.ts
      Files: packages/app/src/features/home/components/sync-status.tsx, its test, tickets-screen.test.tsx, e2e/home-inbox.spec.ts
- [ ] Task 17: "Synced just now" becomes the Sync activity button with its dot, on Home and on Tickets, and the separate button goes (Q2) (AC-16, AC-17)
      Check: pnpm test packages/app/src/features/sync-activity packages/app/src/features/home/components/sync-status.test.tsx packages/app/src/features/tickets/tickets-screen.test.tsx; pnpm test:e2e e2e/sync-activity.spec.ts
      Files: packages/app/src/features/sync-activity/components/sync-activity-button.tsx, its test, sync-words.ts, packages/app/src/features/home/components/sync-status.tsx, packages/app/src/features/tickets/tickets-screen.tsx, e2e/sync-activity.spec.ts
- [ ] Task 18: Tickets' toolbar with Source, Assignee and Filters (its count), and the filter sheet with Project, Sprint and every filter, applying as you tick (AC-1–AC-6, AC-13)
      Check: pnpm test packages/app/src/features/tickets; pnpm test:e2e e2e/tickets.spec.ts e2e/orynx-tickets.spec.ts
      Files: packages/app/src/features/tickets/components/tickets-toolbar.tsx, filter-sheet.tsx, their tests, tickets-screen.tsx, e2e/tickets.spec.ts, e2e/orynx-tickets.spec.ts
- [ ] Task 19: Project and Sprint as the page bar's crumbs, cut short under 768 px (AC-10–AC-12)
      Check: pnpm test packages/app/src/features/tickets/tickets-screen.test.tsx packages/app/src/features/tickets/components/sprint-pickers.test.tsx
      Files: packages/app/src/features/tickets/tickets-screen.tsx, components/sprint-pickers.tsx, their tests, packages/app/src/shell/page-frame.tsx
- [ ] Task 20: Tickets remembers its filters on this computer and applies them before the first paint; an address with filters wins (AC-7–AC-9)
      Check: pnpm test packages/app/src/features/tickets/tickets-screen.test.tsx packages/app/src/features/tickets/store.test.ts
      Files: packages/app/src/features/tickets/store.ts, its test, packages/app/src/router.tsx, tickets-screen.tsx
- [ ] Task 21: The New ticket dialog's Orynx line, with and without Jira (AC-40, AC-41)
      Check: pnpm test packages/app/src/features/tickets/components/ticket-form.test.tsx packages/app/src/features/tickets/tickets-screen.test.tsx
      Files: packages/app/src/features/tickets/components/new-ticket.tsx, ticket-form.tsx, ticket-words.ts, their tests
- [ ] Task 22: e2e for the session menu (rename, pin, delete) and the Sessions page's search, and a real-browser pass at 360 px and 1280 px in light and dark (AC-24–AC-36, AC-42)
      Check: pnpm test:e2e e2e/sessions.spec.ts
      Files: e2e/sessions.spec.ts
- [ ] Task 23: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
