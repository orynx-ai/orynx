# Tasks: Tickets board and list

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Add the tickets contract: the ticket (key, title, link, status, column, type, bug, priority and level, due day, assignee, session), the sprint, Jira's sprint state, whether more were left, the path and test builders (AC-1, AC-2, AC-26)
      Check: pnpm test packages/contracts; pnpm typecheck
      Files: packages/contracts/src/tickets.ts, tickets.test.ts, routes.ts, events.ts, index.ts, testing.ts
- [x] Task 2: Read who you are, find the sprint field by its type, read your issues in open sprints with it, and read a board's columns and project in Jira's `client.ts` (AC-1, AC-3, AC-4, AC-5)
      Check: pnpm test packages/core/src/integrations/jira
      Files: packages/core/src/integrations/jira/client.ts, client.test.ts, packages/core/src/test/fake-jira.ts
- [x] Task 3: Read every issue in a sprint in rank order through `nextPageToken`, 100 a page, at most 300, with whether more were left (AC-1, AC-26)
      Check: pnpm test packages/core/src/integrations/jira
      Files: packages/core/src/integrations/jira/client.ts, client.test.ts, packages/core/src/test/fake-jira.ts
- [x] Task 4: Add `sprint-map.ts`: pick the sprint (Q1), put each status in a column by category and the board's order (Q2), give each priority its bars (Q7a), and make the cache record with titles and metadata only. The board's columns give status ids only, so `client.ts` also reads the site's status categories (`GET /rest/api/3/status`) to find the first in-progress column (AC-1, AC-3, AC-4, AC-5, AC-28)
      Check: pnpm test packages/core/src/integrations/jira
      Files: packages/core/src/integrations/jira/sprint-map.ts, sprint-map.test.ts, map.ts, client.ts, client.test.ts, packages/core/src/test/fake-jira.ts
- [x] Task 5: Add the tickets service: sync the sprint into its own cache part with its last sync and problem, write only while the same account is connected, and read it back with each ticket's newest session joined (AC-12, AC-19, AC-22, AC-23, AC-24, AC-26)
      Check: pnpm test packages/core/src/tickets
      Files: packages/core/src/tickets/tickets-service.ts, tickets-service.test.ts, packages/core/src/inbox/inbox-cache.ts, tool-state.ts, inbox-service.ts
- [ ] Task 6: Sync the sprint side by side with Jira's issues and GitHub in the inbox's `run()`, and let a disconnect, Clear cache and a sync that finds Jira gone take the sprint too (AC-17, AC-29)
      Check: pnpm test packages/core/src/inbox packages/core/src/tickets
      Files: packages/core/src/inbox/inbox-service.ts, inbox-service.test.ts, inbox-schedule.test.ts
- [ ] Task 7: Add `GET /api/tickets` and wire the tickets service into `createServer`. The leak test also checks the sprint part (AC-1, AC-21, AC-28)
      Check: pnpm test packages/core/src/routes/tickets.test.ts packages/core/src/inbox/no-leaks.test.ts; pnpm typecheck
      Files: packages/core/src/routes/tickets.ts, tickets.test.ts, packages/core/src/create-server.ts, packages/core/src/index.ts, packages/core/src/inbox/no-leaks.test.ts
- [ ] Task 8: Add `tickets()` and its query options to the api-client, and let `inbox.changed`, `status.changed` and `sessions.changed` refresh it (AC-17, AC-25)
      Check: pnpm test packages/api-client packages/app/src/live-updates.test.tsx
      Files: packages/api-client/src/endpoints/tickets.ts, tickets.test.ts, client.ts, queries.ts, index.ts, packages/app/src/live-updates.tsx, live-updates.test.tsx, packages/app/src/test/msw.ts
- [ ] Task 9: Move Home's calendar helpers to one shared file, and write Tickets' words as pure functions: each due date and its spoken form and `soon` (Q7b), the sprint meta (Q9a), the count, the columns and their empty texts, the avatars, and the no-sprint, can't-load and too-many lines (Q9) (AC-2, AC-6, AC-14, AC-15, AC-16, AC-22, AC-25, AC-26)
      Check: pnpm test packages/app/src/words packages/app/src/features/home packages/app/src/features/tickets
      Files: packages/app/src/words/calendar.ts, calendar.test.ts, packages/app/src/features/home/inbox-words.ts, packages/app/src/features/tickets/ticket-words.ts, ticket-words.test.ts
- [ ] Task 10: Write the filters as pure functions: Assigned to me, Due this week, Bugs only, the search text, grouping into columns, and reading and writing them as the address's search params (Q3) (AC-7, AC-8, AC-9, AC-10)
      Check: pnpm test packages/app/src/features/tickets
      Files: packages/app/src/features/tickets/filters.ts, filters.test.ts
- [ ] Task 11: Add `SearchField` to `@devhub/ui`: an Input with the search icon and an `aria-label`, in 40 px and 32 px sizes (Q10c)
      Check: pnpm test packages/ui; pnpm gate style-policy component-coverage
      Files: packages/ui/src/components/search-field.tsx, search-field.stories.tsx, search-field.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 12: Add `Board` and `BoardColumn` to `@devhub/ui`: a named, focusable region that scrolls its columns sideways, and a column with its status icon, heading, count, cards or empty text, and a loading form (Q10a, Q10d) (AC-20, AC-30, AC-31)
      Check: pnpm test packages/ui; pnpm gate style-policy component-coverage
      Files: packages/ui/src/components/board.tsx, board.stories.tsx, board.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 13: Add `Table` to `@devhub/ui` from shadcn's table, restyled to the screen's list: a hidden caption, a header row on `bg-sidebar`, a border between rows, and loading rows (Q10b, Q10d) (AC-11, AC-20)
      Check: pnpm test packages/ui; pnpm gate style-policy component-coverage
      Files: packages/ui/src/components/table.tsx, table.stories.tsx, table.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 14: Build Tickets' page bar and toolbar: the breadcrumb with the sprint, the meta, Search tickets, Board / List remembered on this computer, the filters in the address, Clear filters, and the count read out politely (AC-1, AC-7, AC-8, AC-9, AC-10, AC-31)
      Check: pnpm test packages/app/src/features/tickets; pnpm gate style-policy design-source component-coverage
      Files: packages/app/src/features/tickets/tickets-screen.tsx, tickets-screen.test.tsx, store.ts, queries.ts, components/tickets-toolbar.tsx, packages/app/src/router.tsx
- [ ] Task 15: Build the board: the four columns with their counts, cards from `WorkItemCard` with the agent chip, the title's link (session or Jira, Q4a), and each column's empty text (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-12, AC-13, AC-14, AC-15)
      Check: pnpm test packages/app/src/features/tickets
      Files: packages/app/src/features/tickets/components/tickets-board.tsx, tickets-board.test.tsx, components/ticket-card.tsx
- [ ] Task 16: Build the list: the same tickets in `Table` with Key, Title, Status, Priority, Due and Agent, in column then rank order, and its empty text (AC-11, AC-16)
      Check: pnpm test packages/app/src/features/tickets
      Files: packages/app/src/features/tickets/components/tickets-list.tsx, tickets-list.test.tsx
- [ ] Task 17: Tickets' states: loading, Jira not connected, no sprint, a failed sync's line, the server not answering and too many tickets (AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26)
      Check: pnpm test packages/app/src/features/tickets
      Files: packages/app/src/features/tickets/tickets-screen.tsx, tickets-screen.test.tsx
- [ ] Task 18: Keep focus and scroll when a sync changes the cards, and move the search field into the toolbar under 768 px (AC-17, AC-18, AC-30, AC-32)
      Check: pnpm test packages/app/src/features/tickets
      Files: packages/app/src/features/tickets/components/tickets-board.tsx, tickets-board.test.tsx, tickets-screen.tsx, components/tickets-toolbar.tsx
- [ ] Task 19: Show the sidebar's Tickets count with the hidden words " in your sprint", hidden at 0 and on the collapsed rail (AC-27)
      Check: pnpm test packages/app/src/shell; pnpm gate style-policy
      Files: packages/app/src/shell/sidebar.tsx, sidebar.test.tsx, packages/app/src/features/tickets/queries.ts
- [ ] Task 20: Update `docs/architecture.md` (the tickets route, the sprint reads), add `learn/the-tickets-board.md` (how the sprint is found, the columns and In review, the cache part), and put 019 "New ticket" on the roadmap (Q5). Add an e2e run of Tickets with Jira not connected: no layout shift and no axe violations at 360 and 1280 px
      Check: pnpm gate learn-freshness specs; pnpm exec prettier --check docs learn; pnpm test:e2e e2e/tickets.spec.ts
      Files: docs/architecture.md, learn/the-tickets-board.md, docs/product/roadmap.md, e2e/tickets.spec.ts
- [ ] Task 21: Open Tickets in a real browser at 360 and 1280 px, light and dark, in each state, from a seeded scratch `DEVHUB_HOME`: compare with the design, run axe, check for sideways scroll and movement while loading, and Tab through. Fix what turns up, then run the full check (AC-32)
      Check: pnpm dev in a browser; pnpm verify; pnpm test:coverage at 90% or more
      Files: whichever the check shows need fixing
- [ ] Task 22: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
