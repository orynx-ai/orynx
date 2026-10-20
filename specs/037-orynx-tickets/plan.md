# Plan: Orynx tickets

Spec: `specs/037-orynx-tickets/spec.md`

## Shape

- **The key decides the source.** `isOrynxKey()` in contracts (`ORX-` then a number) is the only test anywhere. A ticket chip keeps `kind: 'jira'`, which is now "a ticket", so `session.json`, chips and session sources saved before this spec read as they did. Every place that draws a mark or reads a ticket asks the key.
- **One store, one service, three doors.**
  - `orynx-tickets/ticket-store.ts` owns `<DEVHUB_HOME>/tickets.json`. It writes the way `settings-store.ts` does: to a temporary file that is then renamed, mode 0600. It runs one change at a time, counts the next number, records `doneAt`, and moves an unreadable file aside without saving over it.
  - `ticket-service.ts` adds the actor and the session join on top, and publishes `tickets.changed`.
  - The three doors onto that service: the HTTP routes the page uses, the in-process tools a session's agent gets, and the local MCP server for agents outside Orynx.
- **Tools defined once.** `orynx-tickets/tools.ts` lists list, get, create, update and delete. Each has a zod input, an access level (`read`, `write` or `delete`) and a `run(input)` that answers text plus what happened. An actor is bound when the list is made.
  - **Inside a session:** `AgentRunOptions.tools` carries the list, so any `AgentAdapter` mounts it. Claude's adapter mounts it as `createSdkMcpServer({ name: 'orynx' })`. An Ask session gets the read tools only. Delete goes through `canUseTool` as a new `ticket` ask, and every finished call becomes a `ticket` step.
  - **Outside:** `POST /api/mcp` runs the MCP SDK's Streamable HTTP transport, stateless, with JSON answers. It mounts the same list without delete.
- **The outside door.**
  - `local-only.ts` still checks the Host header on `/api/mcp`. In place of the page's token it takes `Authorization: Bearer <agent token>`, compared in constant time.
  - The agent token lives in the keychain, under a new account `agents`. While it exists, the door is open.
  - "Copy MCP config" writes a bridge, `<DEVHUB_HOME>/mcp/orynx-mcp-<id>.mjs`. The bridge is dependency-free, mode 0600, and holds the token.
  - The bridge reads `runtime.json` for the port on every message, so a restart or the desktop app's new port changes nothing. It forwards each stdio JSON-RPC line, and passes on the client's name from `initialize`.
  - The copied config names only the program and that file, so the token never reaches the browser or the other tool's config.
  - Turning the row off deletes the token and the bridge. Turning it on again makes a new token and file, so an old config stops working (AC-42).
- **The board.**
  - `tickets-service.read()` appends Orynx tickets as `Ticket` rows: `url` is null (the schema allows it now), the status names are the column's words, the assignee is you (`mine`, by your git name), and the newest session is joined. A Done ticket is left out after 14 days. These rows come in every answer, Jira connected or not.
  - The app filters by source from the key. The `TicketsSchema` answer also says whether an unreadable file was kept aside (AC-34).
- **Words live in the app**, in `ticket-words.ts` and `step-words.ts`. The server sends data only.
- **UI from shadcn.** `AlertDialog`, `Popover`, `Calendar` (react-day-picker) and `DatePicker` join `@devhub/ui`, restyled to tokens, each with stories and tests. The New ticket and Edit form uses `Dialog`, `Field`, `Input`, `Textarea`, `Select` and `DatePicker`, with react-hook-form and the contract's schema.

## Order of work

1. **Contracts.** Every later step parses with these schemas.
2. **Core, from the bottom up.** Store, then service and routes, then the board merge and search, then sessions on Orynx tickets, then the tools, the agent adapter and approvals, then the outside door and the bridge. Each piece is tested on its own against the real store in a temporary `DEVHUB_HOME`, with `app.inject()` for routes and the fake SDK at its boundary.
3. **api-client and live updates.** Endpoints parse with the contracts, and `tickets.changed` maps to invalidations.
4. **`@devhub/ui` components.** AlertDialog, Popover, Calendar, DatePicker and the card's mark slot. These come before the screens that use them.
5. **App.** The Source filter and Tickets without Jira first, because they need no new UI. Then the marks, the New ticket form, the Orynx ticket dialog (view, status, edit, delete), the composer, search and session pieces, and the Settings row.
6. **e2e and docs.** One e2e file for the whole flow at 360 and 1280 px in both themes. Then the rows in `architecture.md`, `design-map.md` and the roadmap, a learn page, and the lines for the people-owned `spec.md`, handed to the user as a script.

## Risks

| Risk                                                                                                                                               | How we will notice early                                                                                                          | What we do                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code may treat SDK MCP tools differently from built-in ones (it never calls `canUseTool`, or it names them other than `mcp__orynx__<tool>`) | The adapter test checks the names the fake SDK is given. A real Ask session against the real SDK is a manual check before /review | Allow the read tools by name through `allowedTools` if `canUseTool` isn't called. Delete must still ask: if it can't, refuse delete inside a session and say so in a step |
| The MCP SDK's Streamable HTTP transport and Fastify's parsed body and `reply.hijack()`                                                             | Route test with the MCP SDK's own client over HTTP against `createServer()` listening on port 0                                   | Fall back to `enableJsonResponse` with the raw request, which is the documented stateless pattern                                                                         |
| Loosening `local-only.ts` for `/api/mcp` opens a second way in                                                                                     | Tests: no token, the page's token, a wrong token, a foreign Host, after Off, and an encoded path such as `/%61pi/mcp`             | Exempt only the exact path, keep the Host check, and compare in constant time. The security-auditor reviews it in /review                                                 |
| The bridge must run where Node isn't installed (the desktop app)                                                                                   | Unit test runs the real bridge with `node`. The packed desktop app is checked by hand                                             | Use the hub's own `process.execPath`, with `ELECTRON_RUN_AS_NODE=1` under Electron. If the packed app can't, the Settings row says so; never fail silently                |
| `tickets.json` lost or half-written                                                                                                                | Store tests: an unreadable file is kept aside, two quick writes both land, and a crash mid-write leaves the old file              | Write to a temporary file and rename, one change at a time, the same as `settings-store.ts`                                                                               |
| Changing `TicketSchema.url` to nullable breaks Jira-only readers                                                                                   | `pnpm typecheck` across packages                                                                                                  | Each reader handles null. Jira rows always have a URL                                                                                                                     |
| react-day-picker's classes vs the style-policy gate and the tokens                                                                                 | `pnpm gate style-policy` on the Calendar task, and Storybook in both themes                                                       | Map its `classNames` to token classes only. Its default CSS is never imported                                                                                             |
| A conflict with the uncommitted session edits in the main checkout and with batch 028's Tickets changes                                            | `git merge origin/main` before /review                                                                                            | Take both sides; the Tickets screen's filters and toolbar are the likely spots                                                                                            |
| Coverage under 90% from the bridge and the MCP door                                                                                                | The per-file coverage report in /review                                                                                           | Test both doors end to end in core rather than mocking them                                                                                                               |

## Touches

- Packages: contracts, core, api-client, ui, app; apps/server (dependency listing only), e2e
- New dependencies: `react-day-picker` (ui). `@modelcontextprotocol/sdk` becomes a direct dependency of core and apps/server, at the version the Agent SDK already pulls (1.32.1); architecture.md already lists it.
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, icon-buttons, test-policy, env-policy, secrets, specs, learn-freshness, handbook-size
- Skills to follow: `add-api-endpoint`, `agent-runtime`, `add-ui-component`, `build-a-screen`, `clean-ui`, `forms`, `server-state`, `client-state`, `honest-tests`
