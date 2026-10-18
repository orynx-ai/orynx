# Tasks: Approvals

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Add the command reader to contracts: split a command into parts at `&&`, `||`, `;` and `|` minding quotes and escapes, say why it always asks (`network`, `delete_outside`, `unsandboxed`) or is refused (`push`), name what never matches (substitution, `eval`, `sh -c`, `sudo`, redirections, `NAME=value`), give the entry Always allow saves, and `AllowedCommandSchema` refined on it, as a table (AC-4, AC-5, AC-6, AC-7, AC-15, Q3, Q4)
      Check: pnpm test packages/contracts/src/commands.test.ts; pnpm typecheck
      Files: packages/contracts/src/commands.ts, packages/contracts/src/commands.test.ts, packages/contracts/src/index.ts
- [x] Task 2: Add `allowedCommands` to the preferences, and `allowCommand` and `disallowCommand` to the change (one entry each, the refine updated), with the builders (AC-5, AC-11, AC-15)
      Check: pnpm test packages/contracts/src/preferences.test.ts; pnpm typecheck
      Files: packages/contracts/src/preferences.ts, packages/contracts/src/preferences.test.ts, packages/contracts/src/testing.ts
- [x] Task 3: Add the session approval contracts: `SessionApprovalSchema` (a command with its description, why it always asks and the Always allow entry; or an edit with its path, whether it creates the file, its lines and how many more), `approvals` on the session, the activities `waiting`, `command`, `denied` and `no_commands`, the refused reasons `push` and `background`, the respond path and `{ decision }` request, and the builders (AC-1, AC-3, AC-8, AC-10)
      Check: pnpm test packages/contracts/src/session.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/testing.ts
- [x] Task 4: Read and save `agent.allowedCommands` in the preferences service: add without a duplicate, remove by entry, keep every other setting, say `settings.changed` (AC-5, AC-11, AC-15)
      Check: pnpm test packages/core/src/preferences; pnpm test packages/core/src/routes/preferences.test.ts
      Files: packages/core/src/preferences/preferences-service.ts, packages/core/src/preferences/preferences-service.test.ts, packages/core/src/routes/preferences.test.ts
- [x] Task 5: Decide a command as a table, every mode against every kind: on the list (every part on it, a `cd` inside the worktree, or a filter), not on the list, several parts, always-ask kinds, `run_in_background`, `dangerouslyDisableSandbox`, and push; the answer is allow, ask (why, and the Always allow entry only in Edit files and run allowed commands) or refuse (AC-4, AC-5, AC-6, AC-7, Q1, Q3, Q4, Q7)
      Check: pnpm test packages/core/src/agents/claude/command-decision.test.ts
      Files: packages/core/src/agents/claude/command-decision.ts, packages/core/src/agents/claude/command-decision.test.ts
- [x] Task 6: Teach the tool decision to ask: `Bash` goes to the command decision, an edit in Ask before everything asks with a preview (the old and new text numbered from where the old text sits in the file, at most 20 lines then the count, a new file as added lines, at most 1 MB read), outside the worktree still refuses, and 011's AC-6 tests expect an ask (AC-6, AC-8, Q9)
      Check: pnpm test packages/core/src/agents/claude/tool-decision.test.ts packages/core/src/agents/claude/edit-preview.test.ts
      Files: packages/core/src/agents/claude/tool-decision.ts, packages/core/src/agents/claude/tool-decision.test.ts, packages/core/src/agents/claude/edit-preview.ts, packages/core/src/agents/claude/edit-preview.test.ts
- [x] Task 7: Add `sandbox.ts`: whether the sandbox can run here (macOS with `sandbox-exec`, Linux with `bubblewrap` and `socat` on the PATH, never Windows), and the SDK settings a session passes: enabled, `failIfUnavailable`, `autoAllowBashIfSandboxed: false`, `allowUnsandboxedCommands`, writes only in the worktree and the temporary folder, no reads under `DEVHUB_HOME` or the keychain folder, no network (AC-9, AC-20, Q2)
      Check: pnpm test packages/core/src/agents/claude/sandbox.test.ts
      Files: packages/core/src/agents/claude/sandbox.ts, packages/core/src/agents/claude/sandbox.test.ts
- [x] Task 8: Make the adapter wait: `canUseTool` parks an ask until `respond()` (allow, always as allow, deny with the deny message), Stop denies every parked call before interrupting and the SDK's signal denies too, an `approval` event goes out, a `command` work goes out when a command is allowed, an allowed always-ask command gets `dangerouslyDisableSandbox: true`, `startSession` takes a `permissions()` reader, and a session without a sandbox gets no `Bash` and a `no_commands` event; the fake SDK answers asks as Claude Code does (AC-1, AC-2, AC-3, AC-6, AC-11, AC-12, AC-20)
      Check: pnpm test packages/core/src/agents/claude/claude-adapter.test.ts
      Files: packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/agents/claude/claude-adapter.test.ts, packages/core/src/test/fake-claude-sdk.ts
- [x] Task 9: Fold commands: the reader turns a `Bash` result into `command` work, and progress groups commands ("Running a command" until another kind starts), replaces a `waiting` step with `command` or `denied` when answered, adds `no_commands`, and moves the stepper to Test on the first command after the first edit, never before (AC-2, AC-10, AC-17)
      Check: pnpm test packages/core/src/agents/claude/sdk-messages.test.ts packages/core/src/sessions/progress.test.ts
      Files: packages/core/src/agents/claude/sdk-messages.ts, packages/core/src/agents/claude/sdk-messages.test.ts, packages/core/src/sessions/progress.ts, packages/core/src/sessions/progress.test.ts
- [x] Task 10: Run approvals in the session service: keep each ask with its answer and who gave it, Needs you while any waits and Working once none does, `respond()` with Allow once, Always allow (save the entry, then allow; a failed save decides nothing), Deny, a late answer and an unknown approval, the queue in order, Stop, Discard and `close()` answering the rest as stopped or interrupted, Q8g's note, and the log naming kinds and answers only (AC-1, AC-3, AC-5, AC-10, AC-11, AC-12, AC-13, AC-14, AC-21, AC-22)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/brief.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts, packages/core/src/sessions/session-store.ts, packages/core/src/sessions/brief.ts, packages/core/src/sessions/brief.test.ts
- [x] Task 11: Add `POST /api/sessions/:id/approvals/:approvalId`: 204, 404 for an unknown session or approval, 409 when already answered, 503 when the allow list can't be saved; the session detail carries the waiting approvals; the leak test covers asks, answers and denials at `LOG_LEVEL=trace` (AC-13, AC-14, AC-22)
      Check: pnpm test packages/core/src/routes/sessions.test.ts packages/core/src/create-server.test.ts
      Files: packages/core/src/routes/sessions.ts, packages/core/src/routes/sessions.test.ts, packages/core/src/create-server.ts, packages/core/src/create-server.test.ts, packages/contracts/src/errors.ts
- [x] Task 12: Read old sessions without `approvals` from disk, and answer a session's waiting approvals as interrupted when the store opens with it still waiting (AC-21)
      Check: pnpm test packages/core/src/sessions/file-session-store.test.ts
      Files: packages/core/src/sessions/file-session-store.ts, packages/core/src/sessions/file-session-store.test.ts
- [x] Task 13: Add `DEVHUB_SANDBOX` (`required` by default, `assume` for a fake Claude Code) to the server's config, `.env.example` and `turbo.json`, pass the sandbox check to `createServer()`, and run the e2e hubs with `assume` (AC-20, AC-23)
      Check: pnpm test apps/server; pnpm gate env-policy
      Files: apps/server/src/config.ts, apps/server/src/config.test.ts, apps/server/src/main.ts, .env.example, turbo.json, playwright.config.ts
- [x] Task 14: Teach the e2e fake Claude Code to ask: a `Bash` call that asks `can_use_tool` and runs what the answer allows (writes a file the test can see), picked by the ticket's title: a plain command, a network command, an edit in Ask before everything, and two commands at once; probe the pinned SDK's flags for the sandbox settings and record them (AC-23)
      Check: pnpm test:e2e e2e/sessions.spec.ts (still passes); the probe's record in learn/
      Files: e2e/fake-claude/session.ts, e2e/fake-claude/probe.ts, learn/sessions-and-worktrees.md
- [x] Task 15: Add `respondToApproval` to the api-client, parsed with the contract, with its MSW test (AC-2)
      Check: pnpm test packages/api-client
      Files: packages/api-client/src/endpoints/sessions.ts, packages/api-client/src/endpoints/sessions.test.ts, packages/api-client/src/client.ts, packages/api-client/src/index.ts
- [x] Task 16: Give `Callout` a `code` block for the command: mono, wrapped, scrolling inside its box past 12 lines, with a story per state and a test (AC-1, AC-19, Q8a)
      Check: pnpm test packages/ui/src/components/callout.test.tsx; pnpm storybook (no axe violations)
      Files: packages/ui/src/components/callout.tsx, packages/ui/src/components/callout.stories.tsx, packages/ui/src/components/callout.test.tsx, docs/design-map.md
- [x] Task 17: Add the words: step words for `waiting`, `command`, `denied`, `no_commands` and the new refusals, the callout's titles, why-lines and errors, the "Needs your approval" pill (Q8a–Q8e)
      Check: pnpm test packages/app/src/features/sessions/step-words.test.ts packages/app/src/features/sessions/approval-words.test.ts
      Files: packages/app/src/features/sessions/step-words.ts, packages/app/src/features/sessions/step-words.test.ts, packages/app/src/features/sessions/approval-words.ts, packages/app/src/features/sessions/approval-words.test.ts
- [x] Task 18: Build `ApprovalCallout`: the first waiting approval in the warning `Callout` with `role="alert"`, Allow once, Always allow `<entry>` only when the server offers one, Deny (as `session.html` draws them), the why-line for an always-ask command, the edit preview in `DiffView`, the pressed button busy and the others waiting, the error line with the buttons ready again, a 409 treated as answered, and focus left where it was then moved to the next callout or the "Claude's progress" heading (AC-1, AC-2, AC-3, AC-5, AC-6, AC-8, AC-13, AC-14, AC-18, Q5, Q9)
      Check: pnpm test packages/app/src/features/sessions/components/approval-callout.test.tsx
      Files: packages/app/src/features/sessions/components/approval-callout.tsx, packages/app/src/features/sessions/components/approval-callout.test.tsx, packages/app/src/features/sessions/queries.ts
- [x] Task 19: Put the callout at the top of Claude's progress, give the `waiting` step its amber look, let the stepper show Test, and say "Needs your approval" in the pill (AC-1, AC-10, AC-17, Q8d)
      Check: pnpm test packages/app/src/features/sessions
      Files: packages/app/src/features/sessions/components/session-progress.tsx, packages/app/src/features/sessions/components/session-header.tsx, packages/app/src/features/sessions/session-screen.tsx, packages/app/src/features/sessions/session-screen.test.tsx
- [x] Task 20: Add "Allowed commands" to Settings › Coding agent: the help line, rows with "Remove npm test", the labelled Command field and Add with react-hook-form and the contract's schema plus "already on the list", the empty line, the refusals' lines, an added or removed entry shown at once and taken back alone when its save fails, Server unreachable and the save error, and focus after Remove (AC-15, AC-16, AC-18, Q6, Q8f)
      Check: pnpm test packages/app/src/features/settings
      Files: packages/app/src/features/settings/components/allowed-commands.tsx, packages/app/src/features/settings/components/allowed-commands.test.tsx, packages/app/src/features/settings/components/coding-agent-panel.tsx, packages/app/src/features/settings/components/coding-agent-panel.test.tsx, packages/app/src/features/settings/schemas.ts, packages/app/src/features/settings/queries.ts
- [x] Task 21: e2e: a command asks and Allow once runs it, Deny doesn't, Always allow adds the entry Settings shows and the next run doesn't ask, a network command says why and offers no Always allow, two commands wait in turn, a second tab's callout goes, and Stop while waiting denies (AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-10, AC-12, AC-13)
      Check: pnpm test:e2e e2e/approvals.spec.ts
      Files: e2e/approvals.spec.ts, e2e/fake-tools/config.ts
- [x] Task 22: e2e: an edit asks in Ask before everything with its change, Settings' allowed commands add, remove and refuse, the keyboard path through a callout and the list, and axe at 360 and 1280 px in light and dark (AC-8, AC-15, AC-18, AC-19)
      Check: pnpm test:e2e e2e/approvals.spec.ts
      Files: e2e/approvals.spec.ts
- [x] Task 23: Docs: `learn/sessions-and-worktrees.md` (approvals, the sandbox, the probe's record) and `learn/settings-and-folders.md` (the allow list), agent-runtime rule 6's command side and its Approvals section, the roadmap's 012 line, `docs/architecture.md` (the sandbox, `DEVHUB_SANDBOX`, the command reader in contracts)
      Check: pnpm gate learn-freshness; pnpm gate handbook-size; pnpm gate specs
      Files: learn/sessions-and-worktrees.md, learn/settings-and-folders.md, .claude/skills/agent-runtime/SKILL.md, docs/product/roadmap.md, docs/architecture.md
- [x] Task 24: Open the Session screen and Settings › Coding agent in a real browser (`pnpm dev`, own `DEVHUB_HOME`) at 360 and 1280 px, light and dark, in each state through `page.route`: a command callout, an always-ask callout, an edit callout, an answer error, the list empty, full and refusing an entry. Measure CLS, and tick each check here (AC-19)
      Check: the screenshots and CLS values recorded in this task
      Files: specs/012-approvals/tasks.md
      Done 18 Oct 2026, headless Chromium against the running `pnpm dev` (this worktree's server). Every state came from `page.route`: the session, the approval POST (204, or 500 for the error) and the preferences (GET faked, PATCH answered 500), so nothing was written under `~/.devhub`. Each state at 360 and 1280 px, light and dark (28 pages): - [x] Command callout (Allow once, Always allow npm test, Deny): no axe violations, no sideways scroll, CLS 0 - [x] Always-ask callout (a long `curl … | head` wraps in its box; the why-line; no Always allow): no axe violations, no sideways scroll, CLS 0 - [x] Edit callout (the change in `DiffView`, "and 12 more lines", the waiting step with the pencil): no axe violations, no sideways scroll, CLS 0 - [x] Answer error ("Couldn't send your answer. Try again." after Allow once): no axe violations, no sideways scroll, CLS 0 - [x] Allow list empty, full (with a long entry that wraps) and refusing `git push`: no axe violations, no sideways scroll. CLS 0 at 1280 px and 0.004 at 360 px, from the Claude card (spec 010) growing as Claude's login loads and moving "More agents" and the modes 20 px down; the allow list itself doesn't move - [x] The pill says "Needs your approval", the stepper is on Test, and the waiting step is amber, as `session.html` draws them
- [x] Task 25: Ask the user to run one real session on a throwaway repository (Q10): in each mode try Allow once, Always allow and Deny, a network command, a command that reads `<DEVHUB_HOME>/runtime.json`, one that calls Orynx's API, and one that looks up the keychain item; read the `init` message's counts. Write down what happened
      Check: the user's notes recorded here; AC-1 to AC-9 as seen
      Files: specs/012-approvals/tasks.md, learn/sessions-and-worktrees.md
      Done 18 Oct 2026: the user ran the real session with the real sandbox and reported it tested. No per-command notes were given.
- [ ] Task 26: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
