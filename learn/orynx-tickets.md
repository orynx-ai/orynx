<!-- learn-sources: packages/contracts/src/orynx-tickets.ts packages/core/src/orynx-tickets/ticket-store.ts packages/core/src/orynx-tickets/ticket-service.ts packages/core/src/orynx-tickets/board-row.ts packages/core/src/orynx-tickets/tools.ts packages/core/src/routes/orynx-tickets.ts packages/core/src/routes/mcp.ts packages/core/src/routes/agents-access.ts packages/core/src/agents-access/agent-access.ts packages/core/src/agents-access/bridge.ts packages/core/src/plugins/local-only.ts packages/core/src/agents/claude/tool-decision.ts packages/app/src/features/tickets/components/ticket-form.tsx packages/app/src/features/tickets/components/orynx-ticket-view.tsx packages/app/src/features/settings/components/other-agents.tsx -->

# Orynx tickets: tickets of its own, for you and for any agent

Spec 037 gives Orynx tickets of its own, beside Jira's. You make, open, move, edit and delete them on Tickets. Any agent can use them too: a session's agent inside Orynx, and Claude Code, Cursor, Codex or any MCP client outside it. Four ideas carry it:

- **A key alone says where a ticket lives.**
- **One store, one service, one set of tools.**
- **Two doors open onto those tools.**
- **The page treats an Orynx ticket as a board row.**

## The key

An Orynx ticket's key is `ORX-` and a number from 1 (`isOrynxKey()`, `ticketSource()` in `contracts/src/orynx-tickets.ts`). A deleted ticket's number is never used again: the file keeps `next`. The key has Jira's shape, so everything that takes a Jira key takes it as it is:

- a composer chip (`kind: 'jira'` means "a ticket" now);
- a session's source and its branch (`feat/ORX-12`);
- the brief and ⌘K.

Wherever the source matters, the code asks the key: the mark it draws (`SourceMark source={ticketSource(key)}`), where it reads the ticket from (Orynx or Jira), and the Jira link (none).

## The store and the service

`orynx-tickets/ticket-store.ts` owns `<DEVHUB_HOME>/tickets.json`. It is never in `cache.db`: Clear cache wipes that file, and remakes it when it can't read it.

- The hub is the file's only writer, so the store reads it once and keeps it in memory.
- Each change runs one at a time (`oneAtATime`, from the settings store). It works out the next file, writes it to a temporary file that is then renamed, mode 0600, and moves memory on only once the file has. A save that fails changes nothing.
- A file it can't read is renamed to `tickets-<date-time>.unreadable.json`, never saved over. `kept()` names it, and Tickets says so once.
- Every change adds one to `version`. An update that carries the version it was opened at is refused as `changed` when someone saved first. The form keeps your edits, and saving again writes over theirs. The Status picker and the agents' tools send no version.
- `doneAt` is set when a ticket enters Done and cleared when it leaves.

`ticket-service.ts` joins each ticket's newest live session, as Tickets does for Jira's (`sessionsByTicket`). It publishes `tickets.changed` after every change that lands, so every open page, the ticket dialog, the sidebar count and ⌘K refresh.

## On the board

`tickets-service.read()` follows the sprint's tickets with Orynx's (`orynxBoardRows()` in `board-row.ts`):

- no link;
- the column's own status name ("In progress");
- the priority's bars from its place, Highest to Lowest;
- you as the assignee, by your git name.

A Done ticket leaves the board 14 days after it got there, as on a Jira Kanban board; ⌘K still finds it. The rows come whether Jira is connected, syncing or neither. Without Jira, Tickets is Orynx's alone, under a line to connect Jira, with no Source filter and no pickers. The page draws that as a layout of its own, so nothing slides when the answer comes.

The Source filter (`filters.ts`) keeps Jira's, Orynx's or both, by the key. It lives in the address like spec 020's filters. With Orynx unticked, New ticket and each column's + go.

## The form and the dialog

New ticket and Edit are one form, `ticket-form.tsx`:

- react-hook-form with the contract's own `OrynxTicketFieldsSchema`, so the page and the server refuse the same values with the same words;
- `Select` for Type, Priority and Status, and `DatePicker` (Popover around Calendar, react-day-picker) for the due date;
- a submit guard that holds until the save has settled, so a double click makes one ticket.

A title opens the shell's ticket dialog. For an `ORX-` key it shows `orynx-ticket-view.tsx`: the fields, who made it (you, Claude in a linked session, or an outside agent by its client's name), and a Status picker that saves at once. Its actions are Edit and Delete ticket (an AlertDialog with Cancel focused first), around the dialog's own Open session and Add to composer.

## The tools, defined once

`orynx-tickets/tools.ts` lists `list_tickets`, `get_ticket`, `create_ticket`, `update_ticket` and `delete_ticket`. Each tool has:

- a zod input it checks itself, whatever the door checked;
- an access level (`read`, `write` or `delete`) a door chooses by;
- a `run()` that answers text for the agent, and data saying what it did.

The actor (you, a session, or an outside agent) is bound when the list is made, and is what `createdBy` records.

## Door one: a session's agent

`AgentRunOptions.tools` carries the list, so any `AgentAdapter` can offer it in its own agent's way.

- Claude's adapter mounts it as the in-process SDK MCP server `orynx` (`createSdkMcpServer`), the only MCP server it gets. Claude Code names the tools `mcp__orynx__<tool>` and asks `canUseTool` about every call.
- `tool-decision.ts` allows reads and changes. A delete becomes a `ticket` ask, with the key and the title read through the session's own `get_ticket`: Allow once or Deny, never Always allow.
- An Ask session gets the reading tools only, and the decision refuses a change all the same.
- Each call that did something is a `ticket` step: Read, Created, Updated or Deleted, with the key.

## Door two: agents outside Orynx

`POST /api/mcp` is a stateless MCP server: the MCP SDK's Streamable HTTP, answering in JSON, a new server per request. It has every tool but delete, since no session is there to ask you.

The door is open while its token is in the keychain under `agents` (`agent-access.ts`). It is off until Settings › Coding agent's Other agents row turns it on.

- `local-only.ts` still checks the Host header on this path, but takes `Authorization: Bearer <agents' token>` in place of the page's session token, compared in constant time.
- The page's token never opens `/api/mcp`, and the agents' token opens nothing else.
- Turning the door off deletes the token and every bridge. Turning it on again makes a new token, so an old config stops working. On while already on keeps the token.

Copy MCP config asks `POST /api/agents/access/config`. That writes a bridge (`bridge.ts`), `<DEVHUB_HOME>/mcp/orynx-mcp-<hash>.mjs`, mode 0600, holding the token. It answers with the usual `mcpServers` config, which runs the bridge on the program running Orynx (with `ELECTRON_RUN_AS_NODE` in the desktop app). The config never holds the token.

The bridge passes each stdio line to `/api/mcp`. It reads the port from `runtime.json` for every message, so a restart, or the desktop app's new port at each launch, changes nothing. It names its client by the name from `initialize`, in `x-orynx-agent`.
