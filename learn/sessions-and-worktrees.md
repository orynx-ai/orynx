<!-- learn-sources: packages/contracts/src/session.ts packages/core/src/sessions/session-service.ts packages/core/src/sessions/worktrees.ts packages/core/src/sessions/file-session-store.ts packages/core/src/sessions/session-store.ts packages/core/src/sessions/progress.ts packages/core/src/sessions/brief.ts packages/core/src/agents/agent-adapter.ts packages/core/src/agents/claude/claude-adapter.ts packages/core/src/agents/claude/tool-decision.ts packages/core/src/agents/claude/command-decision.ts packages/core/src/agents/claude/edit-preview.ts packages/core/src/agents/claude/sandbox.ts packages/contracts/src/commands.ts packages/core/src/agents/claude/sdk-messages.ts packages/core/src/agents/agent-environment.ts packages/core/src/routes/sessions.ts apps/server/src/main.ts e2e/fake-claude/session.ts e2e/fake-claude/probe.ts packages/api-client/src/queries.ts packages/app/src/features/sessions/queries.ts packages/app/src/features/sessions/components/ship-with-claude.tsx packages/app/src/features/sessions/components/sidebar-sessions.tsx packages/app/src/shell/sidebar.tsx packages/app/src/features/sessions/step-words.ts packages/app/src/features/sessions/components/approval-callout.tsx packages/contracts/src/changes.ts packages/core/src/sessions/changes.ts packages/core/src/sessions/unified-diff.ts packages/app/src/features/sessions/components/changes-panel.tsx packages/app/src/features/sessions/components/follow-up-box.tsx packages/app/src/features/sessions/components/ticket-panel.tsx -->

# Sessions and worktrees: Claude on a ticket, away from your checkout

A session is Claude working on one ticket, in one folder, on its own branch. You press Ship on a Tickets card or row, or on a Home row, and Orynx makes a branch and a git worktree for it under `<DEVHUB_HOME>/worktrees/`, so your checkout is never touched. You watch Claude's progress on the Session screen, read its changes as it makes them, write to it, and stop it or throw its work away. Spec 011 built it; spec 012 added the approvals and spec 013 the Changes and Ticket tabs and the follow-up box.

## The path of one session

```
Ship                                                  (the page: ship-with-claude.tsx)
  └─ POST /api/sessions { ticketKey, repositoryId? }
       └─ session-service.ts start()  checks before anything exists:
            a live session on the ticket? → existing, the page opens it
            Claude Code signed in?  fewer than 3 working?  one folder for the project (or the one picked)?
            otherwise → cannot_start with why; nothing is created
       ← started { sessionId }; the page opens /sessions/<id>
       └─ run()                        in the background, one step at a time
            1. Jira: GET /rest/api/3/issue/<KEY> (summary, type, description as Markdown)
            2. worktrees.ts: fetch the default branch, then git worktree add -b feat/<KEY> … --no-track
            3. brief.ts: the brief, saved as sessions/<id>/brief.md, and the note for Claude's system prompt
            4. claude-adapter.ts: query() from the Agent SDK, in the worktree
                 └─ each message → sdk-messages.ts → a piece of work → progress.ts → a step
  every change: sessions.changed (state or title) at once, session.changed (steps) at most every 250 ms,
                session.files.changed (an edit or a command ended, or Discard) at most once a second
```

## Where things go

| What                         | Where                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| The session, its steps       | `<DEVHUB_HOME>/sessions/<id>/session.json`, folders 0700 and files 0600                  |
| Exactly what Claude was sent | `<DEVHUB_HOME>/sessions/<id>/brief.md`                                                   |
| Claude's changes             | `<DEVHUB_HOME>/worktrees/<id>`, on `feat/<KEY>` (or `-2`, `-3`… when that name is taken) |
| Claude Code's own transcript | `~/.claude/projects/`, as for any Claude Code session; follow-ups (spec 013) resume it   |

The id is 16 hex characters, so it is always a safe folder name. Every write goes to a temporary file that is renamed into place, one session's writes run in order, and the store keeps the sessions in memory, so a list never reads the disk. Nothing about a session goes into `settings.json` or `cache.db`.

## Ship, and its menu

"Ship" names the action that starts Claude on a ticket, everywhere (spec 020; spec 011 called it Build with Claude). It's one component, `ShipWithClaude`, drawn three ways: the sparkle `IconButton` on a Tickets card, "Ship" in the Tickets list, and a sparkle `IconButton` at the end of a Home row. Its name says which ticket ("Ship PROJ-1423"), and its tooltip says "Ship".

The page decides from what it already holds (`GET /api/status`, the folders, the sessions), and the server checks again and has the last word. With Claude signed in, fewer than 3 sessions working and one folder for the ticket's project, a press starts Claude at once and opens the session (spec 020 Q2 kept that one click). Otherwise it opens a menu:

- **Several folders:** "Start in" over the folders, then Add local folder.
- **No folder:** "No folder is set for PROJ." then Add local folder.
- **Signed out, three working, or a failed start:** why, and the link that fixes it when there is one.

Add local folder (a + icon) opens Settings' folder dialog (`learn/settings-and-folders.md`) right there, with the ticket's project picked. It waits for the menu to close and let go of focus first. Once the folder is saved, Claude starts on the ticket in it at once (`start.mutate(folder.id)`), and the Session screen opens. Closing the dialog gives focus back to Ship.

## Sessions in the sidebar (spec 020)

The sidebar lists every recent session, newest activity first, 16 at a time, and loads the next 16 when the end of the list scrolls into view:

```
SidebarSessions ── useSessionPages({ limit: 16, recent: true })   an infinite query
  GET /api/sessions?recent=true&limit=16              ← { sessions: [16], nextCursor: "1760781600000.3f9c…" }
  the end of the list scrolls into view (IntersectionObserver on a 1 px marker)
  GET /api/sessions?recent=true&limit=16&cursor=…     ← { sessions: [16], nextCursor }   … null on the last page
```

- **The cursor is the last row's place**, not a count: its activity time in milliseconds and its id (`SessionCursorSchema`). `listSessions()` in `session-store.ts` sorts newest first (by id when two share a millisecond) and starts after the row the cursor names, wherever that row has moved since. So a session that jumps to the top while you scroll is never listed twice. A cursor that doesn't fit the schema answers 400. Without `limit`, every session comes in one answer with `nextCursor: null`, as the Sessions page asks for them.
- **`sessions.changed` refreshes every page loaded**, in order from the first (`sessionPagesQueryOptions` in `api-client`), so each cursor comes from fresh data and the pages already shown stay shown.
- **While the next page loads,** two `SessionItemSkeleton` rows sit at the end, and a screen reader hears "Loading more sessions". A page that fails keeps the rows above it and shows spec 001's "Couldn't load sessions" with Try again under them. The marker is watched again after each page, so a short page whose end is still in view loads the next one too.
- **The 7-day rule stays:** `recent=true` leaves out a session discarded more than 7 days ago, which the Sessions page (View all) still lists.
- **The collapsed rail** has no room for rows, so it gets a Sessions place under Settings, as narrow windows have. Every rail icon, Sessions included, shows its name in a tooltip beside it. The rail is collapsed from 768 px only: under that, the narrow bar shows each place's words, so they get no tooltip there.
- **New task left the sidebar** in spec 020, since Home does the same job. ⌘N (Ctrl+N elsewhere) still opens Home with focus on its content, and the Home place carries that key in `aria-keyshortcuts`.

## The branch and the worktree

`worktrees.ts` is the only file that runs git for a session, through `simple-git`:

- **The base.** The branch `origin/HEAD` points at, fetched first (20 seconds at most). Offline, it uses the last fetched one, and the step says "(last fetched, offline)". With no remote, it uses the folder's checked-out branch.
- **The name.** The first of `feat/PROJ-1423`, `feat/PROJ-1423-2`, … that no local branch and no `origin` branch has. An existing branch is never reused, reset or checked out.
- **No tracking.** The new branch doesn't track the default branch, so a later push can't land on it.
- **No hooks, no prompts.** Every command runs with `core.hooksPath=/dev/null`, so `git worktree add` runs none of the repository's hooks (simple-git asks for `allowUnsafeHooksPath` to allow that setting). The environment is `gitEnvironment()`: the agent's short list, your SSH agent, and `GIT_TERMINAL_PROMPT=0`, because no one is at a terminal to answer.
- **Your checkout stays as it was.** Only the folder's `.git` gains the branch and the worktree's entry. Its checked-out branch, files and uncommitted changes don't change.

## What Claude may do

The SDK's defaults load every settings file (`~/.claude` and the repository's) and let Claude Code allow tool calls by its own rules, so `claude-adapter.ts` sets every option on purpose:

- `settingSources: []`, `settings: { disableAllHooks: true }`, `strictMcpConfig: true`, `mcpServers: {}`: none of your or the repository's hooks, plugins, MCP servers or allow rules.
- `tools`: `Read`, `Glob`, `Grep`, `Edit`, `Write`, `NotebookEdit`, `TodoWrite` and `Bash` (spec 012). Where Claude Code's sandbox can't run, `Bash` is left out. No web, no sub-agents and no questions.
- `sandbox`: every command runs in Claude Code's own sandbox (`sandbox.ts`, spec 012 Q2), set below under "Keeping commands away from Orynx".
- `permissionMode: 'default'` with `canUseTool`: every call Claude Code doesn't allow by itself comes to `tool-decision.ts`, which allows it, asks you (next section) or refuses it. It refuses any path outside the worktree once symlinks are followed (a glob's fixed start too, and a symlink to a file that doesn't exist yet), anything under the worktree's `.git`, a push or `gh pr create`, and a background command. A refusal is a step: "Couldn't edit outside the worktree", "Couldn't push: that waits for Create pull request".
- `env`: the allow list from `agent-environment.ts` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. The SDK replaces the environment rather than adding to it. `AWS_*` passes only when `CLAUDE_CODE_USE_BEDROCK` is on and `GOOGLE_*` only with `CLAUDE_CODE_USE_VERTEX`, so a session never inherits cloud credentials Claude isn't using.
- `systemPrompt`: the `claude_code` preset with Orynx's note: the branch, read CLAUDE.md if there is one, don't push, that commands run in a sandbox with no network and some wait for you, run the project's checks, and summarise at the end (spec 012 Q8g). Without a sandbox it says Claude can't run commands on this computer, so it says which ones it would run.
- Claude Code's own output (`stderr`) is dropped: it can hold the brief or file contents.

The prompt goes in as a stream that stays open until Claude finishes, because the SDK can interrupt only a session with streaming input.

## When Claude asks you (spec 012)

```
canUseTool(tool, input)                              claude-adapter.ts; one call decided at a time, in the order asked
  └─ tool-decision.ts ─ Bash ─▶ command-decision.ts  reads the command with contracts' readCommand()
       allow  → runs; the session shows "Running a command"
       refuse → a push, a background command, a path outside the worktree: a step, Claude is told why
       ask    → the call waits: the adapter parks it and says `approval`
                  └─ session-service.ts: the call joins session.approvals, a waiting step, state Needs you
                       POST /api/sessions/:id/approvals/:approvalId { allow_once | always_allow | deny }
                       └─ respond(): Always allow saves the entry first; adapter.respond() ends the wait
                            answered → the waiting step goes; the command runs, or "You denied a command"
```

- **What asks.** In Ask before everything, every edit and every command; in Edit files freely, every command; in Edit files and run allowed commands, a command whose every part is on the allow list, a `cd` inside the worktree or a filter (`head`, `tail`, `grep`, `wc`, `sort`, `uniq`) runs, and anything else asks. Whatever the mode, a command that reaches the network, deletes outside the worktree or asks to run outside the sandbox asks, with Allow once and Deny only. Shell the reader won't follow (`$(…)`, backticks, `eval`, `sh -c`, `sudo`, redirections other than `2>&1`, a leading `NAME=value`) always asks and never matches the list.
- **What Always allow saves.** The program and its first word that isn't an option, plus the script after `run`: `npm test -- content-list` saves `npm test`, `npm run lint -- --fix` saves `npm run lint`. It's offered only in Edit files and run allowed commands, and only for one command. `PATCH /api/preferences` takes the same entries through contracts' `AllowedCommandSchema`, so Settings and Always allow agree.
- **An edit that asks** shows its change (`edit-preview.ts`): the old and new lines, numbered from where the old text sits in the file (at most 1 MB read), at most 20 lines, then how many more. A new file is all added lines.
- **Waiting.** A call waits with no time limit. Calls asked together wait in the order asked; the Session screen shows the oldest. Settings are read for every call, so a change applies from Claude's next one. The first answer counts: a late one gets 409, and the page says nothing.
- **Deny** tells Claude "The user denied this. Don't try it another way…" and Claude carries on. Stop, Discard and Orynx closing deny every waiting call. Each call that asked is kept in `session.json`'s `approvalLog` (the command or path, the answer, who gave it), never in the log: the terminal hears only kinds and answers.
- **The callout** (`approval-callout.tsx`) is `role="alert"` and never takes focus, so no key pressed for something else answers it. After you answer, focus moves to the next waiting call's first button, or to Claude's progress.

## Steps and the stepper

`sdk-messages.ts` pairs each tool call with its result, so only calls that worked become work: a read or search is explore, `Edit`/`Write`/`NotebookEdit` is edit, `TodoWrite` is the plan, and the result ends the turn with Claude's summary. `progress.ts` folds them into steps: one step per run of the same kind of work, the latest one running until another kind starts. A later to-do update changes the plan's items without a new step. A command is shown when Orynx lets it run, so "Running a command" shows while it runs; one Claude Code ran without asking Orynx is shown from its result, so nothing runs unseen. A call waiting for you is a running step in the amber look until it's answered. The stepper moves from Plan to Build at the first edit, to Test at the first command after that, and to Review when Claude finishes, and never moves back.

The server sends structured steps, never words. The page says them (`step-words.ts`): "Explored the code" with "ContentList.tsx, contentApi.ts and 6 more", "Edited 4 files", "Finished" with Claude's summary.

## The Changes tab (spec 013)

```
GET /api/sessions/:id/changes                       the list: path, + and − counts, binary, renamedFrom
GET /api/sessions/:id/changes/diff?path=<file>      one file's diff: git's 3 lines around each change, hunk headers
  └─ session-service.ts changes() / fileDiff()  →  changes.ts, on the session's worktree
       compared with the commit the branch started from (worktrees.ts records it as `startCommit`;
       a session from before 013 finds it with `git merge-base HEAD <base>`)
```

- **What's listed.** Everything that differs from that commit: Claude's commits, its uncommitted edits, new files git doesn't track (ignored ones left out), a command's changes and yours. The files Claude edited come first, in the order it first did, then the rest by path. At most 300, then "and 41 more files". A diff stops after 2,000 lines with a line pointing to the editor.
- **Read-only.** `git diff` refreshes the index by default, even with `--no-optional-locks`, so every call also passes `-c diff.autoRefreshIndex=false`. No hook runs, each call stops after 10 seconds, and `git status` is the same before and after (the e2e run checks the index's bytes and time). A new file is read from disk only when it's a regular file with one link whose real path is in the worktree, so a link Claude made can't show a file from anywhere else.
- **Only listed paths.** The diff route reads a path only when it's in the list, so `../../runtime.json`, an absolute path or anything else gets 404 (AC-24). Logs redact `?path=` from request URLs.
- **The states.** `ready` (maybe with no files yet), `no_worktree` (it stopped before git made one), `discarded`, and `missing` (deleted outside Orynx). git failing is a 500 the page says as "Couldn't read the changes." with Try again.
- **Live.** `session.files.changed` makes the page read the list and the shown diff again (`staleTime: 0`); the file you're looking at stays, by its path in the address (`?file=`). Discard sends it too, because discarding a session that had already stopped doesn't change its state.
- **Open in VS Code or Cursor** is a plain `vscode://file/<worktree>` or `cursor://file/<worktree>` link, the editor Settings › Coding agent picks. Orynx runs no program for it.

The Ticket tab shows the ticket as Claude got it: the description saved in `session.json` when the session started (or, for an older session, read back from `brief.md`), laid out by `@devhub/ui`'s `Markdown`, with the status and due date as the inbox cache knows them now.

## Follow-ups (spec 013)

`POST /api/sessions/:id/messages { text }` (1 to 10,000 characters, trimmed) answers `sent`, or `cannot_send` with why: `too_many` (three already working), `discarded`, `never_started`, or `newer_session` when the ticket has a newer live one. The session's own `followUp` (`open`, `discarded`, `never_started` or `newer_session` with its id) says before you type whether one can go, so the box gives way to that line, with "Open it" linking to the newer session.

- **While Claude works**, the message goes into the open prompt stream with its own `uuid` and `priority: 'next'`: Claude Code reads it after its current tool call. Claude has finished only when a result says no message is queued (`queued_turn_count: 0`) and every uuid Orynx sent is among the turns' `user_message_uuids`. Until then a result is only the end of a turn.
- **After Done or Stop**, the session starts Claude Code again with the SDK's `resume: claudeSessionId` (saved from the first `init`), in the same worktree, with your text as the prompt. The stepper goes back to Build and the time counts on (`workedMs`, `runStartedAt`). It waits for a Stop or Discard under way, and for the last Claude Code to end, so it never undoes one. A resumed Claude Code that ends before `init`, or starts a different session, couldn't find the conversation: the session stops with the `resume` problem.
- **Stop** makes `canUseTool` refuse every call from then on, and when Claude Code still holds a message it hasn't read, closes it at once, so Claude never acts on it (AC-17).
- **The log** hears "You sent Claude a follow-up" with the session and ticket, never the text.

## When something goes wrong

A failure stops the session with a problem the Session screen says in the danger callout: Jira couldn't be read, the folder isn't a git repository any more, git couldn't make the worktree, Claude Code's login didn't work (an assistant message with `error: 'authentication_failed'`, a 401 or 403, or a gateway or organisation startup reason), a usage or capacity limit, or anything else. Before Claude did any work the title is "Claude couldn't start", after it "Claude stopped with an error". The terminal gets the session id, the ticket key and a code, never the ticket's text or Claude's words.

## Stop, Discard, and a restart

- **Stop** aborts git when the worktree is still being made, and interrupts Claude. Stop that comes just before Claude starts means Claude never starts, and Stop that comes while Claude Code is starting, when there was no Claude yet to stop, has the run stop it as soon as it has started. An interrupted turn still ends with a failed result, which isn't a problem after Stop. If Claude Code hasn't ended 5 seconds later, its process is closed. The worktree keeps its changes, and the last step is "You stopped Claude".
- **Discard** stops a working session first, then `git worktree remove --force --force` and `git branch -D`, after a confirm step in the page, then says `session.files.changed`, so every open Changes tab reads "The changes are gone". A worktree you deleted yourself is pruned. When the repository itself is gone, only the worktree folder is deleted, and only inside `<DEVHUB_HOME>/worktrees`. The session stays, Stopped, and leaves the sidebar 7 days later (`GET /api/sessions?recent=true`).
- **A restart.** Claude Code runs as a child of the server, so closing Orynx ends it: `close()` stops every working session as "Orynx closed while Claude was working". Opening the store does the same for a session a crash left Working or waiting for you; its waiting calls are kept in the log, unanswered.

## Tests

The sidebar's tests can't scroll in jsdom, so test setup installs `test/fake-intersection-observer.ts`, a stand-in for the browser feature: a test says when the marker is in view, and the real component loads the next page. `msw.ts` pages sessions as the server does.

Core tests never run the real Claude Code. `test/fake-claude-sdk.ts` fakes `query()` at the SDK's boundary: it asks `canUseTool` about each scripted call as Claude Code does, and ends an interrupted turn with a failed result. Git runs for real, on temporary repositories with a bare `origin` (`test/git-repository.ts`) and none of your git settings.

The e2e run has a hub of its own for sessions (port 4396), and another for spec 013's changes and follow-ups (4392). Its `e2e/fake-claude/claude` hands every stream-json run to `session.ts`, which speaks the pinned SDK's protocol as far as a session needs: it answers `initialize` and `interrupt`, asks `can_use_tool` before its edit and before each command, and writes the file into the worktree when allowed. It never runs a command: an allowed one is written to `ran.txt` in the worktree. Words in the ticket's title pick the commands: "(runs tests)" asks for `npm test -- content-list`, "(fetches)" for a `curl` that always asks, and "(runs two)" for two commands in one message. For spec 013 it also takes messages while it works, folding them into the turn after its next tool call and saying which ones each result took; "(slow)" in the title waits for one after its first read. With `--resume=<its own id>` (the SDK passes each option as one argument) it plays a follow-up that writes the message it got into `src/follow-up.ts`, and "(hold)" in the message waits for another first; any other id exits before it starts, as Claude Code does. The e2e hubs set `DEVHUB_SANDBOX=assume`, because the fake has no sandbox.

`e2e/fake-claude/probe.ts` shows what the SDK sends, with a stand-in that records it and never reaches Claude (`node e2e/fake-claude/probe.ts`). For SDK 0.3.302: `--output-format stream-json --verbose --input-format stream-json --permission-prompt-tool=stdio --tools=…,Bash --setting-sources= --strict-mcp-config --permission-mode=default --settings {"disableAllHooks":true,"sandbox":{…}}`, then an `initialize` control request carrying the note, then the brief as a user message. The `sandbox` option is merged into `--settings`, the flag layer, which is why `strictAllowlist` and the deny lists hold (spec 012). Bump the SDK and run the probe again.

## Keeping commands away from Orynx (spec 012)

A command's text can't be trusted: an allow-listed `npm test` runs whatever Claude wrote into the tests. And any command could read `<DEVHUB_HOME>/runtime.json` and call `/api` with the session token (to approve its own request), and one run as `node` could read the "DevHub" keychain items without a macOS prompt (`learn/tokens-and-keychain.md`). So every command runs in Claude Code's own sandbox (Seatbelt on macOS, bubblewrap and socat on Linux), set per session by `sandbox.ts`:

- writes only in the worktree and the temporary folder;
- no reads under `DEVHUB_HOME` except this session's worktree (`denyRead`, then `allowRead`), and none of the keychain's own files;
- no network at all, 127.0.0.1 included (`strictAllowlist` with no domains);
- `autoAllowBashIfSandboxed: false`, so a sandboxed command still comes to Orynx, and `failIfUnavailable`, so nothing runs unsandboxed by surprise.

A command that needs more (the network, a delete outside the worktree) always asks; allowed, it runs once with `dangerouslyDisableSandbox`, and the callout says so. Where the sandbox can't run (Windows, or Linux without bubblewrap or socat), `apps/server` gives sessions no `Bash` and says why in the terminal and in the progress. `DEVHUB_SANDBOX=assume` skips that check, for the e2e run's fake Claude Code only.

Tests can only check the settings Orynx passes. What the real sandbox blocks (127.0.0.1, the keychain lookup, `runtime.json`) is checked in spec 012's real run (Q10).
