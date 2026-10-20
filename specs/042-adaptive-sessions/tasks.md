# Tasks: Adaptive sessions

One task is one commit. Test first, then code. Tick a task only when its Check passes.

## Contracts

- [ ] Task 1: Describe a session's steps (`{ kind, label, state }`), its `intent` and `branchFrom`, and read an old `step` + `skipped` as today's five steps (AC-28, AC-32)
      Check: pnpm test packages/contracts/src/session.test.ts packages/core/src/sessions/file-session-store.test.ts
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/core/src/sessions/file-session-store.ts, packages/core/src/sessions/file-session-store.test.ts
- [ ] Task 2: Describe the new activities (`reading`, `steps_changed`, `branch_made`, `server`) and a worktree row with no branch (AC-1, AC-15, AC-24)
      Check: pnpm test packages/contracts/src/session.test.ts
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts
- [ ] Task 3: Describe the quick read's answer, the `server` approval (and its notification) and the ports bodies and paths (AC-2, AC-7)
      Check: pnpm test packages/contracts/src/session.test.ts packages/contracts/src/notifications.test.ts packages/contracts/src/ports.test.ts
      Files: packages/contracts/src/session.ts, packages/contracts/src/notifications.ts, packages/contracts/src/ports.ts, packages/contracts/src/ports.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts
- [ ] Task 4: Let a session's branch be null until it's made, and make every use compile with it (AC-3)
      Check: pnpm typecheck; pnpm test packages/core/src/sessions/pull-requests.test.ts
      Files: packages/contracts/src/session.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/pull-requests.ts, packages/app/src/features/sessions/components/delete-session.tsx

## Core: steps, the quick read, branches

- [ ] Task 5: Check a step list by the strict rules and move steps by kind, as a pure module; `progress.ts` uses it (AC-25, AC-26, AC-27, AC-28)
      Check: pnpm test packages/core/src/sessions/steps.test.ts packages/core/src/sessions/progress.test.ts
      Files: packages/core/src/sessions/steps.ts, packages/core/src/sessions/steps.test.ts, packages/core/src/sessions/progress.ts, packages/core/src/sessions/progress.test.ts
- [ ] Task 6: Read the repository's written branch rules (capped at 8 KB, only paragraphs about branches) and your 20 newest branch names (AC-16, AC-20)
      Check: pnpm test packages/core/src/sessions/branch-rules.test.ts
      Files: packages/core/src/sessions/branch-rules.ts, packages/core/src/sessions/branch-rules.test.ts
- [ ] Task 7: Let `AgentAdapter.write()` take the composer's model and effort (AC-1)
      Check: pnpm test packages/core/src/agents/claude/claude-adapter.test.ts
      Files: packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/agents/claude/claude-adapter.test.ts
- [ ] Task 8: The quick read: build its prompt, parse its answer, check the base, branch (format, length, key, taken), title and steps, and fall back on failure or after 30 s (AC-1, AC-19, AC-21, AC-22, AC-23, AC-27)
      Check: pnpm test packages/core/src/sessions/ask-reading.test.ts
      Files: packages/core/src/sessions/ask-reading.ts, packages/core/src/sessions/ask-reading.test.ts, packages/core/src/sessions/composer-names.ts
- [ ] Task 9: A Build session reads the ask first: the reading row, the title, the intent's steps, then a worktree detached at the base; Ask sessions skip it (AC-1, AC-22, AC-23, AC-29, AC-30)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/worktrees.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts, packages/core/src/sessions/worktrees.ts, packages/core/src/sessions/worktrees.test.ts, packages/core/src/test/fake-claude-sdk.ts
- [ ] Task 10: Make the branch at the first allowed edit or at Create pull request, with a `branch_made` row; a named branch on `origin` works detached on it with Push; a local one takes `-2` (AC-3, AC-15, AC-16, AC-17, AC-18, AC-19, AC-31)
      Check: pnpm test packages/core/src/sessions/worktrees.test.ts packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/pull-requests.test.ts
      Files: packages/core/src/sessions/worktrees.ts, packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/pull-requests.ts, and their tests

## Core: Claude's new tools

- [ ] Task 11: `set_steps`: Claude replaces the steps to come and moves `current`, refused whole with the broken rule; a `steps_changed` row; Claude's note explains it (AC-24, AC-25, AC-26, AC-31)
      Check: pnpm test packages/core/src/sessions/session-tools.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/session-tools.ts, packages/core/src/sessions/session-tools.test.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/brief.ts
- [ ] Task 12: A Terminal tab can start with a command and say its shell's PID; `start_server` asks first, runs in a new tab, answers with the address or the last 40 lines; `stop_server`; `run_in_background`'s refusal names `start_server` (AC-2, AC-12, AC-14, AC-37)
      Check: pnpm test packages/core/src/terminal/terminal-service.test.ts packages/core/src/sessions/session-tools.test.ts packages/core/src/agents/claude/command-decision.test.ts
      Files: packages/core/src/terminal/terminal-service.ts, packages/core/src/sessions/session-tools.ts, packages/core/src/agents/claude/command-decision.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/sessions/session-service.ts, and their tests
- [ ] Task 13: "Always allow in this repository" for servers, kept in Settings › Coding agent's allow list (AC-2)
      Check: pnpm test packages/core/src/agents/claude/tool-decision.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/agents/claude/tool-decision.ts, packages/core/src/sessions/session-service.ts, and their tests

## Core and api-client: ports

- [ ] Task 14: Read this session's listeners from `lsof` (child of its tabs or Claude's commands, or cwd in the worktree), who started each, known names, and https or http once per new port (AC-6, AC-7, AC-8, AC-10, AC-11)
      Check: pnpm test packages/core/src/ports/
      Files: packages/core/src/ports/listeners.ts, packages/core/src/ports/listeners.test.ts, packages/core/src/ports/port-service.ts, packages/core/src/ports/port-service.test.ts
- [ ] Task 15: Stop (re-checked as the session's, SIGTERM then SIGKILL after 5 s) and Restart (a server Orynx started, in its own tab), each with a `server` row; Delete stops the session's servers first (AC-4, AC-5, AC-7, AC-13)
      Check: pnpm test packages/core/src/ports/port-service.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/ports/port-service.ts, packages/core/src/sessions/session-service.ts, and their tests
- [ ] Task 16: The ports routes, with the Host and token checks, and the api-client functions and query options (AC-4, AC-7, AC-9)
      Check: pnpm test packages/core/src/routes/ports.test.ts packages/api-client/src/endpoints/ports.test.ts
      Files: packages/core/src/routes/ports.ts, packages/core/src/routes/ports.test.ts, packages/core/src/create-server.ts, packages/api-client/src/endpoints/ports.ts, packages/api-client/src/endpoints/ports.test.ts, packages/api-client/src/queries.ts

## UI components

- [ ] Task 17: `Stepper` shows only the current step's label below 640 px, the others' kept for screen readers, always one line (AC-34)
      Check: pnpm test packages/ui/src/components/stepper.test.tsx; pnpm gate style-policy
      Files: packages/ui/src/components/stepper.tsx, packages/ui/src/components/stepper.test.tsx, packages/ui/src/components/stepper.stories.tsx
- [ ] Task 18: `PortRow`: address, what it is, who started it, how long, and an actions slot; its loading look has the same height (AC-8, AC-9, AC-35)
      Check: pnpm test packages/ui/src/components/port-row.test.tsx; pnpm gate component-coverage icon-buttons
      Files: packages/ui/src/components/port-row.tsx, packages/ui/src/components/port-row.test.tsx, packages/ui/src/components/port-row.stories.tsx, packages/ui/src/index.ts, docs/design-map.md

## App

- [ ] Task 19: Words for the reading, steps-changed, branch-made and server rows, and "No branch yet" (AC-1, AC-15, AC-22, AC-23, AC-24)
      Check: pnpm test packages/app/src/features/sessions/step-words.test.ts
      Files: packages/app/src/features/sessions/step-words.ts, packages/app/src/features/sessions/step-words.test.ts
- [ ] Task 20: The stepper draws the session's own steps; the header says "No branch yet" or the branch, and links the first web address (AC-1, AC-2, AC-3, AC-32, AC-34)
      Check: pnpm test packages/app/src/features/sessions/components/session-progress.test.tsx packages/app/src/features/sessions/components/session-header.test.tsx
      Files: packages/app/src/features/sessions/components/session-progress.tsx, packages/app/src/features/sessions/components/session-header.tsx, and their tests
- [ ] Task 21: The Ports tab, first: rows with Open or Copy address, Stop (a confirm when found in the worktree), Restart or Run again in Terminal; empty, loading and error; polled 3 s open, 15 s for the count, never hidden (AC-4, AC-5, AC-6, AC-8, AC-9, AC-10, AC-11, AC-35)
      Check: pnpm test packages/app/src/features/sessions/components/ports-panel.test.tsx
      Files: packages/app/src/features/sessions/components/ports-panel.tsx, packages/app/src/features/sessions/components/ports-panel.test.tsx, packages/app/src/features/sessions/queries.ts
- [ ] Task 22: Tabs read Ports · Changes · Context; the page opens on Ports for a run session or while something listens, and never switches by itself (AC-1, AC-33, AC-34)
      Check: pnpm test packages/app/src/features/sessions/components/session-details.test.tsx packages/app/src/features/sessions/session-screen.test.tsx
      Files: packages/app/src/features/sessions/components/session-details.tsx, packages/app/src/features/sessions/session-search.ts, and their tests
- [ ] Task 23: The server approval in the callout (Allow once, Always allow in this repository, Deny), and Delete's "Stops 1 server" line (AC-2, AC-13)
      Check: pnpm test packages/app/src/features/sessions/components/approval-callout.test.tsx packages/app/src/features/sessions/components/delete-session.test.tsx packages/app/src/features/sessions/approval-words.test.ts
      Files: packages/app/src/features/sessions/components/approval-callout.tsx, packages/app/src/features/sessions/approval-words.ts, packages/app/src/features/sessions/components/delete-session.tsx, and their tests

## End to end and docs

- [ ] Task 24: The fake Claude answers the quick read (today's five steps unless the title asks for a run), plays `set_steps` and `start_server` with a real listening port; a new e2e file walks the run session and a change session at 360 and 1280 px, light and dark, with axe and no layout shift (AC-1, AC-2, AC-3, AC-4, AC-15, AC-24, AC-33, AC-34, AC-36)
      Check: pnpm exec playwright test e2e/adaptive-sessions.spec.ts
      Files: e2e/fake-claude/session.ts, e2e/adaptive-sessions.spec.ts
- [ ] Task 25: The agent-runtime skill, the design map and `learn/` say how the quick read, steps, branches, servers and ports work; tried by hand on acme-app with the composer's model
      Check: pnpm gate handbook-size specs
      Files: .claude/skills/agent-runtime/SKILL.md, docs/design-map.md, learn/adaptive-sessions.md
- [ ] Task 26: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
