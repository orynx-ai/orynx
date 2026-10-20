# Tasks: Session terminal

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Contracts for Claude’s commands, the terminal’s tabs and blocks, their routes and `session.terminal.changed` (AC-4, AC-19); the two query keys and the event’s mapping came with it, so the app compiles
      Check: pnpm test packages/contracts/src/terminal.test.ts; pnpm typecheck
      Files: packages/contracts/src/terminal.ts, packages/contracts/src/terminal.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/events.ts, packages/contracts/src/index.ts
- [x] Task 2: The SDK reader says each command's end with its output, failure and time; the command work carries its call's id (AC-19)
      Check: pnpm test packages/core/src/agents/claude/sdk-messages.test.ts packages/core/src/agents/claude/claude-adapter.test.ts
      Files: packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/sdk-messages.ts, packages/core/src/agents/claude/claude-adapter.ts, their tests
- [x] Task 3: The session keeps a command log (running, ended, denied, refused) and serves it at GET /sessions/:id/commands (AC-19, AC-20, AC-24)
      Check: pnpm test packages/core/src/sessions/command-log.test.ts packages/core/src/sessions/session-service.test.ts packages/core/src/routes/sessions.test.ts
      Files: packages/core/src/sessions/command-log.ts, command-log.test.ts, session-store.ts, session-service.ts, packages/core/src/routes/sessions.ts, tests
- [x] Task 4: Terminal output buffer: lines and blocks capped, partial lines joined (AC-16). Plain lines and colour codes came with task 3
      Check: pnpm test packages/core/src/terminal/output.test.ts
      Files: packages/core/src/terminal/output.ts, output.test.ts
- [x] Task 5: Terminal service runs a command in the worktree as your login shell, one per tab, with Stop, tabs, clear and a clean environment (AC-4–AC-9, AC-11, AC-13, AC-15, AC-25, AC-29)
      Check: pnpm test packages/core/src/terminal/terminal-service.test.ts
      Files: packages/core/src/terminal/terminal-service.ts, terminal-service.test.ts
- [x] Task 6: Terminal routes, wired into the server; Discard and shutdown stop every command (AC-10, AC-11, AC-25, AC-28)
      Check: pnpm test packages/core/src/routes/terminal.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/routes/terminal.ts, terminal.test.ts, packages/core/src/create-server.ts, packages/core/src/sessions/session-service.ts
- [x] Task 7: Ask Claude to fix: the server builds the follow-up from its own block, sends it, and notes it in the command log (AC-17, AC-18)
      Check: pnpm test packages/core/src/terminal/ask-to-fix.test.ts packages/core/src/routes/terminal.test.ts
      Files: packages/core/src/terminal/ask-to-fix.ts, ask-to-fix.test.ts, packages/core/src/routes/terminal.ts, packages/core/src/sessions/command-log.ts
- [x] Task 8: api-client calls and query options for commands and the terminal (AC-20). The event’s refresh is tested through the shell tab in task 13
      Check: pnpm test packages/api-client/src/terminal.test.ts
      Files: packages/api-client/src/endpoints/terminal.ts, packages/api-client/src/queries.ts, packages/api-client/src/client.ts, packages/api-client/src/terminal.test.ts, packages/app/src/live-updates.tsx
- [x] Task 9: `CommandBlock` in @devhub/ui, with a story for each status and a test (AC-5, AC-14, AC-16, AC-19, AC-30, AC-31)
      Check: pnpm test packages/ui/src/components/command-block.test.tsx; pnpm gate component-coverage icon-buttons style-policy
      Files: packages/ui/src/components/command-block.tsx, .stories.tsx, .test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 10: `CommandInput` in @devhub/ui: prompt, label, hint, ↑/↓ history, ⌃C, busy (AC-8, AC-9, AC-12)
      Check: pnpm test packages/ui/src/components/command-input.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/command-input.tsx, .stories.tsx, .test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 11: Terminal button, `` ⌃` ``, and the full-screen dialog with header, tabs and Back to session (AC-1, AC-2, AC-3)
      Check: pnpm test packages/app/src/features/sessions/components/terminal
      Files: packages/app/src/features/sessions/components/terminal/terminal-dialog.tsx, terminal-dialog.test.tsx, session-header.tsx, packages/app/src/features/sessions/store.ts
- [ ] Task 12: The Claude tab: commands with output, waiting approvals with the callout's choices, denied, refused, legacy, empty and loading (AC-19–AC-24, AC-27)
      Check: pnpm test packages/app/src/features/sessions/components/terminal/claude-tab.test.tsx
      Files: packages/app/src/features/sessions/components/terminal/claude-tab.tsx, claude-tab.test.tsx, terminal-words.ts
- [ ] Task 13: Your shell tabs: run, history, Stop and ⌃C, Rerun, Copy, Clear, + and close, the 5-tab limit and errors (AC-4–AC-16, AC-25, AC-26)
      Check: pnpm test packages/app/src/features/sessions/components/terminal/shell-tab.test.tsx
      Files: packages/app/src/features/sessions/components/terminal/shell-tab.tsx, shell-tab.test.tsx, terminal-dialog.tsx
- [ ] Task 14: Ask Claude to fix in the shell tab moves to the Claude tab with its note (AC-17, AC-18)
      Check: pnpm test packages/app/src/features/sessions/components/terminal
      Files: packages/app/src/features/sessions/components/terminal/shell-tab.tsx, terminal-dialog.tsx, tests
- [ ] Task 15: e2e: open the terminal on a real worktree, run, stop, `env`, and axe on every state, at 360 and 1280 px (AC-1, AC-4, AC-9, AC-29, AC-30, AC-31)
      Check: pnpm test:e2e apps/web/e2e/session-terminal.e2e.ts
      Files: apps/web/e2e/session-terminal.e2e.ts
- [ ] Task 16: Docs: architecture (the server runs what the page sends, in a worktree only), learn page, design map
      Check: pnpm gate handbook-size specs
      Files: docs/architecture.md, learn/sessions-and-worktrees.md, docs/design-map.md
- [ ] Task 17: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
