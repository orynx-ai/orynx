# Plan: Session terminal

Spec: `specs/036-session-terminal/spec.md`

## Order of work

1. **Contracts.** `ClaudeCommand` (one command Claude ran: id, command, state, output, time) and the terminal's shapes: a tab, a block, the tab list, run and the routes. A new server event, `session.terminal.changed`. Everything after this parses with them.
2. **Claude's commands, in core.** The SDK reader already sees every `Bash` call and its result, but drops the output. It now says `command_ended` with the output's last 200 lines (colour codes removed), whether it failed, and the time from the moment the call was allowed. The `command` work carries the tool call's id. The session service keeps a `commandLog` in `session.json`, next to `approvalLog`. It holds running, ended, denied, refused and notes from Ask Claude to fix, and is served by `GET /sessions/:id/commands`, so `GET /sessions/:id` doesn't grow. Waiting commands come from `session.approvals`, as today.
3. **Your shell, in core.** `packages/core/src/terminal/`:
   - `output.ts` (pure): lines kept per block (2,000), blocks per tab (100), colour codes removed, partial lines joined.
   - `terminal-service.ts`: tabs per session (5 at most), one command at a time per tab. Each command runs with `spawn($SHELL, ['-l', '-c', command], { cwd: worktree, detached: true })`. It gets the environment without Orynx's keys and with `NO_COLOR=1`, and stdin is closed. Stop sends SIGTERM to the process group, then SIGKILL after 5 s. `session.terminal.changed` goes out at most every 250 ms while output comes.
   - `stopAll(sessionId)` runs before Discard deletes the worktree. `close()` runs on the server's `onClose`.
4. **Routes.** One plugin, `routes/terminal.ts`: read the tabs, add a tab, close a tab, run, stop, clear, and Ask Claude to fix. Ask Claude to fix builds the follow-up on the server from its own copy of the block, so the page never sends output back. It goes through `SessionService.send()` and adds a note to the command log.
5. **api-client.** Typed calls and query options for the commands list and the terminal. `live-updates.tsx` maps `session.terminal.changed` to the terminal's key, and `session.changed` to the commands key too.
6. **`@devhub/ui`.** `CommandBlock` (head: command, Claude badge, status, actions; body: output, cut note; failed border) and `CommandInput` (prompt, label, field, hint, ↑/↓ history, ⌃C). The tab strip is the existing `Tabs` with `Pill` for "Needs you". The full-screen frame is the existing `DialogContent size="full"`. A close button inside a tab would put a button in a button, so "Close zsh 2" is an `IconButton` in the bar beside +, shown while an added tab is picked.
7. **App.** In `features/sessions/components/terminal/`:
   - the Terminal button and `` ⌃` `` in `session-header.tsx`;
   - the dialog: header, tabs, meta line, log, input;
   - the Claude tab, which reuses `approvalTitle` and the callout's choices from `approval-callout.tsx`;
   - the shell tab, and Ask Claude to fix;
   - a zustand store for the last-picked tab per session.
8. **e2e** against the real server: a real command in a real worktree, Stop, `env`, and axe on every state.
9. **Docs.** `docs/architecture.md` says the server now runs what the page sends, in a worktree only. Also `docs/design-map.md` rows, and `learn/sessions-and-worktrees.md`.

Steps 2 and 3 are separate, so either can ship first. The UI tasks reuse MSW handlers built from the contracts and need no running server.

## Risks

| Risk                                                                | How we will notice early                                                   | What we do                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The server now runs any command the page sends (Q1)                 | Security review in `/review`; a route test with no token or a foreign Host | Keep `registerLocalOnly`'s checks on every terminal route. `cwd` is always the session's own worktree, read from the store, never from the request. Never log a command's text or output, only its exit code and time |
| A command outlives Orynx (detached process group)                   | A terminal-service test that `close()` leaves no live pid                  | `close()` and `stopAll()` kill every group. A crash can leave one running: `shortcut:` comment, upgrade with a pid file if it shows up                                                                                |
| Big output floods the page (`yes`, a chatty dev server)             | AC-16 test with 50,000 lines; the e2e dev-server run                       | 2,000-line cap per block and 100 blocks per tab, events at most every 250 ms. The query is per session, and only while the dialog is open                                                                             |
| The SDK's `tool_result` content comes as a string or as text blocks | Reader tests with both shapes, from the SDK's own types                    | Parse both; anything else is "no output", never an error                                                                                                                                                              |
| Claude's output, kept in `session.json`, can hold secrets           | Review                                                                     | It's already in Claude Code's own transcript; `session.json` is 0600. It's served only on localhost with the token and never logged                                                                                   |
| Ask Claude to fix goes over the 10,000-character follow-up limit    | Unit test with 50 long lines                                               | Drop lines from the top until the message fits                                                                                                                                                                        |
| A login shell starts slowly (nvm, oh-my-zsh)                        | e2e time                                                                   | Nothing to do: it's your shell. "● running" shows at once                                                                                                                                                             |
| 360 px layout and dark contrast can't be checked in jsdom           | Memory: jsdom can't see sizes                                              | A real browser at 360/1280, light/dark, with page.route faking `/api`                                                                                                                                                 |

## Touches

- Packages: contracts, core, api-client, ui, app, e2e (`apps/web`), docs.
- Gates that check this work: boundaries, style-policy, component-coverage, icon-buttons, design-source, test-policy, secrets, env-policy (no new keys), specs.
- Skills to follow: `add-api-endpoint`, `agent-runtime`, `server-state`, `client-state`, `add-ui-component`, `build-a-screen`, `clean-ui`, `forms` (the command input is a form with react-hook-form), `honest-tests`.
