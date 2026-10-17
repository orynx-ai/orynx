# Tasks: Home inbox

One task is one commit. Test first, then code. Tick a task only when its Check passes.

Tasks 1 to 15 need nothing from 006. Tasks 16 to 21 wait until 006 merges.

- [x] Task 1: Add the inbox contract: the item (source, tab, title, subject, reason, wait start, target), each tool's sync state and problem, the sync time, the three paths, the `inbox.changed` event and test builders (AC-1, AC-24)
      Check: pnpm test packages/contracts; pnpm typecheck
      Files: packages/contracts/src/inbox.ts, inbox.test.ts, routes.ts, events.ts, index.ts, testing.ts
- [x] Task 2: Add the cache with better-sqlite3 and drizzle-orm: records per tool as checked JSON, each tool's last sync and problem, emptying, forgetting a tool, and a damaged or older file deleted and made again (AC-28, AC-29, AC-30, AC-31)
      Check: pnpm test packages/core/src/inbox/inbox-cache.test.ts; pnpm gate boundaries
      Files: packages/core/package.json, pnpm-workspace.yaml, pnpm-lock.yaml (through pnpm add), packages/core/src/inbox/inbox-cache.ts, inbox-cache.test.ts
- [x] Task 3: Read Jira's assigned, unfinished issues (`search/jql`) and its priority order in `client.ts`, and map them to records by status category in `map.ts` (AC-2, AC-4, AC-5)
      Check: pnpm test packages/core/src/integrations/jira
      Files: packages/core/src/integrations/jira/client.ts, client.test.ts, map.ts, map.test.ts, packages/core/src/test/fake-jira.ts
- [x] Task 4: Read GitHub's review requests and your own pull requests in one GraphQL query in `client.ts`, and map them to records in `map.ts`: request time, failing checks and when they failed, unresolved threads whose last comment isn't yours (AC-6, AC-8, AC-9, AC-10)
      Check: pnpm test packages/core/src/integrations/github
      Files: packages/core/src/integrations/github/client.ts, client.test.ts, map.ts, map.test.ts, packages/core/src/test/fake-github.ts
- [x] Task 5: Add `rules.ts`: records, the inbox rules and waiting sessions become rows: one per ticket or pull request with the most pressing reason, a waiting session taking over its ticket's row, the tab, the link, longest wait first (AC-1, AC-3, AC-7, AC-11, AC-12, AC-15)
      Check: pnpm test packages/core/src/inbox/rules.test.ts
      Files: packages/core/src/inbox/rules.ts, rules.test.ts
- [x] Task 6: Give each connection one call that hands out its working credentials, or the problem that stops it (refused, sign-in needed, missing token, keychain, gh)
      Check: pnpm test packages/core/src/integrations
      Files: packages/core/src/integrations/jira/connection.ts, connection.test.ts, packages/core/src/integrations/github/connection.ts, connection.test.ts
- [x] Task 7: Add the sync service: one sync at a time, the connected tools side by side, each tool's records or its problem into the cache, the time every connected tool last answered, `inbox.changed` at the end, nothing written for a tool disconnected during the sync (AC-3, AC-16, AC-24, AC-25)
      Check: pnpm test packages/core/src/inbox/inbox-service.test.ts
      Files: packages/core/src/inbox/inbox-service.ts, inbox-service.test.ts
- [x] Task 8: Add `GET /api/inbox`, `POST /api/inbox/refresh` and `DELETE /api/inbox/cache`, and wire the service and the cache into `createServer` (AC-1, AC-15, AC-17, AC-19, AC-21, AC-23, AC-31)
      Check: pnpm test packages/core/src/routes/inbox.test.ts; pnpm typecheck
      Files: packages/core/src/routes/inbox.ts, inbox.test.ts, packages/core/src/create-server.ts, packages/core/src/index.ts
- [x] Task 9: Add the `autoSync` schedule: a sync at start, every 2 minutes while a page has the event stream open, at once when a tool connects, and a disconnected tool's records removed. The event bus counts open pages apart from its own listeners (AC-16, AC-30)
      Check: pnpm test packages/core/src/inbox packages/core/src/events packages/core/src/routes/events.test.ts
      Files: packages/core/src/inbox/inbox-schedule.ts, inbox-schedule.test.ts, packages/core/src/events/event-bus.ts, event-bus.test.ts, packages/core/src/routes/events.ts, events.test.ts, packages/core/src/create-server.ts
- [x] Task 10: The host opens `<DEVHUB_HOME>/cache.db` and turns `autoSync` on. Add a leak test: the real hub at trace level through a sync, with no token in the log or the cache and no description or comment text in the cache (AC-28)
      Check: pnpm test apps/server packages/core/src/inbox/no-leaks.test.ts; pnpm gate secrets env-policy
      Files: apps/server/src/main.ts, packages/core/src/inbox/no-leaks.test.ts
- [x] Task 11: Add `inbox()`, `refreshInbox()` and `clearInboxCache()` to the api-client with their query options (AC-16, AC-17, AC-27, AC-31)
      Check: pnpm test packages/api-client
      Files: packages/api-client/src/endpoints/inbox.ts, inbox.test.ts, client.ts, queries.ts, index.ts
- [x] Task 12: Write Home's words as pure functions: each pill's text, spoken text and tone, the waits, each sub line, each action and its link, the sync line and each tool's line (AC-5, AC-13, Q2, Q5, Q6, Q8)
      Check: pnpm test packages/app/src/features/home
      Files: packages/app/src/features/home/inbox-words.ts, inbox-words.test.ts
- [x] Task 13: Show the sidebar's Home count, with the hidden words " need you", hidden at 0 and on the collapsed rail. `inbox.changed`, `settings.changed` and `status.changed` refresh it (moved here from task 11, because the count is the first thing on screen that reads the inbox) (AC-15, AC-16, AC-32)
      Check: pnpm test packages/app/src/shell packages/app/src/live-updates.test.tsx; pnpm gate style-policy component-coverage
      Files: packages/app/src/shell/sidebar.tsx, sidebar.test.tsx, packages/app/src/features/home/queries.ts, packages/app/src/live-updates.tsx, live-updates.test.tsx, packages/app/src/test/msw.ts
- [x] Task 14: Add Clear cache at the bottom of Settings › Inbox rules, with its line and "Cache cleared." for screen readers (AC-31, Q7)
      Check: pnpm test packages/app/src/features/settings; pnpm gate style-policy
      Files: packages/app/src/features/settings/components/inbox-rules-panel.tsx, inbox-rules-panel.test.tsx
- [x] Task 15: Update `docs/architecture.md` (the cache is decided, the inbox routes, `autoSync`) and add `learn/the-inbox.md`: how a sync runs, where the cache lives, and why the words are written in the browser
      Check: pnpm gate learn-freshness specs; pnpm exec prettier --check docs learn
      Files: docs/architecture.md, learn/the-inbox.md
- [x] Task 16: WAIT for 006 to merge. Then move this branch onto `main` and run the full check
      Check: git rebase main; pnpm verify
      Files: none, unless the rebase shows a conflict
- [x] Task 17: Build the "Needs your attention" panel on Home: head, the three tabs with counts and the tab in the address, and the rows from `AttentionList` and `AttentionRow` with their links (AC-1, AC-2, AC-6, AC-9, AC-10, AC-12, AC-14)
      Check: pnpm test packages/app/src/features/home; pnpm gate style-policy design-source component-coverage
      Files: packages/app/src/features/home/home-screen.tsx, home-screen.test.tsx, components/attention-panel.tsx, attention-panel.test.tsx, packages/app/src/router.tsx
- [x] Task 18: Home's states: loading rows, nothing connected, nothing matching (each tab), a tool not connected, a tool's failed sync, rules off, and the list not loading (AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27)
      Check: pnpm test packages/app/src/features/home
      Files: packages/app/src/features/home/components/attention-panel.tsx, attention-panel.test.tsx
- [ ] Task 19: The page bar: "Synced 2 min ago" moving on each minute, "Syncing" the first time, and Refresh with its spinner (AC-16, AC-17, AC-19, AC-20)
      Check: pnpm test packages/app/src/features/home
      Files: packages/app/src/features/home/home-screen.tsx, home-screen.test.tsx, components/sync-status.tsx, sync-status.test.tsx
- [ ] Task 20: Keep focus and scroll when a sync changes the rows: a gone row's focus moves to the next row's title, or to the selected tab. Add an e2e run of Home with Jira and GitHub faked (AC-16, AC-18, AC-33)
      Check: pnpm test packages/app/src/features/home; pnpm test:e2e e2e/home-inbox.spec.ts
      Files: packages/app/src/features/home/components/attention-panel.tsx, attention-panel.test.tsx, e2e/home-inbox.spec.ts
- [ ] Task 21: Open Home in a real browser at 360 and 1280 px, light and dark, in each state: compare with the design, run axe, check for sideways scroll and for movement while loading, Tab through. Fix what turns up, then run the full check (AC-34)
      Check: pnpm dev in a browser; pnpm verify; pnpm test:coverage at 90% or more
      Files: whichever the check shows need fixing
- [ ] Task 22: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
