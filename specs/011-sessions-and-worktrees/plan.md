# Plan: Sessions and worktrees

Spec: `specs/011-sessions-and-worktrees/spec.md`

## Before the first task

010 isn't merged yet. Before task 1, this branch moves onto `main` with 010 merged (`git rebase origin/main`), so every task builds on 010's SDK, `findSdkClaudeCode()`, `agent-environment.ts`, the login check and `DEVHUB_CLAUDE_CODE`. The spec and plan commits are docs only, so the rebase is plain. The roadmap's 011 line is updated in task 30, after 010's own change to it has landed.

## Order of work

Today a session can't be started. The sidebar list, `/sessions`, the session route, Tickets' agent chips and search all read `SessionStore.list()` from an empty memory store, nothing publishes `sessions.changed`, and the Session screen is a page bar. This spec adds everything from the Build button to Claude's last step.

1. **Contracts first** (task 1). `SessionSchema` is what the Session screen needs:
   - the summary's fields plus the folder (name, display path), the branch, the base (ref, fetched or not), the step, the steps, the problem, `discardedAt`, `startedAt`, `endedAt`, the Jira link (built on the server, as `ticket.url` is) and the sprint name for the breadcrumb.
   - A step is structured data, not words: `worktree`, `brief`, `explore` (files), `plan` (items), `edit` (files), `refused` (why, path), `finished` (Claude's summary), `stopped`, `interrupted` and `discarded`, each `running` or `done`. The app words them (Q10a), so the server never holds user-facing copy.
   - Starting is `POST /api/sessions` with `{ ticketKey, repositoryId? }`. It answers `started` or `existing` with the session id, or `cannot_start` with a reason: `no_folder`, `choose_folder`, `signed_out`, `too_many`. Stop and Discard are `POST /api/sessions/:id/stop` and `/discard`, and the detail is `GET /api/sessions/:id`.
   - `GET /api/sessions` gains `recent` (leave out sessions discarded more than 7 days ago), and `SessionSummary` gains `discardedAt`. A new event, `session.changed { sessionId }`, carries only the id.
2. **Pure pieces of core** (tasks 2 to 7), each tested as a table before anything runs.
   - Q8's environments: `AWS_*` only with Bedrock and `GOOGLE_*` only with Vertex, for sessions and the login check, plus `gitEnvironment()` (the short list, `SSH_AUTH_SOCK`, `GIT_TERMINAL_PROMPT=0`).
   - Jira's single-issue read, and an ADF-to-Markdown converter.
   - The brief and the note (Q5).
   - The tool decision (Q6): inside the worktree after resolving symlinks, nothing under the worktree's `.git`, and every edit refused in Ask before everything.
   - The progress fold: activities become steps, the latest one running in the present tense. It also holds the stepper rule (AC-7).
   - The reader for the SDK's messages: tool uses by kind with their paths, `TodoWrite` items, the result's summary, and errors sorted into login, limit and other (AC-13).
3. **Git** (tasks 8 and 9). `simple-git` is added to `packages/core`, with `worktrees.ts` as the only file that runs git for sessions:
   - Find the default branch, fetch it (20 s, no prompts, Q1a's fallback), find a free branch name (Q2), and add the worktree.
   - Then remove it, delete the branch and prune, all with an abort signal so Stop works mid-setup.
   - Tests use real temporary repositories with a bare `origin`, never a real repository.
4. **The store** (task 10). `file-session-store.ts` keeps `<DEVHUB_HOME>/sessions/<id>/session.json` and `brief.md`. Folders are 0700 and files 0600. Writes go to a temporary file and are renamed, one session's writes run in order, and opening the store turns Working into Stopped with an `interrupted` step (AC-14). The memory store stays for tests that don't need the disk.
5. **The Claude adapter** (task 11). `claude-adapter.ts` implements `startSession`, `onEvent` and `stop` around the SDK's `query()`:
   - Every option from the spec's Assumptions and Q6 and Q7, plus `strictMcpConfig: true`, so MCP servers saved in `~/.claude.json` don't load either.
   - `canUseTool` calls the tool decision.
   - `stop` interrupts, then closes after 5 seconds.
   - `respond` and `sendMessage` reject until 012 and 013.
   - Tests pass a fake `query()` at the SDK's boundary that yields scripted messages and calls `canUseTool` as Claude Code would.
6. **The session service** (tasks 12 to 14).
   - Start's checks happen before anything is created (Q3, Q4, Q11): folders for the key's project, the login from 010's check, at most three working, and a live session reused.
   - The run: read the issue, make the worktree, write the brief, start Claude, fold its activity into steps, and map failures to problems that the log names by kind.
   - `sessions.changed` goes out on state changes. `session.changed` goes out on step changes, at most every 250 ms per session.
   - Then Stop (also during setup), Discard, and stopping every session when the server closes.
7. **Routes and wiring** (tasks 15 and 16). The four routes, `createServer({ claude: { query, program }, sessions })` with the file store under `dataDir`, and Home's issue rows pointing at a live session (AC-15). With no `query`, a session can't start and the real Claude Code never runs (AC-22). Then the leak test at `LOG_LEVEL=trace` with the event stream open (AC-20, AC-21).
8. **The host and the e2e fake** (task 17).
   - `apps/server` passes the SDK's `query` and the file store.
   - The e2e fake Claude Code plays one scripted run over the SDK's stream protocol, which is first written down from the pinned SDK with a probe program that never reaches Claude.
   - `playwright.config.ts` gives the hub a temporary repository with a bare `origin`, a folder mapped to its project, and the fake Jira's single-issue answer.
9. **api-client** (task 18): `getSession`, `startSession`, `stopSession` and `discardSession`, and `sessionQueryOptions`.
10. **`@devhub/ui`** (task 19). Button gains the quiet danger look that `session.html` draws for Discard changes (ghost, danger text), and Callout gains a `danger` tone for "couldn't start" (Q9f). Each gets stories, tests and its design-map row.
11. **Words** (task 20): "4 min 12 s", "Started 4 min ago" (Home's `agoText` moves to `words/`), a one-second clock, and the step words of Q10a.
12. **The app** (tasks 21 to 27).
    - Live updates, the sidebar's `recent`, and `useSession` from the new detail route.
    - `BuildWithClaude`, which starts at once or opens the folder menu with Q10d's reasons, then opens the session.
    - Tickets' card and list, and Home's Build and Open.
    - The Session screen: its header and states, the stepper and Claude's progress, then Discard and its confirm step.
13. **e2e, docs and the real browser** (tasks 28 to 31). Then the user's real session (Q13, task 32), and `/review`.

## Risks

| Risk                                                                                                                                                              | How we will notice early                                                                                                                          | What we do                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The SDK's stream protocol between `query()` and Claude Code isn't documented, so the e2e fake can drift from it                                                   | Task 17 records what the pinned SDK sends and expects with a probe program, before the fake is written                                            | Pin the SDK (it already is). The fake answers only the messages the probe saw. If the protocol needs more than a small script, stop and ask before going further                                                 |
| `permissionMode: 'default'` lets Claude Code allow reads inside the worktree by itself, without `canUseTool`, and a symlink in the repository could point outside | The fake can't show what the real Claude Code allows. Q13's real run asks Claude to read a file through a symlink and outside the worktree        | The `tools` list keeps the damage to reading: nothing can run or reach the network. `canUseTool` resolves symlinks for every call it sees. Anything the real run shows getting through is fixed before `/review` |
| Settings Orynx didn't choose still load: user-scope MCP servers in `~/.claude.json`, plugins, hooks                                                               | Task 16 checks the options passed to `query()`. Q13's real run reads the `init` message's `mcp_servers`, `plugins` and `tools`                    | `settingSources: []`, `settings: { disableAllHooks: true }`, `strictMcpConfig: true` and `mcpServers: {}`. The `init` message is logged by count only, so a surprise shows without leaking names                 |
| A refused login looks like a crash                                                                                                                                | Task 7's fixtures for an assistant message with `error: 'authentication_failed'` and for an `error_during_execution` result with a startup reason | Map them to the login line (Q10f). Anything unknown maps to "See the terminal for details." with its kind in the log                                                                                             |
| `git fetch` waits for a password or passphrase and hangs the start                                                                                                | Task 8's test against an `origin` that needs credentials                                                                                          | `GIT_TERMINAL_PROMPT=0`, no terminal, a 20-second limit, then Q1a's fallback                                                                                                                                     |
| `git worktree add` is slow on a big repository, and Stop must still work                                                                                          | Task 9's test stops during a slow `add` (a hook makes it slow)                                                                                    | The "Made a worktree" step shows running while it works. Stop aborts git and keeps whatever was made                                                                                                             |
| A Claude Code process outlives the server, or a crash leaves a session Working                                                                                    | Task 14's test closes the server mid-run. Task 10's test opens a store holding a Working session                                                  | `onClose` stops every session. Opening the store marks the leftovers `interrupted`                                                                                                                               |
| A burst of tool calls floods the event stream and the page refetches in a loop                                                                                    | Task 13's test counts `session.changed` during a scripted burst                                                                                   | At most one `session.changed` every 250 ms per session, and the page refetches only that session                                                                                                                 |
| Two tabs press Build at once and two sessions start                                                                                                               | Task 12's test starts the same ticket twice at once                                                                                               | Start holds a per-ticket lock. The second call answers `existing` with the first one's id                                                                                                                        |
| Claude edits the worktree's `.git` file to point git somewhere else                                                                                               | Task 5's table                                                                                                                                    | The tool decision refuses any path under the worktree's `.git`                                                                                                                                                   |
| `Callout` has no danger tone in the design system, which draws only warning and info                                                                              | Task 19                                                                                                                                           | Q9f answered "a danger `Callout`". Task 19 adds it with the existing `danger-subtle` and `danger` tokens and no new token, and the user sees it when they say "go"                                               |

## Touches

- Packages: contracts, core, api-client, ui, app, apps/server, e2e
- New dependency: `simple-git` in `packages/core` (planned in `docs/architecture.md`, which then marks it decided)
- Gates that check this work: boundaries, env-policy, secrets, style-policy, design-source, component-coverage, test-policy, learn-freshness, specs, handbook-size, Storybook a11y
- Skills to follow: `.claude/skills/agent-runtime/SKILL.md`, `.claude/skills/integration-adapter/SKILL.md` (the Jira read), `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/server-state/SKILL.md`, `.claude/skills/add-ui-component/SKILL.md`, `.claude/skills/build-a-screen/SKILL.md`, `.claude/skills/clean-ui/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`
