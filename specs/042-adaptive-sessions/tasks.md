# Tasks: Adaptive sessions

One task is one commit. Test first, then code. Tick a task only when its Check passes.

## Contracts

- [x] Task 1: Describe a session's own steps (`{ kind, label }`, by the strict rules), its `intent` and `branchFrom`; a session saved before reads with today's five steps through `stepsOf` (AC-25, AC-28, AC-32)
      Check: pnpm test packages/contracts/src/session.test.ts packages/app/src/features/sessions/components/session-progress.test.tsx; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/core/src/sessions/session-service.ts, packages/app/src/features/sessions/components/session-progress.tsx
- [x] Task 2: Describe the new activities (`reading`, `steps_changed`, `branch_made`, `server`) and a worktree row with no branch, with their words and icons (AC-1, AC-15, AC-21, AC-22, AC-23, AC-24)
      Check: pnpm test packages/contracts/src/session.test.ts packages/app/src/features/sessions/step-words.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/app/src/features/sessions/step-words.ts, packages/app/src/features/sessions/step-words.test.ts, packages/app/src/features/sessions/components/session-progress.tsx
- [x] Task 3: Describe the `server` approval (with its callout, its words and its notification) and the ports bodies and paths (AC-2, AC-7, AC-10, AC-11)
      Check: pnpm test packages/contracts/src packages/app/src/features/sessions/components/approval-callout.test.tsx; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/notifications.ts, packages/contracts/src/ports.ts, packages/contracts/src/ports.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/core/src/notifications/session-notifications.ts, packages/app/src/features/sessions/approval-words.ts, packages/app/src/features/sessions/components/approval-callout.tsx, packages/app/src/features/home/composer-words.ts, packages/app/src/features/notifications/words.ts
- [x] Task 4: A worktree with no branch yet still counts as made: its path, Changes and Terminal (the rest already took a null branch) (AC-3)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts; pnpm typecheck
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts

## Core: steps, the quick read, branches

- [x] Task 5: The stepper moves by the session's own order; Claude's `changeSteps` keeps what's done, moves forward only, never onto or past a step only Orynx or you move; a port opening moves to Run; finishing goes to Review, Answer or the last step before a pull request (AC-2, AC-24, AC-25, AC-26, AC-28, AC-29, AC-31)
      Check: pnpm test packages/core/src/sessions/progress.test.ts packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/pull-requests.test.ts; pnpm typecheck
      Files: packages/core/src/sessions/progress.ts, packages/core/src/sessions/progress.test.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/pull-requests.ts
- [x] Task 6: Read the repository's written branch rules (sections about branches whole, other paragraphs only when they say how branches are named, 8 KB) and, through `worktrees.hints`, the default base, origin's branch names and your 20 newest branches (AC-16, AC-20, AC-23)
      Check: pnpm test packages/core/src/sessions/branch-rules.test.ts packages/core/src/sessions/worktrees.test.ts
      Files: packages/core/src/sessions/branch-rules.ts, packages/core/src/sessions/branch-rules.test.ts, packages/core/src/sessions/worktrees.ts, packages/core/src/sessions/worktrees.test.ts
- [x] Task 7: Let `AgentAdapter.write()` take the composer's model and effort (AC-1)
      Check: pnpm test packages/core/src/agents/claude/claude-adapter.test.ts
      Files: packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/agents/claude/claude-adapter.test.ts
- [x] Task 8: The quick read: its instructions and prompt (the ask, chips, folder, branches, rules, never file contents), its JSON answer checked field by field (base on origin, a usable branch holding the ticket's key, a title cut at 80, steps by the rules or the intent's own), and no reading at all for anything else (AC-1, AC-21, AC-22, AC-23, AC-27)
      Check: pnpm test packages/core/src/sessions/ask-reading.test.ts
      Files: packages/core/src/sessions/ask-reading.ts, packages/core/src/sessions/ask-reading.test.ts
- [x] Task 9: A Build session reads the ask first (on in the server): the reading row, the title (a message alone), the intent and its steps, then the worktree from the base it named; a failed read starts as before; Ask sessions skip it. The fake SDK answers quick reads from their own queue, so sessions keep their scripts (AC-1, AC-22, AC-23, AC-30)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/worktrees.test.ts packages/core/src/sessions/no-leaks.test.ts packages/core/src/routes/sessions.test.ts packages/core/src/routes/agent.test.ts packages/core/src/routes/session-approvals.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts, packages/core/src/sessions/worktrees.ts, packages/core/src/sessions/worktrees.test.ts, packages/core/src/test/fake-claude-sdk.ts, packages/core/src/sessions/no-leaks.test.ts, packages/core/src/create-server.ts
- [x] Task 10: Every new-branch worktree starts detached; the planned name is kept, and the branch is made just before Claude's first allowed edit (`onEdit`), or at Create pull request, with a `branch_made` row; a branch you named on origin keeps its name and the worktree starts from it; a local one takes `-2` and the reading says it was taken; follow-ups carry on before there's a branch (AC-3, AC-15, AC-17, AC-18, AC-19, AC-31)
      Check: pnpm test packages/core/src/sessions/ packages/core/src/agents/claude/claude-adapter.test.ts packages/core/src/routes/sessions.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-store.ts, packages/core/src/sessions/worktrees.ts, packages/core/src/sessions/ask-reading.ts, packages/core/src/sessions/pull-requests.ts, packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/claude-adapter.ts, and their tests

## Core: Claude's new tools

- [x] Task 11: `set_steps`: Claude replaces the steps to come and moves `current`, refused whole with the broken rule; a `steps_changed` row; Claude's note explains it (AC-24, AC-25, AC-26, AC-31)
      Check: pnpm test packages/core/src/sessions/session-tools.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/session-tools.ts, packages/core/src/sessions/session-tools.test.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/brief.ts
- [x] Task 12: A Terminal tab can be opened for a server (named after it), restarted, and says its shell's PID; `start_server` asks first, runs in a tab of its own in the worktree or a folder inside it, answers with the address or the last 40 lines, adds a `server` row and moves the stepper to Run; `run_in_background`'s refusal names `start_server` (AC-2, AC-12, AC-14, AC-37)
      Check: pnpm test packages/core/src/terminal/terminal-service.test.ts packages/core/src/sessions/session-tools.test.ts packages/core/src/sessions/session-service.test.ts packages/core/src/agents/claude/command-decision.test.ts
      Files: packages/contracts/src/terminal.ts, packages/core/src/terminal/terminal-service.ts, packages/core/src/sessions/session-tools.ts, packages/core/src/sessions/session-service.ts, packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/agents/claude/command-decision.ts, packages/core/src/create-server.ts, and their tests
- [x] Task 13: "Always allow in this repository" for servers, kept in Settings › Coding agent's allow list as `server:<repository id>` (AC-2) — built with task 12

## Core and api-client: ports

- [x] Task 14: Read this session's listeners from `lsof` and `ps` (under one of its Terminal tabs, or running from inside its worktree, nothing else), who started each, known names, and https or http once per new server (AC-6, AC-7, AC-8, AC-9, AC-10, AC-11)
      Check: pnpm test packages/core/src/ports/
      Files: packages/core/src/ports/listeners.ts, packages/core/src/ports/listeners.test.ts, packages/core/src/ports/port-service.ts, packages/core/src/ports/port-service.test.ts
- [x] Task 15: Stop (checked as the session's again, SIGTERM to it and its children, SIGKILL after 5 s) with a `server` row; Restart for a server Claude started, in its own tab; `stop_server` for Claude, its own servers only; Delete and Discard stop the session's servers first (AC-4, AC-5, AC-6, AC-7, AC-13)
      Check: pnpm test packages/core/src/ports/ packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/session-tools.test.ts packages/core/src/terminal/terminal-service.test.ts
      Files: packages/core/src/ports/port-service.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-tools.ts, packages/core/src/terminal/terminal-service.ts, and their tests
- [x] Task 16: The ports routes (404 for no such session, 503 `ports_unreadable` when lsof can't run), with the Host and token checks, and the api-client calls and a query that reads every 3 s while the tab is open and every 15 s otherwise (AC-4, AC-7, AC-9)
      Check: pnpm test packages/core/src/routes/sessions.test.ts packages/api-client/src/ports.test.ts
      Files: packages/contracts/src/errors.ts, packages/core/src/routes/sessions.ts, packages/core/src/routes/sessions.test.ts, packages/api-client/src/endpoints/terminal.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/index.ts, packages/api-client/src/ports.test.ts

## UI components

- [x] Task 17: `Stepper` narrower than 36rem (a container query) shows only the current step's words and the others' marks, with no lines between, so five steps stay on one line; every step's words stay for screen readers (AC-34)
      Check: pnpm test packages/ui/src/components/stepper.test.tsx; pnpm gate style-policy
      Files: packages/ui/src/components/stepper.tsx, packages/ui/src/components/stepper.test.tsx, packages/ui/src/components/stepper.stories.tsx
- [x] Task 18: `PortRow`: address, what it is, who started it, how long, and an actions slot; its loading look has the same height (AC-8, AC-9, AC-35)
      Check: pnpm test packages/ui/src/components/port-row.test.tsx; pnpm gate component-coverage icon-buttons
      Files: packages/ui/src/components/port-row.tsx, packages/ui/src/components/port-row.test.tsx, packages/ui/src/components/port-row.stories.tsx, packages/ui/src/index.ts, docs/design-map.md

## App

- [x] Task 19: Words for the reading, steps-changed, branch-made and server rows (folded into task 2: the words switch can't compile without them)
- [x] Task 20: The header says "No branch yet" for a Build session with a worktree and no branch, and links the session's first web address, opened outside Orynx (the stepper already draws the session's own steps, from task 1) (AC-2, AC-3, AC-4)
      Check: pnpm test packages/app/src/features/sessions/components/session-header.test.tsx
      Files: packages/app/src/features/sessions/components/session-header.tsx, packages/app/src/features/sessions/queries.ts, packages/app/src/test/msw.ts, packages/contracts/src/testing.ts, and its test
- [x] Task 21: The Ports tab: rows with Open or Copy address, Restart for a server Claude started, Run again in Terminal for one found in the worktree, Stop (a confirm when found in the worktree); empty, loading (the rows' own chrome) and error with Try again; read every 3 s while open (AC-4, AC-5, AC-6, AC-8, AC-9, AC-10, AC-11, AC-35)
      Check: pnpm test packages/app/src/features/sessions/components/ports-panel.test.tsx
      Files: packages/app/src/features/sessions/components/ports-panel.tsx, packages/app/src/features/sessions/components/ports-panel.test.tsx, packages/app/src/features/sessions/port-words.ts
- [x] Task 22: Tabs read Ports · Changes · Context, Ports with how many listen, only for a session with a Terminal; the page opens on Ports for a run session, else Changes, and never switches by itself; a pick that isn't the default is kept in the address (AC-1, AC-33, AC-37)
      Check: pnpm test packages/app/src/features/sessions/components/session-details.test.tsx packages/app/src/features/sessions/session-screen.test.tsx packages/app/src/features/sessions/components/ports-panel.test.tsx
      Files: packages/app/src/features/sessions/components/session-details.tsx, packages/app/src/features/sessions/session-search.ts
- [x] Task 23: Delete's "Stops 1 server" line (AC-13); the server approval came with task 3
      Check: pnpm test packages/app/src/features/sessions/components/delete-session.test.tsx
      Files: packages/app/src/features/sessions/components/delete-session.tsx, packages/app/src/features/sessions/components/delete-session.test.tsx

## End to end and docs

- [ ] Task 24: The fake Claude answers the quick read (today's five steps unless the title asks for a run), plays `set_steps` and `start_server` with a real listening port; a new e2e file walks the run session and a change session at 360 and 1280 px, light and dark, with axe and no layout shift (AC-1, AC-2, AC-3, AC-4, AC-15, AC-24, AC-33, AC-34, AC-36)
      Check: pnpm exec playwright test e2e/adaptive-sessions.spec.ts
      Files: e2e/fake-claude/session.ts, e2e/adaptive-sessions.spec.ts
- [x] Task 25: The agent-runtime skill, `learn/sessions-and-worktrees.md` and a new `learn/adaptive-sessions.md` say how the quick read, steps, branches, servers and ports work; the design map has PortRow (task 18). The hand test on a real repository is left to the user: it makes worktrees in that repository (CLAUDE.md: stop and ask)
      Check: pnpm gate handbook-size specs
      Files: .claude/skills/agent-runtime/SKILL.md, learn/sessions-and-worktrees.md, learn/adaptive-sessions.md
- [ ] Task 26: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
