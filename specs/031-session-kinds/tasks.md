# Tasks: Session kinds

One task is one commit. Test first, then code. Tick a task only when its Check passes. Per `/build`, a task runs its Check, one `pnpm typecheck` and the gates its change needs; `/review` runs `pnpm verify` and the e2e suite.

**Contracts and core**

- [x] Task 1: Session contract: `workOn`, `skipped`, a nullable `folder`, `kept` on the discarded step, with defaults that keep saved sessions as they were; builders (AC-23)
      Check: pnpm test packages/contracts/src/session.test.ts
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/contracts/src/testing.ts
- [x] Task 2: Progress: the steps Finished jumps over are skipped (Test, and Build with no edit), cleared by a follow-up; the service saves `skipped` with the step (AC-11, AC-12, AC-13)
      Check: pnpm test packages/core/src/sessions/progress.test.ts
      Files: packages/core/src/sessions/progress.ts, packages/core/src/sessions/progress.test.ts, packages/core/src/sessions/session-service.ts
- [x] Task 3: GitHub's pull request read: yours (author is the viewer), open, from a fork, its link and when it opened, in the same query; the fake answers them (AC-14, AC-19)
      Check: pnpm test packages/core/src/integrations/github/client.test.ts packages/core/src/sessions/context-reader.test.ts
      Files: packages/core/src/integrations/github/client.ts, packages/core/src/integrations/github/client.test.ts, packages/core/src/test/fake-github.ts, packages/core/src/sessions/context-reader.ts, packages/core/src/sessions/brief.ts
- [x] Task 4: Worktrees: a detached worktree from the PR's branch after fetching it, even while the main checkout has that branch; the last fetched copy when offline; nothing left when there is none (AC-14, AC-22)
      Check: pnpm test packages/core/src/sessions/worktrees.test.ts
      Files: packages/core/src/sessions/worktrees.ts, packages/core/src/sessions/worktrees.test.ts
- [x] Task 5: Push from a detached HEAD to the PR's branch, never forced; rejected when origin has moved (AC-16, AC-17)
      Check: pnpm test packages/core/src/sessions/branch-git.test.ts
      Files: packages/core/src/sessions/branch-git.ts, packages/core/src/sessions/branch-git.test.ts
- [x] Task 6: Which kind a composer start is: Ask, Build on a new branch, or Build on your PR (no ticket; first PR yours, open, not a fork, in the folder's origin) (AC-14, AC-19, AC-20)
      Check: pnpm test packages/core/src/sessions/compose.test.ts
      Files: packages/core/src/sessions/compose.ts, packages/core/src/sessions/compose.test.ts
- [x] Task 7: Claude's notes: an Ask with no folder answers from the brief alone; a session on your PR's branch is told so, and that Orynx pushes on your click (AC-3, AC-14)
      Check: pnpm test packages/core/src/sessions/brief.test.ts
      Files: packages/core/src/sessions/brief.ts, packages/core/src/sessions/brief.test.ts
- [x] Task 8: Ask with no folder: no repository on the record, Claude in an empty folder of its own, follow-ups there, reads outside it and the brief refused (AC-3, AC-4, AC-6, AC-7)
      Check: pnpm test packages/core/src/sessions/compose.test.ts packages/core/src/sessions/file-session-store.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-store.ts, packages/core/src/sessions/compose.test.ts
- [x] Task 9: Build on your PR, the start: `existing` for a live session on it, then linked from the start, source `PR #n`, `workOn: pull_request`, the worktree from its branch; GitHub unreachable starts nothing (AC-14, AC-18, AC-21, AC-22)
      Check: pnpm test packages/core/src/sessions/compose.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-store.ts, packages/contracts/src/session.ts, packages/core/src/sessions/compose.test.ts
- [x] Task 10: Build on your PR, the end: Push changes pushes HEAD to the PR's branch and reaches the last step; Discard deletes the worktree and keeps the branch (`kept`) (AC-15, AC-16, AC-17)
      Check: pnpm test packages/core/src/sessions/compose.test.ts packages/core/src/sessions/pull-requests.test.ts
      Files: packages/core/src/sessions/pull-requests.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/compose.test.ts

**UI**

- [x] Task 11: `Stepper` `skipped` state: a dash in an outlined circle, muted label, ", skipped" for screen readers; a story and a test; a design-map row (AC-11, AC-25)
      Check: pnpm test packages/ui/src/components/stepper.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/stepper.tsx, packages/ui/src/components/stepper.test.tsx, packages/ui/src/components/stepper.stories.tsx, docs/design-map.md

**App**

- [x] Task 12: The Ask / Build switch back in the composer, with tooltips, Build first and then your last pick; the heading and placeholder follow it (AC-1, AC-2)
      Check: pnpm test packages/app/src/features/home/components/home-composer.test.tsx packages/app/src/features/home/store.test.ts packages/app/src/features/home/home-screen.test.tsx
      Files: packages/app/src/features/home/components/home-composer.tsx, packages/app/src/features/home/composer-words.ts, packages/app/src/features/home/store.ts, packages/app/src/features/home/home-screen.tsx, and their tests
- [x] Task 13: "No folder" in Ask's folder picker, picked by default there; Send sends no folder (AC-2, AC-3, AC-5, AC-8)
      Check: pnpm test packages/app/src/features/home/components/folder-picker.test.tsx packages/app/src/features/home/composer-rules.test.ts packages/app/src/features/home/components/home-composer.test.tsx
      Files: packages/app/src/features/home/components/folder-picker.tsx, packages/app/src/features/home/composer-rules.ts, packages/app/src/features/home/composer-words.ts, packages/app/src/features/home/components/home-composer.tsx, and their tests
- [x] Task 14: The composer's line when your PR already has a session: "#2836 already has a session." with Open session (AC-18)
      Check: pnpm test packages/app/src/features/home/components/home-composer.test.tsx packages/app/src/features/home/composer-words.test.ts
      Files: packages/app/src/features/home/components/home-composer.tsx, packages/app/src/features/home/composer-words.ts, and their tests
- [x] Task 15: Session screen: the stepper's steps for each kind (Push on your PR) with skipped ones; header lines for an Ask with no folder and for your PR; the Discard step's words when the branch is kept; the folder problem line without a folder (AC-3, AC-5, AC-11, AC-14, AC-23)
      Check: pnpm test packages/app/src/features/sessions/session-screen.test.tsx packages/app/src/features/sessions/components/session-header.test.tsx packages/app/src/features/sessions/components/session-progress.test.tsx packages/app/src/features/sessions/step-words.test.ts
      Files: packages/app/src/features/sessions/components/session-progress.tsx, packages/app/src/features/sessions/components/session-header.tsx, packages/app/src/features/sessions/step-words.ts, packages/app/src/features/sessions/session-screen.tsx, and their tests

**E2e**

- [x] Task 16: e2e: Ask from the composer with no folder and with a folder; the switch with the keyboard; axe on each (AC-2, AC-3, AC-5, AC-25)
      Check: pnpm test:e2e e2e/composer.spec.ts
      Files: e2e/composer.spec.ts
- [x] Task 17: e2e: Build on my PR on the pull-requests hub: the PR's branch, Push changes to it, push rejected when origin moved, Discard keeps the branch (AC-14 to AC-17)
      Check: pnpm test:e2e e2e/pull-requests.spec.ts
      Files: e2e/pull-requests.spec.ts, e2e/fake-tools/config.ts, e2e/fake-tools/preload.ts
- [x] Task 18: e2e: a session the fake Claude finishes without a command shows Test skipped (AC-11)
      Check: pnpm test:e2e e2e/sessions.spec.ts
      Files: e2e/sessions.spec.ts

**Docs and the browser check**

- [ ] Task 19: Roadmap rows for 031 and 032 (020-fix-a-failing-check folded into 031); `learn/sessions-and-worktrees.md`; the agent-runtime skill's rule 1; `people-files.sh` for the product spec's "Agent sessions", for the user to run
      Check: pnpm gate specs; pnpm gate handbook-size
      Files: docs/product/roadmap.md, learn/sessions-and-worktrees.md, .claude/skills/agent-runtime/SKILL.md, specs/031-session-kinds/people-files.sh
- [ ] Task 20: Browser check: Home in Ask and Build, and the Session screen in each kind, at 360 and 1280 px in light and dark, with `/api` faked; fix what it finds (AC-24)
      Check: screenshots read in a real browser; any fix with its own test
      Files: whatever the check finds
- [ ] Task 21: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
