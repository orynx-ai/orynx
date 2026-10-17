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
   - Edit files and run allowed commands: commands on the allow list run; anything else asks. "Always allow" adds to the list.
3. **Always ask, whatever the mode:** commands that touch the network, delete outside the worktree, or push to git.
4. **The PR is always the user's click.** DevHub pushes the branch and opens the PR only after Create pull request. Claude never pushes or opens a PR by itself.
5. **The brief is exactly the chips.** What goes to Claude is the composer text plus every context chip (ticket, PR diff, Slack thread, files). Slack data goes only when the user added that thread.
6. **Credentials.** The Claude login is handled by the Claude Agent SDK. DevHub never sees or stores it. Any command Claude runs as `node` (tests, scripts) can read DevHub's "DevHub" keychain items without a macOS prompt, so the runtime must keep Claude's commands away from them, and never pass DevHub's own environment to the SDK. Decide how in spec 010 (`learn/tokens-and-keychain.md`).
7. **Stop** works at any step. The worktree keeps the changes. Discard deletes the worktree and branch after a confirm step in the page (never a browser dialog).

## The adapter interface

Claude plugs in through one interface so other agents can follow later without changing the screens. It lives in `packages/core/src/agents/agent-adapter.ts`:

```ts
export interface AgentAdapter {
  readonly id: 'claude';
  startSession(brief: AgentBrief, worktreePath: string, permissions: AgentPermissions): Promise<string>; // sessionId
  onEvent(sessionId: string, handler: (event: AgentEvent) => void): () => void; // step, file change, approval request, done, error
  respond(sessionId: string, approvalId: string, decision: 'allow' | 'deny' | 'always'): Promise<void>;
  sendMessage(sessionId: string, text: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
}
```

The Claude implementation uses `@anthropic-ai/claude-agent-sdk` (planned, spec 010) and `simple-git` for worktrees (spec 011).

## Session states

States come from `SessionStateSchema` in `packages/contracts/src/session.ts`: `working`, `needs_you`, `done`, `pr_open`, `stopped`. Each is shown with an icon, a word and a colour (spec table "Session states"). Never colour alone.

## Approvals

1. The SDK's permission callback asks the runtime whether a tool call may run.
2. The runtime checks the mode, the allow list and the always-ask rules.
3. If the user must decide, the session becomes `needs_you`, an approval event goes out on the event bus, and the call waits.
4. The Session screen shows the amber callout in place (`role="alert"`) with Allow once, Always allow <command>, Deny.
5. `respond()` resumes or denies the call. "Always" adds the command to the allow list.

## Session data

| Data                    | Where                           |
| ----------------------- | ------------------------------- |
| Brief, steps, approvals | `~/.devhub/sessions/`           |
| Code changes            | `~/.devhub/worktrees/<session>` |

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
