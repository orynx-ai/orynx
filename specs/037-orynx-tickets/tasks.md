# Tasks: Orynx tickets

One task is one commit. Test first, then code. Tick a task only when its Check passes. Per `/build`, a task runs its Check, one `pnpm typecheck` and the gates its change needs. `/review` runs `pnpm verify` and the e2e suite.

**Contracts and core**

- [x] Task 1: Contracts for Orynx tickets (AC-35, AC-44) - `isOrynxKey` and `ticketSource`; the fields with their limits; the ticket, with its version, creator, `doneAt` and session. - The create, update and delete bodies and their answers. - The route paths, the `tickets.changed` event, and the agents' access and config. - `TicketSchema.url` becomes nullable, and `TicketsSchema` gains `orynx.kept`. `SessionTicket` gains `deleted`. - Builders for all of these.
      Check: pnpm test packages/contracts/src/orynx-tickets.test.ts packages/contracts/src/tickets.test.ts packages/contracts/src/session.test.ts; pnpm typecheck
      Files: packages/contracts/src/orynx-tickets.ts, packages/contracts/src/orynx-tickets.test.ts, packages/contracts/src/tickets.ts, packages/contracts/src/session.ts, packages/contracts/src/events.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [x] Task 2: The store, `tickets.json` (AC-7, AC-18, AC-33, AC-34) - Writes go to a temporary file that is then renamed, mode 0600, one change at a time. - `ORX-n` counts on and never reuses a number. `doneAt` is set on entering Done and cleared on leaving it. - An update with a stale version says `changed`. - An unreadable file is renamed to `tickets-<stamp>.unreadable.json` and never saved over.
      Check: pnpm test packages/core/src/orynx-tickets/ticket-store.test.ts
      Files: packages/core/src/orynx-tickets/ticket-store.ts, packages/core/src/orynx-tickets/ticket-store.test.ts
- [x] Task 3: The service and its routes (AC-7, AC-11, AC-16, AC-18, AC-32, AC-35) - POST, GET, PATCH and DELETE on `/api/orynx-tickets`. - Each change publishes `tickets.changed`. The newest live session is joined. - Wired in `createServer` at `<DEVHUB_HOME>/tickets.json`. - Covers 400, 404 and 401, and a failed write answers 500 with nothing created.
      Check: pnpm test packages/core/src/routes/orynx-tickets.test.ts packages/core/src/orynx-tickets/ticket-service.test.ts
      Files: packages/core/src/orynx-tickets/ticket-service.ts, packages/core/src/orynx-tickets/ticket-service.test.ts, packages/core/src/routes/orynx-tickets.ts, packages/core/src/routes/orynx-tickets.test.ts, packages/core/src/create-server.ts
- [x] Task 4: The board's answer holds Orynx tickets (AC-1, AC-4, AC-21, AC-34) - `GET /api/tickets` appends them as Ticket rows: the column's status words, you as the assignee by your git name, the session joined, and Done after 14 days left out. - They are there with Jira not connected or syncing. - The answer says whether a file was kept aside.
      Check: pnpm test packages/core/src/tickets/tickets-service.test.ts packages/core/src/routes/tickets.test.ts
      Files: packages/core/src/tickets/tickets-service.ts, packages/core/src/tickets/tickets-service.test.ts, packages/core/src/routes/tickets.test.ts, packages/core/src/create-server.ts
- [x] Task 5: ⌘K's index holds every Orynx ticket, old Done ones included (AC-21, AC-26) - Each one's target is its session, or else its ticket dialog.
      Check: pnpm test packages/core/src/search/search-service.test.ts
      Files: packages/core/src/search/search-service.ts, packages/core/src/search/search-service.test.ts, packages/contracts/src/search.ts
- [x] Task 6: Sessions on an Orynx ticket (AC-19, AC-24, AC-27) - The context reader reads `ORX-` keys from the store. - The brief says "Orynx ticket ORX-2 (Task): …" with its priority, status and due date. - `describeTicket` uses the store, and `jiraUrl` is null. - The folder ignores Jira projects for `ORX-` keys. - The Ticket tab says `deleted` when the ticket has gone.
      Check: pnpm test packages/core/src/sessions/context-reader.test.ts packages/core/src/sessions/brief.test.ts packages/core/src/sessions/compose.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/context-reader.ts, packages/core/src/sessions/brief.ts, packages/core/src/sessions/compose.ts, packages/core/src/sessions/session-service.ts, packages/core/src/create-server.ts, and their tests
- [x] Task 7: The ticket tools, defined once (AC-28, AC-29, AC-44) - list, get, create, update and delete, each with a zod input, an access level and a `run()` against the service. - The actor is bound when the list is made: you, a session, or an outside agent. - Each call answers text plus what happened.
      Check: pnpm test packages/core/src/orynx-tickets/tools.test.ts
      Files: packages/core/src/orynx-tickets/tools.ts, packages/core/src/orynx-tickets/tools.test.ts
- [x] Task 8: A session's agent gets the tools (AC-28, AC-29, AC-31, AC-44) - `AgentRunOptions.tools`; Claude's adapter mounts them as the SDK MCP server `orynx`. - Each finished call is a `ticket` work event, which becomes a `ticket` step. - The session service passes the read tools for Ask and all of them for Build.
      Check: pnpm test packages/core/src/agents/claude/claude-adapter.test.ts packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/progress.test.ts
      Files: packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/progress.ts, packages/core/src/test/fake-claude-sdk.ts, packages/core/package.json, apps/server/package.json, and their tests
- [x] Task 9: Deleting a ticket asks (AC-30, AC-31) - The tool decision allows `mcp__orynx__` reads and writes, keeps Ask sessions to reads, and turns delete into a `ticket` ask with the key and title. - It becomes a `ticket` approval on the session (Allow once or Deny only), with a notification. - Deny is said back to Claude.
      Check: pnpm test packages/core/src/agents/claude/tool-decision.test.ts packages/core/src/routes/session-approvals.test.ts packages/core/src/notifications
      Files: packages/core/src/agents/claude/tool-decision.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/agents/agent-adapter.ts, packages/core/src/sessions/session-service.ts, packages/core/src/notifications/*, and their tests
- [x] Task 10: The outside door (AC-39, AC-41, AC-42, AC-44) - The agent token is kept in the keychain under the `agents` account. - `GET` and `PUT /api/agents/access` turn the door on and off. - `POST /api/mcp` runs the MCP SDK's stateless transport with the tools minus delete, and the creator comes from `x-orynx-agent`. - `local-only` takes the bearer token on that path only. - The test uses the MCP SDK's client over HTTP: no token, the page's token, a wrong token, a foreign Host, an encoded path, and after Off.
      Check: pnpm test packages/core/src/agents-access packages/core/src/routes/mcp.test.ts packages/core/src/plugins/local-only.test.ts
      Files: packages/core/src/agents-access/agent-access.ts, packages/core/src/agents-access/agent-access.test.ts, packages/core/src/routes/mcp.ts, packages/core/src/routes/mcp.test.ts, packages/core/src/routes/agents-access.ts, packages/core/src/plugins/local-only.ts, packages/core/src/secrets/keychain.ts, packages/core/src/create-server.ts
- [x] Task 11: The bridge (AC-40, AC-42, AC-43) - `POST /api/agents/access/config` writes `<DEVHUB_HOME>/mcp/orynx-mcp-<id>.mjs` (0600, holding the token) and answers the config: the program, with `ELECTRON_RUN_AS_NODE` under Electron, and the file. - The test spawns the real bridge with node against a listening hub: initialize, list the tools, create a ticket, and carry on after the port changes in `runtime.json`. - After Off and On, the old file is gone.
      Check: pnpm test packages/core/src/agents-access/bridge.test.ts
      Files: packages/core/src/agents-access/bridge.ts, packages/core/src/agents-access/bridge.test.ts, packages/core/src/agents-access/agent-access.ts

**api-client**

- [x] Task 12: Endpoints and queries for Orynx tickets and agents' access; `tickets.changed` invalidates tickets, the ticket, search and the count (AC-14, AC-32)
      Check: pnpm test packages/api-client/src/orynx-tickets.test.ts packages/app/src/live-updates.test.tsx
      Files: packages/api-client/src/endpoints/orynx-tickets.ts, packages/api-client/src/endpoints/agents-access.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/orynx-tickets.test.ts, packages/app/src/live-updates.tsx

**@devhub/ui (shadcn, restyled to tokens)**

- [x] Task 13: `AlertDialog`, from shadcn: Cancel focused first, the buttons at the end, and a danger action (AC-17, AC-37)
      Check: pnpm test packages/ui/src/components/alert-dialog.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/alert-dialog.tsx, .stories.tsx, .test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 14: `Popover` and `Calendar`, from shadcn, with `react-day-picker` added; arrows, Page Up and Page Down, Enter and Esc (AC-38)
      Check: pnpm test packages/ui/src/components/popover.test.tsx packages/ui/src/components/calendar.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/popover.tsx, packages/ui/src/components/calendar.tsx, and their stories and tests, packages/ui/package.json, packages/ui/src/index.ts, docs/architecture.md, docs/design-map.md
- [x] Task 15: `DatePicker`: a field that reads "Pick a date" or the date, opens the calendar, has Clear date, and puts focus back on close (AC-38)
      Check: pnpm test packages/ui/src/components/date-picker.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/date-picker.tsx, .stories.tsx, .test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 16: `WorkItemCard` takes a `mark` before its key, with a story (AC-1)
      Check: pnpm test packages/ui/src/components/work-item-card.test.tsx
      Files: packages/ui/src/components/work-item-card.tsx, .stories.tsx, .test.tsx

**App**

- [x] Task 17: The Source filter, a sixth FilterMenu before Assignee (AC-1, AC-2, AC-3, AC-20) - Kept in the address. Unticking Jira hides the pickers, and the breadcrumb reads "Tickets / Orynx". - The sidebar count adds your open Orynx tickets.
      Check: pnpm test packages/app/src/features/tickets/filters.test.ts packages/app/src/features/tickets/tickets-screen.test.tsx packages/app/src/features/tickets/components/tickets-toolbar.test.tsx
      Files: packages/app/src/features/tickets/filters.ts, tickets-screen.tsx, components/tickets-toolbar.tsx, queries.ts, ticket-words.ts, and their tests
- [x] Task 18: Tickets without Jira (AC-4, AC-5, AC-34) - The board shows Orynx tickets under the "Jira isn't connected" line. - With none, it reads "No Orynx tickets yet." with New ticket. - The kept-file line shows when a file was kept aside.
      Check: pnpm test packages/app/src/features/tickets/tickets-screen.test.tsx
      Files: packages/app/src/features/tickets/tickets-screen.tsx, ticket-words.ts, tickets-screen.test.tsx
- [ ] Task 19: The Orynx mark on cards and list rows (AC-1, AC-22)
      Check: pnpm test packages/app/src/features/tickets/components/ticket-card.test.tsx packages/app/src/features/tickets/components/tickets-list.test.tsx
      Files: packages/app/src/features/tickets/components/ticket-card.tsx, tickets-list.tsx, and their tests
- [ ] Task 20: New ticket: the page bar button and each column's + open one form (AC-6 to AC-12) - Built with react-hook-form, the contract's schema and DatePicker. - Defaults are Task, Medium and the column's status. Enter in Title creates the ticket, and Esc returns focus. - Field errors as Q12d, the save error as Q12e, and a pending button.
      Check: pnpm test packages/app/src/features/tickets/components/ticket-form.test.tsx packages/app/src/features/tickets/components/tickets-board.test.tsx
      Files: packages/app/src/features/tickets/components/ticket-form.tsx, new-ticket.tsx, tickets-board.tsx, tickets-screen.tsx, schemas.ts, queries.ts, ticket-words.ts, store.ts, and their tests
- [ ] Task 21: The ticket dialog for an Orynx ticket (AC-13, AC-14) - The Orynx mark, its fields and the Markdown description. - A Status picker that saves at once, and the created line. - Ship, Open session, Edit and Delete ticket, with no Open in Jira.
      Check: pnpm test packages/app/src/features/tickets/components/ticket-dialog.test.tsx
      Files: packages/app/src/features/tickets/components/ticket-dialog.tsx, orynx-ticket-view.tsx, ticket-words.ts, queries.ts, and their tests
- [ ] Task 22: Edit in the dialog (AC-15, AC-16) - The same form, filled in, and Save changes. - A stale version keeps your edits and says so; Save again writes over.
      Check: pnpm test packages/app/src/features/tickets/components/ticket-dialog.test.tsx
      Files: packages/app/src/features/tickets/components/orynx-ticket-view.tsx, ticket-form.tsx, queries.ts, and their tests
- [ ] Task 23: Delete ticket through the AlertDialog (AC-17, AC-18) - Cancel changes nothing. Delete removes the ticket and puts focus on New ticket.
      Check: pnpm test packages/app/src/features/tickets/components/delete-ticket.test.tsx
      Files: packages/app/src/features/tickets/components/delete-ticket.tsx, orynx-ticket-view.tsx, queries.ts, ticket-words.ts, and their tests
- [ ] Task 24: The composer and ⌘K know Orynx tickets (AC-23, AC-25, AC-26) - The mark by key on chips, the context dialog and the strip. - Add context lists Orynx tickets even without Jira, and its item reads "Ticket". - ⌘K's ticket target opens the dialog.
      Check: pnpm test packages/app/src/features/home/components/add-context.test.tsx packages/app/src/features/home/components/context-strip.test.tsx packages/app/src/features/search
      Files: packages/app/src/features/home/components/add-context.tsx, context-strip.tsx, context-dialog.tsx, composer-words.ts, packages/app/src/features/search/*, and their tests
- [ ] Task 25: The Session screen on an Orynx ticket (AC-19, AC-27, AC-28, AC-29, AC-30) - No Open in Jira; the Ticket tab with the Orynx mark and "ORX-3 was deleted." - The `ticket` step's words, and the approval callout for a delete (Allow once and Deny).
      Check: pnpm test packages/app/src/features/sessions/step-words.test.ts packages/app/src/features/sessions/approval-words.test.ts packages/app/src/features/sessions/components/ticket-panel.test.tsx packages/app/src/features/sessions/components/approval-callout.test.tsx packages/app/src/features/sessions/components/context-panel.test.tsx
      Files: packages/app/src/features/sessions/step-words.ts, approval-words.ts, ticket-tab-words.ts, components/ticket-panel.tsx, components/approval-callout.tsx, components/context-panel.tsx, session-screen.tsx, packages/app/src/features/notifications/*, and their tests
- [ ] Task 26: Settings › Coding agent's "Other agents" row (AC-39, AC-40) - A Switch; when it is on, Copy MCP config copies the config the server writes. - Turning it off says so, and a failed change says spec 005's line.
      Check: pnpm test packages/app/src/features/settings/components/other-agents.test.tsx packages/app/src/features/settings/components/coding-agent-panel.test.tsx
      Files: packages/app/src/features/settings/components/other-agents.tsx, coding-agent-panel.tsx, queries.ts, and their tests

**End to end and docs**

- [ ] Task 27: e2e across the whole flow (AC-1 to AC-38) - Create through + and New ticket, then the status picker, edit, delete and the Source filter. - Tickets without Jira. - An outside agent through the real bridge. - axe and no sideways scroll at 360 and 1280 px, in light and dark.
      Check: pnpm exec playwright test e2e/orynx-tickets.spec.ts
      Files: e2e/orynx-tickets.spec.ts, e2e/fake-tools/* if needed
- [ ] Task 28: Docs - `architecture.md` (tickets.json, the two doors, react-day-picker), `design-map.md`, the roadmap row and `learn/orynx-tickets.md`. - The Tickets learn page. - A scratchpad script for the people-owned `docs/product/spec.md` lines (Q1, Q13).
      Check: pnpm gate learn-freshness specs handbook-size
      Files: docs/architecture.md, docs/design-map.md, docs/product/roadmap.md, learn/orynx-tickets.md, learn/the-tickets-board.md
- [ ] Task 29: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
