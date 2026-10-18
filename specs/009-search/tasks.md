# Tasks: Search

One task is one commit. Test first, then code. Tick a task only when its Check passes.

Tasks 1 to 15 need nothing from 008. Task 16 waits until 008 merges. Tasks 17 and 18 come after it. 008 merged on 18 Oct 2026 right after task 1, so task 16 ran then, before task 2.

- [x] Task 1: Add the search contract: ticket, pull request and session results, each tool's state, each result's link (from 007's `InboxTargetSchema`), the path and test builders (AC-6, AC-8, AC-9, AC-28)
      Check: pnpm test packages/contracts; pnpm typecheck
      Files: packages/contracts/src/search.ts, search.test.ts, routes.ts, index.ts, testing.ts
- [x] Task 2: GitHub's map keeps every open pull request the sync reads, and records when each was opened (null for older cache records). Home's rows don't change (AC-18, Q1c)
      Check: pnpm test packages/core/src/integrations/github packages/core/src/inbox
      Files: packages/core/src/integrations/github/map.ts, map.test.ts, client.ts, client.test.ts, packages/core/src/inbox/rules.test.ts, inbox-service.test.ts
- [x] Task 3: Give `InboxService` a `records()` call: the connected tools' records and each tool's state, with no inbox rules. `read()` builds on it (AC-17, AC-24, AC-27)
      Check: pnpm test packages/core/src/inbox
      Files: packages/core/src/inbox/inbox-service.ts, inbox-service.test.ts
- [x] Task 4: Add the search service. Tickets come by key, each with its newest session or its Jira link. Pull requests come newest first, linking to their main page. Sessions come newest first. Each tool's state is included (AC-6, AC-8, AC-9, AC-13, AC-17, AC-18, AC-24, AC-27)
      Check: pnpm test packages/core/src/search
      Files: packages/core/src/search/search-service.ts, search-service.test.ts
- [x] Task 5: Add `GET /api/search` and wire it into `createServer`. Test the token and Host checks, and extend the leak test: no token, description or comment text (AC-28)
      Check: pnpm test packages/core/src/routes/search.test.ts packages/core/src/inbox/no-leaks.test.ts; pnpm typecheck; pnpm gate boundaries
      Files: packages/core/src/routes/search.ts, search.test.ts, packages/core/src/create-server.ts, packages/core/src/inbox/no-leaks.test.ts
- [x] Task 6: Add `search()` and `searchQueryOptions` to the api-client, with an MSW test and a bad-shape test (AC-23, AC-25)
      Check: pnpm test packages/api-client
      Files: packages/api-client/src/endpoints/search.ts, search.test.ts, client.ts, queries.ts, index.ts
- [x] Task 7: Add `Dialog` to `@devhub/ui` from shadcn's dialog. It's 720 px wide (`max-w-180`), 80 px from the top, and under 768 px full width less 16 px each side, 16 px from the top. It uses `bg-raised`, `border-default`, `rounded-lg` and `shadow-overlay`, with no backdrop, no close button, no scroll lock, and a 150 ms fade under `motion-safe` (AC-19, AC-20, AC-30, Q3a)
      Check: pnpm test packages/ui/src/components/dialog.test.tsx; pnpm gate style-policy component-coverage
      Files: packages/ui/src/components/dialog.tsx, dialog.test.tsx, dialog.stories.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 8: Add `SearchResult` and `SearchGroup` to `@devhub/ui`. A result is one 40 px option row: a lead mark, a mono code, a cut title and muted meta at the right, which drops under 480 px; the active row is `bg-subtle`. A group has a label with an optional "6 of 23". Add a loading row the same size (AC-6, AC-8, AC-9, AC-10, AC-23, Q3c, Q3e)
      Check: pnpm test packages/ui/src/components/search-result.test.tsx; pnpm gate style-policy component-coverage
      Files: packages/ui/src/components/search-result.tsx, search-result.test.tsx, search-result.stories.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 9: Add `SearchPalette` to `@devhub/ui`: the head's 40 px combobox with the magnifier and a hidden label, and the grouped listbox. ↑ and ↓ move the active option across groups and stop at the ends, Enter picks, and the active row scrolls into view. A polite region reads the count. The body takes the hint, empty and error forms (AC-1, AC-5, AC-11, AC-20, AC-29, Q3b, Q3d)
      Check: pnpm test packages/ui/src/components/search-palette.test.tsx; pnpm gate style-policy component-coverage
      Files: packages/ui/src/components/search-palette.tsx, search-palette.test.tsx, search-palette.stories.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 10: Move Home's word matching into a shared function. Write search's pure part: matching each kind's text, exact key or number first, 6 per group with totals, and the spoken count (AC-6, AC-7, AC-8, AC-9, AC-10, AC-16, AC-21, Q5)
      Check: pnpm test packages/app/src/lib packages/app/src/features/search packages/app/src/features/home
      Files: packages/app/src/lib/match-words.ts, match-words.test.ts, packages/app/src/features/home/inbox-view.ts, packages/app/src/features/search/search-results.ts, search-results.test.ts
- [ ] Task 11: ⌘K, Ctrl+K and the Search button (full sidebar and rail) open the Search dialog. Focus goes to its box, and the hint line shows. Esc, a click outside or ⌘K closes it, focus goes back, and the text is dropped. 001's inactive-Search tests change (AC-1, AC-2, AC-3, AC-4, AC-5, AC-19, AC-20)
      Check: pnpm test packages/app/src/shell packages/app/src/features/search; pnpm gate style-policy
      Files: packages/app/src/shell/shortcuts.ts, shortcuts.test.tsx, use-shortcuts.ts, sidebar.tsx, sidebar.test.tsx, app-shell.tsx, packages/app/src/features/search/store.ts, components/search-dialog.tsx, search-dialog.test.tsx
- [ ] Task 12: Show results as you type, from `useSearch`, which asks when the dialog first opens. `inbox.changed`, `sessions.changed` and `status.changed` refresh it. Enter or a click opens a ticket (its session or Jira), a pull request or a session, and the dialog closes (AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18)
      Check: pnpm test packages/app/src/features/search packages/app/src/live-updates.test.tsx
      Files: packages/app/src/features/search/queries.ts, components/search-dialog.tsx, search-dialog.test.tsx, packages/app/src/live-updates.tsx, live-updates.test.tsx, packages/app/src/test/msw.ts
- [ ] Task 13: Add the dialog's states: loading rows, nothing to search with Open Settings, a tool still syncing, no matches, and the error with Try again. A sync that changes the results keeps the text and the active item (AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27)
      Check: pnpm test packages/app/src/features/search
      Files: packages/app/src/features/search/components/search-dialog.tsx, search-dialog.test.tsx
- [ ] Task 14: Add an e2e run with Jira and GitHub faked: ⌘K, typing, the arrow keys, and Enter opening Jira in a new tab, then Esc giving focus back (AC-1, AC-6, AC-11, AC-12, AC-19)
      Check: pnpm test:e2e e2e/search.spec.ts
      Files: e2e/search.spec.ts
- [ ] Task 15: Update `docs/architecture.md` (the search route, `Dialog`), `learn/the-inbox.md` (the cache keeps every open pull request), and add `learn/search.md`: what search reads, why matching runs in the browser, and how ⌘K is caught
      Check: pnpm gate learn-freshness specs; pnpm exec prettier --check docs learn
      Files: docs/architecture.md, learn/the-inbox.md, learn/search.md
- [x] Task 16: WAIT for 008 to merge. Then move this branch onto `main`, take 008's `SearchField`, and run the full check
      Check: git rebase origin/main; pnpm verify
      Files: none, unless the rebase shows a conflict
- [x] Task 17: Built in task 4, because 008 merged first. Add the sprint's tickets: the sprint in Jira's rank order, then the other assigned issues by key, each ticket once. `inbox.changed` already covers the sprint's sync (AC-16, Q1d)
      Check: pnpm test packages/core/src/search packages/core/src/routes/search.test.ts
      Files: packages/core/src/search/search-service.ts, search-service.test.ts, packages/core/src/create-server.ts
- [ ] Task 18: Open search in a real browser at 360 and 1280 px, light and dark, in each state. Compare with Q3, run axe, check for sideways scroll and layout shift as it opens, and try ⌘K over a text field. Fix what turns up, then run the full check (AC-29, AC-30)
      Check: pnpm dev in a browser; pnpm verify; pnpm test:coverage at 90% or more
      Files: whichever the check shows need fixing
- [ ] Task 19: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
