# Tasks: Jira in sessions

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: A free JQL search in the Jira client, with Jira's own reason when it refuses the query (AC-7, AC-9, Q6)
      Check: pnpm test packages/core/src/integrations/jira/client.test.ts
      Files: packages/core/src/integrations/jira/client.ts, client.test.ts, packages/core/src/test/fake-jira.ts
- [x] Task 2: Comment (Markdown as ADF), transitions, transition and assign in the Jira client (AC-13 to AC-15, AC-18)
      Check: pnpm test packages/core/src/integrations/jira
      Files: packages/core/src/integrations/jira/client.ts, client.test.ts, markdown-adf.ts, markdown-adf.test.ts, packages/core/src/test/fake-jira.ts
- [x] Task 3: The `jira` step kind and its words (Q4, Q10, AC-12)
      Check: pnpm test packages/contracts/src/session.test.ts packages/app/src/features/sessions/step-words.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, session.test.ts, packages/app/src/features/sessions/step-words.ts, step-words.test.ts, components/session-progress.tsx
- [ ] Task 4: The read tools, offered at each run's start while Jira is connected (AC-1 to AC-10)
      Check: pnpm test packages/core/src/sessions/jira-tools.test.ts packages/core/src/sessions/compose.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/jira-tools.ts, jira-tools.test.ts, session-service.ts, compose.test.ts, session-service.test.ts
- [ ] Task 5: The `jiraChanges` preference and the row "Claude changes Jira" (Q8)
      Check: pnpm test packages/contracts/src/preferences.test.ts packages/core/src/preferences packages/app/src/features/settings
      Files: packages/contracts/src/preferences.ts, testing.ts, packages/core/src/preferences/preferences-service.ts, packages/app/src/features/settings/queries.ts, components/jira-changes.tsx, jira-changes.test.tsx, coding-agent-panel.tsx
- [ ] Task 6: The `jira` approval kind, a refusal without asking, and its callout words (AC-13, AC-14, AC-15, Q10)
      Check: pnpm test packages/core/src/agents/claude/claude-adapter.test.ts packages/app/src/features/sessions; pnpm typecheck
      Files: packages/contracts/src/session.ts, notifications.ts, packages/core/src/agents/agent-adapter.ts, claude/claude-adapter.ts, sessions/session-store.ts, progress.ts, session-service.ts, notifications/session-notifications.ts, packages/app/src/features/sessions/approval-words.ts, components/approval-callout.tsx, step-words.ts, packages/app/src/features/notifications/words.ts, packages/app/src/features/home/composer-words.ts
- [ ] Task 7: The write tools: Allow posts, Deny and Stop send nothing, the row skips asking, Always allow turns it on (AC-13 to AC-18, Q9, Q11)
      Check: pnpm test packages/core/src/sessions/jira-tools.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/jira-tools.ts, session-service.ts, jira-tools.test.ts, session-service.test.ts
- [ ] Task 8: No leaks from any Jira call (AC-11, AC-19)
      Check: pnpm test packages/core/src/sessions/no-leaks.test.ts
      Files: packages/core/src/sessions/no-leaks.test.ts, packages/core/src/test/fake-claude-sdk.ts
- [ ] Task 9: Docs and skills
      Check: pnpm gate handbook-size; pnpm gate learn-freshness
      Files: docs/architecture.md, .claude/skills/agent-runtime/SKILL.md, .claude/skills/integration-adapter/SKILL.md, learn/sessions-and-worktrees.md, learn/connecting-jira.md
- [ ] Task 10: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
