---
name: agent-runtime
description: Use when working on Claude sessions in the product: the AgentAdapter, worktrees, the permission rows in Settings › Coding agent, approvals, the session event stream, or creating the pull request. Forbids product code that pushes, opens a PR or runs a risky command without the user's click or a permission the user turned on, edits outside the session worktree, or sends Claude anything beyond the brief.
---

# The agent runtime (Claude sessions)

A session is one piece of work Claude does for the user: one task, one repo, one branch. It moves through Plan → Build → Test → Review → Pull request, and the user can stop it at any step. Read "Agent sessions" and "Security, privacy and data" in `docs/product/spec.md` before changing anything here.

## Safety rules (from the spec, all mandatory)

1. **Worktree only.** Each session runs in its own git worktree under `~/.devhub/worktrees/`, detached until Claude's first edit makes its branch (spec 042; named after the ticket, `feat/PROJ-1423`, or as the repository's rules say). Claude's working folder is that worktree. It must never edit the user's main checkout. A Build on your own open pull request (spec 031) has a detached worktree at that PR's branch instead: Push changes pushes `HEAD` to it, never forced, and Discard never deletes it. An Ask has no worktree: it reads its folder in place, or an empty folder of its own when it has none.
2. **Permission rows** (Settings › Coding agent, spec 026, saved as `agent.permissions` in `settings.json`; read them through `createPreferencesService().read()`, never the file). One row for each kind of call, read again for every call (`PermissionsSchema` in `packages/contracts/src/preferences.ts`):
   - `edits` (Ask first / Allow, default Allow): edits inside the worktree. Outside it they're refused, whatever the row.
   - `commands` (Ask first / Only allowed commands / Any command, default Ask first): commands in the sandbox. With Only allowed commands, those on the allow list (`agent.allowedCommands`) run and Always allow adds to it (spec 012, Q1).
   - `network`, `deleteOutside`, `unsandboxed` (Ask first / Allow, default Ask first): each decides its own kind, whatever `commands` says. Ask first is Allow once and Deny only, and the list can't hold them. Allowed, the command runs outside the sandbox that once.
   - `push`, `pullRequest` (Never / Ask first / Allow, default Never): `git push origin <the session's branch>` (with `-u` at most; `HEAD:<branch>` on your PR's detached worktree, never the bare name, which is your main checkout's branch) and `gh pr create` for that branch, each on its own in the line, run outside the sandbox. A forced push, another branch or remote, `--repo`, another `--head`, or a push joined to other commands is refused whatever the row.
   - A line the reader can't follow never leaves the sandbox without a click. An older `agent.permissionMode` is read as rows (`permissionsFromMode`) until a row is saved.
3. **The reading and the decision.** The reading lives in `packages/contracts/src/commands.ts`, the decision in `packages/core/src/agents/claude/command-decision.ts` (a pure table over the rows) and `tool-decision.ts`. A row that allows a call outside the sandbox makes `canUseTool` answer with `dangerouslyDisableSandbox: true` for that call alone.
4. **The PR is the user's say-so.** Orynx pushes and opens the PR from Create pull request. Claude pushes or opens one only when the user set Push the branch or Open a pull request to Ask first (then clicks Allow) or Allow. The session note tells Claude exactly what it may run (`sessionNote()` in `brief.ts`). Claude's `git push` uses the user's own git login and `gh` its own login: Orynx never hands Claude its keychain tokens.
5. **The brief is exactly the chips.** What goes to Claude is the composer text plus every context chip (ticket, PR diff, Slack thread, files), in the order the user added them, built by `brief.ts` `composerBrief()` from what `context-reader.ts` read at Send. Ship's brief is the ticket alone (`ticketBrief()`). Slack data goes only when the user added that thread. Beside the brief, Claude reads only what it asks Orynx's tools for: Orynx tickets (spec 037) and, while Jira is connected, Jira through `jira-tools.ts` (spec 044), each call a step.
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

## The quick read, steps and servers (spec 042)

- **The quick read** (`ask-reading.ts`): one `write()` on the composer's model before the worktree, with the ask, chip titles, branch names and the repository's written branch rules (`branch-rules.ts`), never file contents. Every field of its JSON is checked; a failure starts the session as before.
- **Steps** are Claude's words over a hidden kind (`SessionStepsSchema`): 1 to 5, the rules refused whole. `progress.ts` moves the stepper by kind in the session's own order; Claude changes the steps with `set_steps`, never a step done or under way, never onto or past Run, Answer, Review or Pull request.
- **Orynx's session tools** (`session-tools.ts`, on the `orynx` MCP server beside the ticket tools): `set_steps`; `start_server`, which always asks (or Always allow in this repository, `server:<repository id>` in the allow list) and runs in a Terminal tab of its own, outside the sandbox, as you; `stop_server`, for Claude's own servers only. `run_in_background` stays refused.
- **Jira's tools** (`jira-tools.ts`, spec 044), there while Jira is connected as a run starts: reads run at once; a comment, move or assignment returns a `jira` ask from `asks()` unless `preferences.read().jiraChanges` is true, read for every call. `asks()` may also return `{ refused }`, which turns the call down before anyone's asked (a bad input, a status the issue can't reach), with words for Claude and no step. Never return null from a write's `asks()` for any other reason.
- **Ports** (`ports/`): a port is the session's only when its process runs under one of its Terminal tabs or from inside its worktree, read with `lsof` and `ps`. Stop checks that again before it signals anything.

## Session states

States come from `SessionStateSchema` in `packages/contracts/src/session.ts`: `working`, `needs_you`, `done`, `pr_open`, `stopped`. Once a session has a `pullRequest`, Claude finishing a follow-up leaves it `pr_open`, not `done`. Each is shown with an icon, a word and a colour (spec table "Session states"). Never colour alone.

## Approvals

1. The SDK's permission callback (`canUseTool`) asks `tool-decision.ts` whether a call may run, with the rows, the allow list and the session's branch read again for this call.
2. The decision checks the push and pull request rows first, then the network, delete and sandbox rows, then the commands row and the list: allow (in or outside the sandbox), ask, or refuse.
3. An ask parks the call in the adapter, which says `approval`. `session-service.ts` adds it to `session.approvals` and a waiting step, the session becomes `needs_you`, and `sessions.changed` and `session.changed` go out. The call waits with no time limit.
4. The Session screen shows the oldest waiting call in the amber callout (`role="alert"`, never focused by itself) with Allow once, Always allow <entry> (only where offered) and Deny.
5. `POST /api/sessions/:id/approvals/:approvalId` reaches `SessionService.respond()`: Always allow saves the entry first (a failed save decides nothing), then `adapter.respond()` ends the wait. The first answer counts; a late one is 409. Stop, Discard and closing deny every waiting call. Each call is kept in `session.json`'s `approvalLog`; the log names only kinds and answers.

## Session data

| Data                     | Where                                                                   |
| ------------------------ | ----------------------------------------------------------------------- |
| Brief, steps, approvals  | `~/.devhub/sessions/<session>/` (`session.json`, `brief.md`), 0700/0600 |
| Code changes             | `~/.devhub/worktrees/<session>`, its branch made at the first edit      |
| Claude Code's transcript | `~/.claude/projects/`, Claude Code's own; a follow-up resumes it        |

## Testing

- Test the permission decision as a pure function: every row × command kind, including network, push and delete-outside-worktree asking by default, and a push of another branch or a forced one refused even with Allow.
- Test worktree creation against a real temporary git repo in a temp `DEVHUB_HOME`. Never touch the real `~/.devhub` or a real repo.
- Fake the Claude Agent SDK only at its boundary (it is an outside service). Never fake our runtime modules.

## Don't

- Don't add a push, PR or merge that no click or row allowed, and never a merge or a forced push.
- Don't change a row's safe default, and don't let one row decide another's kind of call.
- Don't add context to the brief that the user did not put in a chip.
- Don't run anything against the user's real repos or `~/.devhub` while developing. Stop and ask.

## Checked by

`/review` with the security-auditor agent (any automatic push, PR or unapproved command is a critical finding) · `pnpm test packages/core`
