<!-- learn-sources: packages/contracts/src/session.ts packages/core/src/sessions/session-service.ts packages/core/src/sessions/worktrees.ts packages/core/src/sessions/file-session-store.ts packages/core/src/sessions/session-store.ts packages/core/src/sessions/progress.ts packages/core/src/sessions/brief.ts packages/core/src/agents/agent-adapter.ts packages/core/src/agents/claude/claude-adapter.ts packages/core/src/agents/claude/tool-decision.ts packages/core/src/agents/claude/sdk-messages.ts packages/core/src/agents/agent-environment.ts packages/core/src/routes/sessions.ts apps/server/src/main.ts e2e/fake-claude/session.ts packages/app/src/features/sessions/components/build-with-claude.tsx packages/app/src/features/sessions/step-words.ts -->

# Sessions and worktrees: Claude on a ticket, away from your checkout

A session is Claude working on one ticket, in one folder, on its own branch. You press Build with Claude on a Tickets card or row, or Build on a Home row, and Orynx makes a branch and a git worktree for it under `<DEVHUB_HOME>/worktrees/`, so your checkout is never touched. You watch Claude's progress on the Session screen, and you can stop it or throw its work away. Spec 011 built it.

## The path of one session

```
Build with Claude                                     (the page: build-with-claude.tsx)
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
  every change: sessions.changed (state or title) at once, session.changed (steps) at most every 250 ms
```

## Where things go

| What                         | Where                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| The session, its steps       | `<DEVHUB_HOME>/sessions/<id>/session.json`, folders 0700 and files 0600                  |
| Exactly what Claude was sent | `<DEVHUB_HOME>/sessions/<id>/brief.md`                                                   |
| Claude's changes             | `<DEVHUB_HOME>/worktrees/<id>`, on `feat/<KEY>` (or `-2`, `-3`… when that name is taken) |
| Claude Code's own transcript | `~/.claude/projects/`, as for any Claude Code session; follow-ups (spec 013) resume it   |

The id is 16 hex characters, so it is always a safe folder name. Every write goes to a temporary file that is renamed into place, one session's writes run in order, and the store keeps the sessions in memory, so a list never reads the disk. Nothing about a session goes into `settings.json` or `cache.db`.

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
- `tools`: only `Read`, `Glob`, `Grep`, `Edit`, `Write`, `NotebookEdit` and `TodoWrite`. No command can run until approvals come (spec 012), so Claude has no `Bash`, no web, no sub-agents and no questions.
- `permissionMode: 'default'` with `canUseTool`: every call Claude Code doesn't allow by itself comes to `tool-decision.ts`. It refuses any path outside the worktree once symlinks are followed (a glob's fixed start too, and a symlink to a file that doesn't exist yet), anything under the worktree's `.git`, and every edit while Settings says Ask before everything. A refusal is a step: "Couldn't edit outside the worktree".
- `env`: the allow list from `agent-environment.ts` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. The SDK replaces the environment rather than adding to it. `AWS_*` passes only when `CLAUDE_CODE_USE_BEDROCK` is on and `GOOGLE_*` only with `CLAUDE_CODE_USE_VERTEX`, so a session never inherits cloud credentials Claude isn't using.
- `systemPrompt`: the `claude_code` preset with Orynx's note: the branch, read CLAUDE.md if there is one, don't push, say which commands you'd run, and summarise at the end.
- Claude Code's own output (`stderr`) is dropped: it can hold the brief or file contents.

The prompt goes in as a stream that stays open until Claude finishes, because the SDK can interrupt only a session with streaming input.

## Steps and the stepper

`sdk-messages.ts` pairs each tool call with its result, so only calls that worked become work: a read or search is explore, `Edit`/`Write`/`NotebookEdit` is edit, `TodoWrite` is the plan, and the result ends the turn with Claude's summary. `progress.ts` folds them into steps: one step per run of the same kind of work, the latest one running until another kind starts. A later to-do update changes the plan's items without a new step. The stepper moves from Plan to Build at the first edit and to Review when Claude finishes, and never moves back; Test needs a command, which comes with spec 012.

The server sends structured steps, never words. The page says them (`step-words.ts`): "Explored the code" with "ContentList.tsx, contentApi.ts and 6 more", "Edited 4 files", "Finished" with Claude's summary.

## When something goes wrong

A failure stops the session with a problem the Session screen says in the danger callout: Jira couldn't be read, the folder isn't a git repository any more, git couldn't make the worktree, Claude Code's login didn't work (an assistant message with `error: 'authentication_failed'`, a 401 or 403, or a gateway or organisation startup reason), a usage or capacity limit, or anything else. Before Claude did any work the title is "Claude couldn't start", after it "Claude stopped with an error". The terminal gets the session id, the ticket key and a code, never the ticket's text or Claude's words.

## Stop, Discard, and a restart

- **Stop** aborts git when the worktree is still being made, and interrupts Claude. Stop that comes just before Claude starts means Claude never starts, and Stop that comes while Claude Code is starting, when there was no Claude yet to stop, has the run stop it as soon as it has started. An interrupted turn still ends with a failed result, which isn't a problem after Stop. If Claude Code hasn't ended 5 seconds later, its process is closed. The worktree keeps its changes, and the last step is "You stopped Claude".
- **Discard** stops a working session first, then `git worktree remove --force --force` and `git branch -D`, after a confirm step in the page. A worktree you deleted yourself is pruned. When the repository itself is gone, only the worktree folder is deleted, and only inside `<DEVHUB_HOME>/worktrees`. The session stays, Stopped, and leaves the sidebar 7 days later (`GET /api/sessions?recent=true`).
- **A restart.** Claude Code runs as a child of the server, so closing Orynx ends it: `close()` stops every working session as "Orynx closed while Claude was working". Opening the store does the same for a session a crash left Working.

## Tests

Core tests never run the real Claude Code. `test/fake-claude-sdk.ts` fakes `query()` at the SDK's boundary: it asks `canUseTool` about each scripted call as Claude Code does, and ends an interrupted turn with a failed result. Git runs for real, on temporary repositories with a bare `origin` (`test/git-repository.ts`) and none of your git settings.

The e2e run has a hub of its own for sessions (port 4396). Its `e2e/fake-claude/claude` hands every stream-json run to `session.ts`, which speaks the pinned SDK's protocol as far as a session needs: it answers `initialize` and `interrupt`, asks `can_use_tool` before its edit, and writes the file into the worktree when allowed. A probe that stood in for Claude Code showed what the SDK sends: `--output-format stream-json --input-format stream-json --permission-prompt-tool=stdio --tools=… --setting-sources= --strict-mcp-config --permission-mode=default --settings {"disableAllHooks":true}`, then an `initialize` control request carrying the note, then the brief as a user message. Bump the SDK and check the fake against a probe again.

## Left for spec 012

No command runs in 011 and reads outside the worktree are refused, so Claude can reach neither DevHub's keychain items nor `<DEVHUB_HOME>/runtime.json` with its session token. When approvals let commands run, spec 012 has to keep commands away from both, for example with Claude Code's sandbox.
