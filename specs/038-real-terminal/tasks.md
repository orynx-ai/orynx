# Tasks: Real terminal

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Contracts for tabs, input, size and the output stream (AC-1, AC-2, AC-4, AC-5)
      Check: pnpm test packages/contracts/src/terminal.test.ts
      Files: packages/contracts/src/terminal.ts, routes.ts, events.ts, testing.ts
- [x] Task 2: A pseudo-terminal per tab, its routes and the output stream (AC-1 to AC-8)
      Check: pnpm test packages/core/src/terminal packages/core/src/routes/terminal.test.ts
      Files: packages/core/src/terminal/terminal-service.ts, routes/terminal.ts, plugins/local-only.ts
- [x] Task 3: The API client's input, size and output stream (AC-2, AC-4, AC-5)
      Check: pnpm test packages/api-client/src
      Files: packages/api-client/src/endpoints/terminal.ts, events.ts, client.ts
- [x] Task 4: `TerminalView` in `@devhub/ui` (AC-1, AC-2, AC-4, AC-5)
      Check: pnpm test packages/ui/src/components/terminal-view.test.tsx
      Files: packages/ui/src/components/terminal-view.tsx, its story and test
- [x] Task 5: The shell tab on `TerminalView`, Terminal in More actions, × to close (AC-1 to AC-7)
      Check: pnpm test packages/app/src/features/sessions
      Files: packages/app/src/features/sessions/components/terminal/*, session-header.tsx, queries.ts
- [x] Task 6: e2e and docs (AC-1 to AC-7)
      Check: pnpm test:e2e e2e/terminal.spec.ts
      Files: e2e/terminal.spec.ts, docs/architecture.md, docs/design-map.md, learn/sessions-and-worktrees.md
- [ ] Task 7: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
