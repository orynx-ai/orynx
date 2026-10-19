---
name: agent-runtime
description: Use when working on Claude sessions in the product: the AgentAdapter, worktrees, permission modes, approvals, the session event stream, or creating the pull request. Forbids product code that pushes, opens a PR or runs a risky command without the user's click, edits outside the session worktree, or sends Claude anything beyond the brief.
---

# The agent runtime (Claude sessions)

A session is one piece of work Claude does for the user: one task, one repo, one branch. It moves through Plan → Build → Test → Review → Pull request, and the user can stop it at any step. Read "Agent sessions" and "Security, privacy and data" in `docs/product/spec.md` before changing anything here.

## Safety rules (from the spec, all mandatory)

1. **Worktree only.** Each session runs in its own git worktree under `~/.devhub/worktrees/`, on a branch named after the ticket (`feat/PROJ-1423`). Claude's working folder is that worktree. It must never edit the user's main checkout.
2. **Permission modes** (Settings › Coding agent, saved since spec 005 as `agent.permissionMode` in `settings.json`; read it through `createPreferencesService().read()`, never the file):
   - Ask before everything: every file edit and every command needs a click.
   - Edit files freely, ask before commands (default, recommended): edits stay in the worktree; commands ask.
   - Edit files and run allowed commands: commands on the allow list (`agent.allowedCommands`) run; anything else asks. "Always allow" adds to the list, and is offered only in this mode (spec 012, Q1).
3. **Always ask, whatever the mode:** commands that touch the network, delete outside the worktree, or ask to run outside the sandbox; Allow once and Deny only, and the list can't hold them. A push or `gh pr create` is refused without asking (spec 012, Q7). The reading lives in `packages/contracts/src/commands.ts`, the decision in `packages/core/src/agents/claude/command-decision.ts`.
4. **The PR is always the user's click.** DevHub pushes the branch and opens the PR only after Create pull request. Claude never pushes or opens a PR by itself.
5. **The brief is exactly the chips.** What goes to Claude is the composer text plus every context chip (ticket, PR diff, Slack thread, files), in the order the user added them, built by `brief.ts` `composerBrief()` from what `context-reader.ts` read at Send. Ship's brief is the ticket alone (`ticketBrief()`). Slack data goes only when the user added that thread.
6. **Credentials.** The Claude login is Claude Code's own. DevHub only checks it with `auth status --json` and never stores it (spec 010, `learn/checking-claude.md`). Claude Code gets only the allow-listed environment in `packages/core/src/agents/agent-environment.ts`, never DevHub's, for the login check and for sessions alike; `AWS_*` passes only with `CLAUDE_CODE_USE_BEDROCK` and `GOOGLE_*` only with `CLAUDE_CODE_USE_VERTEX` (spec 011, Q8b), and `CLAUDE_*` stays a prefix less the variables of a Claude Code session (Q8c). A session's git gets `gitEnvironment()`: the same list, `SSH_AUTH_SOCK`, `GIT_TERMINAL_PROMPT=0` (Q8d). Any command Claude runs as `node` could read DevHub's "DevHub" keychain items without a macOS prompt, and any command could read `<DEVHUB_HOME>/runtime.json` and call `/api` with the session token. Every command runs in Claude Code's own sandbox (spec 012, Q2; `packages/core/src/agents/claude/sandbox.ts`): writes only in the worktree and the temporary folder, no reads under `DEVHUB_HOME` but the worktree, none of the keychain's files, no network (127.0.0.1 too). Never loosen those settings, and never give a session `Bash` without them: where the sandbox can't run, sessions get no commands (`learn/sessions-and-worktrees.md`).
7. **Stop** works at any step. The worktree keeps the changes. Discard deletes the worktree and branch after a confirm step in the page (never a browser dialog).

## The adapter interface

Claude plugs in through one interface so other agents can follow later without changing the screens. It lives in `packages/core/src/agents/agent-adapter.ts`:

```ts
export interface AgentAdapter {
  readonly id: 'claude';
  readonly runsCommands: boolean; // false where the sandbox can't run
  startSession(
    brief: AgentBrief,
    worktreePath: string,
    permissions: () => Promise<AgentPermissions>, // read for every call
    instructions: string,
    resuming?: { resume: string }, // carry on the agent's own earlier session (spec 013)
  ): Promise<string>; // sessionId
  onEvent(sessionId: string, handler: (event: AgentEvent) => void): () => void; // started, work, approval, answered, files_changed, problem, ended
  respond(sessionId: string, approvalId: string, decision: 'allow' | 'deny' | 'always'): Promise<boolean>; // false: not waiting
  sendMessage(sessionId: string, text: string): Promise<boolean>; // false: finished or stopping, so resume instead
  stop(sessionId: string): Promise<void>;
  write(prompt: string, instructions: string, options?: { timeoutMs?: number }): Promise<AgentWritten>; // text, no tools (spec 014)
}
```

The Claude implementation is `packages/core/src/agents/claude/claude-adapter.ts` (spec 011) over `@anthropic-ai/claude-agent-sdk` (pinned; it runs the Claude Code the SDK ships, found with `findSdkClaudeCode()`, never a `claude` on the PATH). `startSession` takes a fourth argument, the note for Claude Code's system prompt. `respond` came with spec 012; `sendMessage` and `resuming` with spec 013; `write` with spec 014: a query with `tools: []`, a `canUseTool` that refuses everything, `maxTurns: 1`, `persistSession: false`, an empty temporary folder as its `cwd` and the instructions as its whole system prompt, for a pull request's draft or a commit message. Every SDK option is set on purpose, because the defaults load every settings file:

- `settingSources: []`, `settings: { disableAllHooks: true }`, `strictMcpConfig: true`, `mcpServers: {}`: no hooks, plugins, MCP servers or allow rules from `~/.claude` or the repository.
- `tools` (`sessionTools` in `tool-decision.ts`, without `Bash` when there's no sandbox), `sandbox` (`sandbox.ts`), `permissionMode: 'default'` and `canUseTool` from the tool decision: paths stay inside the worktree, symlinks followed, never its `.git`; a call is allowed, asked or refused, one at a time in the order Claude Code asked.
- The prompt is a stream that stays open until Claude finishes, so Stop can interrupt it; an interrupted turn ends with a failed result, which isn't a problem after Stop.
- **Follow-ups (spec 013).** `sendMessage` puts your text into that stream with its own `uuid` and `priority: 'next'`, so Claude reads it after its current tool call. A result is the end of one turn: Claude has finished only when `queued_turn_count` is 0 and every uuid sent is in the turns' `user_message_uuids`. After Done or Stop, the session starts the adapter again with `resuming: { resume: claudeSessionId }` (the SDK's `resume`, passed to Claude Code as `--resume=<id>`), in the same worktree; one that ends before `init`, or whose `init` names another session, is the `resume` problem.
- **Stop refuses every call** from the moment you press it, whatever Claude Code still holds, and closes Claude Code at once when it holds a message it hasn't read, so Claude never acts on it.
- **`files_changed`** goes out when an edit or a command ends; the session service turns it into `session.files.changed`, at most once a second, and the Changes tab reads the worktree again (read-only git, `packages/core/src/sessions/changes.ts`).

Worktrees come from `packages/core/src/sessions/worktrees.ts` (`simple-git`, hooks off, no prompts), and `session-service.ts` runs a session from the ticket to Claude's last step. Tests fake `query()` at the SDK's boundary with `test/fake-claude-sdk.ts`; the e2e run's fake Claude Code plays a session over the SDK's stream protocol (`e2e/fake-claude/session.ts`).

## Create pull request (spec 014)

Rule 4 lives in `packages/core/src/sessions/pull-requests.ts`, wired into `session-service.ts`:

- `draft()` reads only: `branch-git.ts`'s reads, 013's change reader and Claude's `write()`. Opening the dialog changes nothing.
- `create()` and `push()` run only from their routes, one at a time for each session, and nothing calls them on its own: not Claude finishing, a follow-up or a restart. A new file that looks like a secret (`secret-files.ts`) stops the commit first.
- `branch-git.ts` commits with your git identity (`user.useConfigOnly=true`, so never a made-up one) and signing, pushes `refs/heads/<branch>` to the same name on `origin` without force, with hooks off and `LC_ALL=C`, and drops git's words once it has named the problem, because they can hold the remote's address with a password.
- The PR opens through `client.ts` with the GitHub connection's token; one GitHub already has from the branch is linked as it is. Discard waits for a push under way.

## Session states

States come from `SessionStateSchema` in `packages/contracts/src/session.ts`: `working`, `needs_you`, `done`, `pr_open`, `stopped`. Once a session has a `pullRequest`, Claude finishing a follow-up leaves it `pr_open`, not `done`. Each is shown with an icon, a word and a colour (spec table "Session states"). Never colour alone.

## Approvals

1. The SDK's permission callback (`canUseTool`) asks `tool-decision.ts` whether a call may run, with the mode and the allow list read again for this call.
2. The decision checks the always-ask rules first, then the mode and the list: allow, ask, or refuse.
3. An ask parks the call in the adapter, which says `approval`. `session-service.ts` adds it to `session.approvals` and a waiting step, the session becomes `needs_you`, and `sessions.changed` and `session.changed` go out. The call waits with no time limit.
4. The Session screen shows the oldest waiting call in the amber callout (`role="alert"`, never focused by itself) with Allow once, Always allow <entry> (only where offered) and Deny.
5. `POST /api/sessions/:id/approvals/:approvalId` reaches `SessionService.respond()`: Always allow saves the entry first (a failed save decides nothing), then `adapter.respond()` ends the wait. The first answer counts; a late one is 409. Stop, Discard and closing deny every waiting call. Each call is kept in `session.json`'s `approvalLog`; the log names only kinds and answers.

## Session data

| Data                     | Where                                                                   |
| ------------------------ | ----------------------------------------------------------------------- |
| Brief, steps, approvals  | `~/.devhub/sessions/<session>/` (`session.json`, `brief.md`), 0700/0600 |
| Code changes             | `~/.devhub/worktrees/<session>` on `feat/<KEY>`, from `startCommit`     |
| Claude Code's transcript | `~/.claude/projects/`, Claude Code's own; a follow-up resumes it        |

## Testing

- Test the permission decision as a pure function: every mode × command kind, including network, push and delete-outside-worktree always asking.
- Test worktree creation against a real temporary git repo in a temp `DEVHUB_HOME`. Never touch the real `~/.devhub` or a real repo.
- Fake the Claude Agent SDK only at its boundary (it is an outside service). Never fake our runtime modules.

## Don't

- Don't add an automatic push, PR or merge anywhere.
- Don't widen the always-ask rules, and don't let a mode skip them.
- Don't add context to the brief that the user did not put in a chip.
- Don't run anything against the user's real repos or `~/.devhub` while developing. Stop and ask.

## Checked by

`/review` with the security-auditor agent (any automatic push, PR or unapproved command is a critical finding) · `pnpm test packages/core`
