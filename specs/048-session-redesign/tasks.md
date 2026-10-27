# Tasks: Session page redesign

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Add the mockup as the session design, and write the Stepper-beside-the-title, DiffView wrap and session-panes notes (Q3, Q4, Q5, Q6)
      Check: pnpm exec prettier --check docs/design/design-system.md .claude/skills/clean-ui/SKILL.md; the screenshot opens
      Files: docs/design/screens/session-review.html, docs/design/screens/session-review-light.png, docs/design/design-system.md, .claude/skills/clean-ui/SKILL.md
- [x] Task 2: An activity's optional `at` and `step`, and a changed file's `created` (default false), with factories (AC-15, AC-21)
      Check: pnpm test packages/contracts/src/session.test.ts packages/contracts/src/changes.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/changes.ts, packages/contracts/src/testing.ts, packages/contracts/src/session.test.ts, packages/contracts/src/changes.test.ts
- [x] Task 3: Stamp each new activity with the session's step and the time in `change()`, keeping the stamp when a step is rebuilt (AC-10, AC-14, AC-15)
      Check: pnpm test packages/core/src/sessions/progress.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/progress.ts, packages/core/src/sessions/progress.test.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts
- [x] Task 4: Mark the files git calls added as `created` (AC-21)
      Check: pnpm test packages/core/src/sessions/changes.test.ts
      Files: packages/core/src/sessions/changes.ts, packages/core/src/sessions/changes.test.ts
- [x] Task 5: `ActivityGroup` in @devhub/ui: a step's row (dot, words, summary, time, chevron) that opens its rows in place (AC-11, AC-14)
      Check: pnpm test packages/ui/src/components/activity-step.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/activity-step.tsx, packages/ui/src/components/activity-step.stories.tsx, packages/ui/src/components/activity-step.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 6: `CommandLine` in @devhub/ui: a command on one line, cut, that shows in full on a press (AC-13)
      Check: pnpm test packages/ui/src/components/command-line.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/command-line.tsx, packages/ui/src/components/command-line.stories.tsx, packages/ui/src/components/command-line.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 7: `DiffView` gets `wrap` and header `actions`, with the folder muted before the name (AC-19, AC-21)
      Check: pnpm test packages/ui/src/components/diff-view.test.tsx
      Files: packages/ui/src/components/diff-view.tsx, packages/ui/src/components/diff-view.stories.tsx, packages/ui/src/components/diff-view.test.tsx
- [x] Task 8: `FileList` rows on two lines: the name, then the folder and the counts (AC-18)
      Check: pnpm test packages/ui/src/components/file-list.test.tsx
      Files: packages/ui/src/components/file-list.tsx, packages/ui/src/components/file-list.stories.tsx, packages/ui/src/components/file-list.test.tsx
- [x] Task 9: The diff's browser-only state: Wrap lines (on by default, every session) and Viewed (per session and file, cleared when its counts change) (AC-20, AC-22)
      Check: pnpm test packages/app/src/features/sessions/store.test.ts
      Files: packages/app/src/features/sessions/store.ts, packages/app/src/features/sessions/store.test.ts
- [ ] Task 10: The Changes tab: the file column beside the diff from 1024 px, the totals and Wrap lines in the tab row, Viewed and New file in the diff's header, and the tabs as Changes, Ports, Context (AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-25)
      Check: pnpm test packages/app/src/features/sessions/components/changes-panel.test.tsx packages/app/src/features/sessions/components/session-details.test.tsx
      Files: packages/app/src/features/sessions/components/changes-panel.tsx, packages/app/src/features/sessions/components/session-details.tsx, packages/app/src/features/sessions/change-words.ts, their tests, e2e/changes.spec.ts
- [ ] Task 11: Group the activities by step, with each group's summary and time in words ("< 1 min", "18 min", "1 h 5 min"), flat when any activity has no step (AC-10, AC-15, Q8)
      Check: pnpm test packages/app/src/features/sessions/activity-groups.test.ts
      Files: packages/app/src/features/sessions/activity-groups.ts, packages/app/src/features/sessions/activity-groups.test.ts
- [ ] Task 12: What Claude did: the rename, the groups (the current one open), Expand all / Collapse all, commands as `CommandLine`, the approval in the current group and the summary after the groups (AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16)
      Check: pnpm test packages/app/src/features/sessions/components/session-progress.test.tsx packages/app/src/features/sessions/session-screen.test.tsx
      Files: packages/app/src/features/sessions/components/session-progress.tsx, packages/app/src/features/sessions/step-words.ts, their tests, e2e/approvals.spec.ts, e2e/changes.spec.ts, e2e/composer.spec.ts, e2e/pull-requests.spec.ts, e2e/sessions.spec.ts
- [ ] Task 13: The title row: the meta line (state, skills, folder, branch with Copy branch name, own worktree, started …) and the stepper beside the title; "Started" leaves the page bar (AC-6, AC-7, AC-9)
      Check: pnpm test packages/app/src/features/sessions/components/session-header.test.tsx packages/app/src/features/sessions/session-screen.test.tsx
      Files: packages/app/src/features/sessions/components/session-header.tsx, packages/app/src/features/sessions/session-screen.tsx, their tests
- [ ] Task 14: The next-move bar (Ready to push, Ready for a pull request, Pushed), opening today's dialogs, and Terminal in the page bar from 768 px (AC-1, AC-2, AC-3, AC-4, AC-5, AC-8)
      Check: pnpm test packages/app/src/features/sessions/components/next-move.test.tsx packages/app/src/features/sessions/components/session-header.test.tsx
      Files: packages/app/src/features/sessions/components/next-move.tsx, packages/app/src/features/sessions/components/next-move.test.tsx, packages/app/src/features/sessions/components/session-header.tsx, packages/app/src/features/sessions/pull-request-words.ts, packages/app/src/features/sessions/session-screen.tsx, e2e/pull-requests.spec.ts, e2e/terminal.spec.ts
- [ ] Task 15: The layout from 1024 px: the page the window's height, each pane scrolling on its own, the follow-up box at the left foot, Claude's progress followed inside its pane, the skeleton in the new shape, and the `Design:` note (AC-17, AC-24, AC-25, AC-26)
      Check: pnpm test packages/app/src/features/sessions/session-screen.test.tsx; pnpm gate design-source; pnpm test:e2e e2e/session-layout.spec.ts
      Files: packages/app/src/features/sessions/session-screen.tsx, packages/app/src/features/sessions/components/session-progress.tsx, packages/app/src/features/sessions/session-screen.test.tsx, e2e/session-layout.spec.ts, learn/sessions-and-worktrees.md, README.md
- [ ] Task 16: Open the page in a real browser at 360, 768, 1280 and 1440 px, light and dark, for a ready-to-push, a working and a stopped session; fix what's off (AC-27)
      Check: no sideways scroll, no layout shift while it loads, and Storybook a11y clean for the new stories (pnpm storybook)
      Files: whatever the look-over changes
- [ ] Task 17: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
