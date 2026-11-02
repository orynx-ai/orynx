# Tasks: Trace steps

One task is one commit. Test first, then code. Tick a task only when its Check passes.

Before Task 1: the user applies the design-system patch (Q1a) and it's committed as `docs(046): …`.

- [x] Task 1: Contracts: each command's result on the command step, each to-do's status on the plan step, both optional (AC-12, AC-14, AC-16)
      Check: pnpm test packages/contracts/src/session.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts
- [ ] Task 2: Core: keep each to-do's status from `TodoWrite` on the plan step, re-planned in place (AC-16, AC-17)
      Check: pnpm test packages/core/src/agents/claude/sdk-messages.test.ts packages/core/src/sessions/progress.test.ts
      Files: packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/sdk-messages.ts, packages/core/src/agents/claude/sdk-messages.test.ts, packages/core/src/sessions/progress.ts, packages/core/src/sessions/progress.test.ts
- [ ] Task 3: Core: the command step keeps each call's id, and `command_ended` marks it failed or not (AC-12, AC-13)
      Check: pnpm test packages/core/src/sessions/progress.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/progress.ts, packages/core/src/sessions/progress.test.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts
- [ ] Task 4: UI: `ActivityStep`'s running shimmer (off under reduced motion) and its failed state (AC-1, AC-2, AC-3, AC-4, AC-15, AC-21)
      Check: pnpm test packages/ui/src/components/activity-step.test.tsx; pnpm gate style-policy component-coverage
      Files: packages/ui/src/styles/theme.css, packages/ui/src/components/activity-step.tsx, packages/ui/src/components/activity-step.stories.tsx, packages/ui/src/components/activity-step.test.tsx
- [ ] Task 5: UI: `ActivityStep` opens in place: the title is the button, with a chevron, `aria-expanded`, and details under the title (AC-5, AC-9, AC-10, AC-19, AC-22, AC-23)
      Check: pnpm test packages/ui/src/components/activity-step.test.tsx; pnpm gate component-coverage icon-buttons
      Files: packages/ui/src/components/activity-step.tsx, packages/ui/src/components/activity-step.stories.tsx, packages/ui/src/components/activity-step.test.tsx
- [ ] Task 6: UI: Claude's to-do list, with a tick for done, a shimmer for in progress and an outlined dot for to come (AC-16, AC-21, AC-23)
      Check: pnpm test packages/ui/src/components/activity-step.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/activity-step.tsx, packages/ui/src/components/activity-step.stories.tsx, packages/ui/src/components/activity-step.test.tsx, packages/ui/src/index.ts
- [ ] Task 7: App: steps open in place with what the dialog showed, the `StepDetails` dialog goes, and Finished stops opening (AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-18, AC-19)
      Check: pnpm test packages/app/src/features/sessions/components/step-details.test.tsx packages/app/src/features/sessions/components/session-progress.test.tsx
      Files: packages/app/src/features/sessions/components/step-details.tsx, packages/app/src/features/sessions/components/step-details.test.tsx, packages/app/src/features/sessions/components/session-progress.tsx, packages/app/src/features/sessions/components/session-progress.test.tsx
- [ ] Task 8: App: the running step shimmers, a failed command step is red with its words, and its commands and Claude's to-dos have their marks (AC-1, AC-3, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17)
      Check: pnpm test packages/app/src/features/sessions/step-words.test.ts packages/app/src/features/sessions/components/session-progress.test.tsx packages/app/src/features/sessions/components/step-details.test.tsx
      Files: packages/app/src/features/sessions/step-words.ts, packages/app/src/features/sessions/step-words.test.ts, packages/app/src/features/sessions/components/session-progress.tsx, packages/app/src/features/sessions/components/step-details.tsx, their tests
- [ ] Task 9: e2e: open Edited 1 file in place on the Session screen, its file opens Changes, and axe finds nothing (AC-5, AC-6, AC-19, AC-20)
      Check: pnpm exec playwright test e2e/sessions.spec.ts
      Files: e2e/sessions.spec.ts
- [ ] Task 10: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
