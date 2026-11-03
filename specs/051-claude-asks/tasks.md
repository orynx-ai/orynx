# Tasks: Claude asks: a question in the session, answered there

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: The `question` approval kind, the `answered` step and the answer in the request, with their words wherever the unions are switched on (AC-1, AC-2, AC-7, AC-23, Q3)
      Check: pnpm test packages/contracts/src/session.test.ts packages/contracts/src/notifications.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, session.test.ts, notifications.ts, testing.ts, packages/core/src/agents/agent-adapter.ts, packages/core/src/sessions/session-store.ts, packages/app/src/features/sessions/approval-words.ts, step-words.ts, packages/app/src/features/home/composer-words.ts, packages/app/src/features/notifications/words.ts
- [x] Task 2: `AskUserQuestion` in every session's tools: a valid call asks as a `question`, a malformed one is refused with no step, in every mode and in Ask sessions (AC-17, AC-18, AC-19)
      Check: pnpm test packages/core/src/agents/claude/tool-decision.test.ts
      Files: packages/core/src/agents/claude/tool-decision.ts, tool-decision.test.ts
- [x] Task 3: The adapter answers a question: `answers` in `updatedInput`, Skip's line, the `answered` and skipped steps, and Stop interrupting (AC-2 to AC-5, AC-7, AC-8)
      Check: pnpm test packages/core/src/agents/claude/claude-adapter.test.ts
      Files: packages/core/src/agents/agent-adapter.ts, claude/claude-adapter.ts, claude-adapter.test.ts, packages/core/src/test/fake-claude-sdk.ts
- [x] Task 4: The route and the service check an answer against the waiting question (400 `bad_answer`); the first answer counts; the steps and the log (AC-2 to AC-5, AC-9, AC-10)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/routes/sessions.test.ts packages/core/src/sessions/progress.test.ts
      Files: packages/core/src/sessions/session-service.ts, progress.ts, packages/core/src/routes/sessions.ts, their tests, packages/contracts/src/errors.ts
- [ ] Task 5: The brief's new line, and the question's notification without its text on the desktop (AC-13, AC-24, Q5)
      Check: pnpm test packages/core/src/sessions/brief.test.ts packages/core/src/notifications
      Files: packages/core/src/sessions/brief.ts, brief.test.ts, packages/core/src/notifications/session-notifications.ts, its test
- [ ] Task 6: `postApproval` sends the answers (AC-2)
      Check: pnpm test packages/api-client/src/sessions.test.ts
      Files: packages/api-client/src/endpoints/sessions.ts, packages/api-client/src/sessions.test.ts, packages/api-client/src/client.ts, packages/app/src/features/sessions/queries.ts
- [ ] Task 7: `ChoiceCard` with `multiple`: a checkbox in the same card, with a story for each state and a test (Q2)
      Check: pnpm test packages/ui/src/components/choice-card.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/choice-card.tsx, choice-card.stories.tsx, choice-card.test.tsx
- [ ] Task 8: The question form in the callout: a group per question, Other with its box, Send answer, and errors that say what to do (AC-1, AC-3 to AC-6, AC-11, AC-20, AC-21)
      Check: pnpm test packages/app/src/features/sessions/components/question-form.test.tsx packages/app/src/features/sessions/components/approval-callout.test.tsx; pnpm gate design-source
      Files: packages/app/src/features/sessions/components/question-form.tsx, question-form.test.tsx, approval-callout.tsx, approval-callout.test.tsx, schemas.ts, approval-words.ts, session-screen.tsx (Design note)
- [ ] Task 9: Skip, a failed send, another tab answering first, focus, and the pinned bar (AC-7, AC-9, AC-10, AC-14, AC-15, AC-16)
      Check: pnpm test packages/app/src/features/sessions/components/approval-callout.test.tsx packages/app/src/features/sessions/components/question-form.test.tsx
      Files: packages/app/src/features/sessions/components/approval-callout.tsx, question-form.tsx, their tests
- [ ] Task 10: The words around a question: the pill, the steps, Home's banner, the bell, and Settings › Notifications' row (AC-1, AC-2, AC-7, AC-12, AC-13, Q6)
      Check: pnpm test packages/app/src/features/sessions packages/app/src/features/home/components/waiting-banner.test.tsx packages/app/src/features/notifications packages/app/src/features/settings/components/notifications-panel.test.tsx
      Files: packages/app/src/features/sessions/components/session-header.tsx, step-words.ts, packages/app/src/features/home/components/waiting-banner.tsx, composer-words.ts, packages/app/src/features/notifications/words.ts, packages/app/src/features/settings/components/notifications-panel.tsx, their tests
- [ ] Task 11: e2e: the fake Claude Code asks with "(asks)"; answer, Other, Skip, and both themes with no axe violations (AC-2, AC-3, AC-7, AC-22)
      Check: pnpm test:e2e e2e/questions.spec.ts
      Files: e2e/fake-claude/session.ts, e2e/questions.spec.ts
- [ ] Task 12: Docs: questions in the sessions guide and the agent-runtime skill
      Check: pnpm gate learn-freshness; pnpm gate handbook-size
      Files: learn/sessions-and-worktrees.md, .claude/skills/agent-runtime/SKILL.md
- [ ] Task 13: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
