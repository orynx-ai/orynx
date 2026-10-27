# Tasks: Review replies, five fixes, and faster tests

One task is one commit. Test first, then code. Tick a task only when its Check passes.

**C. Test speed (local)**

- [x] Task 1: The two flaky session-service tests wait on the fake clock and the event they need, not real time (part C)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts, 5 runs in a row
      Files: packages/core/src/sessions/session-service.test.ts
- [x] Task 2: The app's unit tests share one module graph per worker (AC-21)
      Check: pnpm exec vitest run packages/app/ --sequence.shuffle, 3 runs with new seeds, all pass and each under half of 118.7 s
      Files: packages/app/vitest.config.ts, packages/app/src/test/setup.ts (only if a leak shows)
- [x] Task 3: The same trial for ui and core, kept only where it passes and saves time (part C)
      Check: pnpm exec vitest run packages/ui/ --sequence.shuffle and packages/core/, 3 runs each
      Files: packages/ui/vitest.config.ts, packages/core/vitest.config.ts

**B. Five fixes**

- [x] Task 4: Markdown → ADF: links (http, https, mailto only), italics and quotes (AC-13)
      Check: pnpm test packages/core/src/integrations/jira/markdown-adf.test.ts
      Files: packages/core/src/integrations/jira/markdown-adf.ts, markdown-adf.test.ts
- [x] Task 5: Markdown → ADF: pipe tables with a header row, and nested lists (AC-13)
      Check: pnpm test packages/core/src/integrations/jira/markdown-adf.test.ts
      Files: packages/core/src/integrations/jira/markdown-adf.ts, markdown-adf.test.ts
- [x] Task 6: search_jira answers with `next` and reads the page after it (AC-17)
      Check: pnpm test packages/core/src/integrations/jira/client.test.ts packages/core/src/sessions/jira-tools.test.ts
      Files: packages/core/src/integrations/jira/client.ts, packages/core/src/sessions/jira-tools.ts, their tests
- [x] Task 7: The command log keeps the last 200 commands and counts the ones it dropped (AC-14, AC-15)
      Check: pnpm test packages/core/src/sessions/command-log.test.ts packages/contracts/src/terminal.test.ts
      Files: packages/contracts/src/terminal.ts, packages/core/src/sessions/command-log.ts, where the log is saved and served, their tests
- [x] Task 8: The Claude tab says how many earlier commands aren't shown (AC-14, AC-15)
      Check: pnpm test packages/app/src/features/sessions/components/terminal/
      Files: packages/app/src/features/sessions/components/terminal/claude-tab.tsx, its test, terminal-words.ts
- [x] Task 9: A Build's turn end records whether the worktree changed, and "ready for" reads it (AC-10, AC-11, AC-12)
      Check: pnpm test packages/contracts/src/session.test.ts packages/core/src/sessions/session-store.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/contracts/src/session.ts, packages/core/src/sessions/session-store.ts, session-service.ts, their tests
- [x] Task 10: The repository list says when a saved folder is gone (AC-16)
      Check: pnpm test packages/contracts/src/repositories.test.ts packages/core/src/repositories/ packages/core/src/routes/repositories.test.ts
      Files: packages/contracts/src/repositories.ts, packages/contracts/src/testing.ts, packages/core/src/repositories/repository-service.ts, their tests
- [x] Task 11: Settings › Repositories shows Folder not found on that row (AC-16, AC-20)
      Check: pnpm test packages/app/src/features/settings/components/repository-row.test.tsx packages/app/src/features/settings/components/repositories-panel.test.tsx
      Files: packages/app/src/features/settings/components/repository-row.tsx, its test

**A. Reply to reviewers**

- [x] Task 12: Contracts for the review threads draft and the replies (AC-2 to AC-7)
      Check: pnpm test packages/contracts/src/pull-requests.test.ts; pnpm typecheck
      Files: packages/contracts/src/pull-requests.ts, routes.ts, testing.ts, index.ts
- [x] Task 13: The GitHub client reads a PR's unresolved threads with their ids, replies to one, and resolves one (AC-2, AC-3, AC-5, AC-6)
      Check: pnpm test packages/core/src/integrations/github/client.test.ts
      Files: packages/core/src/integrations/github/client.ts, client.test.ts, packages/core/src/test/fake-github.ts
- [ ] Task 14: The replies service: Claude drafts one reply per thread it addressed, from the threads and the session's diff (AC-2, AC-4)
      Check: pnpm test packages/core/src/sessions/review-replies.test.ts
      Files: packages/core/src/sessions/review-replies.ts, review-replies.test.ts
- [ ] Task 15: Post replies, one thread at a time, only from its route; threads that posted drop out (AC-3, AC-5, AC-8)
      Check: pnpm test packages/core/src/sessions/review-replies.test.ts packages/core/src/routes/sessions.test.ts
      Files: packages/core/src/sessions/review-replies.ts, session-service.ts, packages/core/src/routes/sessions.ts, their tests
- [ ] Task 16: api-client: draftReplies and postReplies (AC-2, AC-3)
      Check: pnpm test packages/api-client/src/endpoints/sessions.test.ts
      Files: packages/api-client/src/endpoints/sessions.ts, client.ts, their tests
- [ ] Task 17: The Reply to reviewers dialog: skeleton, error with Try again, none waiting, and Claude's drafts (AC-2, AC-4, AC-6, AC-7)
      Check: pnpm test packages/app/src/features/sessions/components/reply-to-reviewers.test.tsx
      Files: packages/app/src/features/sessions/components/reply-to-reviewers.tsx, its test, ../queries.ts, ../schemas.ts, ../pull-request-words.ts
- [ ] Task 18: Post replies, failures kept in the list, and the button in the page bar and More actions (AC-1, AC-3, AC-5, AC-9)
      Check: pnpm test packages/app/src/features/sessions/components/reply-to-reviewers.test.tsx packages/app/src/features/sessions/components/session-header.test.tsx
      Files: packages/app/src/features/sessions/components/reply-to-reviewers.tsx, session-header.tsx, their tests
- [ ] Task 19: e2e: Reply to reviewers on the pull requests hub posts only on the click, and has no axe violations at 1280 and 360 px in both themes (AC-3, AC-8, AC-20)
      Check: pnpm exec playwright test e2e/pull-requests.spec.ts
      Files: e2e/pull-requests.spec.ts, e2e/fake-tools/preload.ts
- [ ] Task 20: Docs: GitHub's writes in the integration-adapter skill, and review replies in learn/connecting-github.md (part A)
      Check: pnpm gate learn-freshness; pnpm gate handbook-size
      Files: .claude/skills/integration-adapter/SKILL.md, learn/connecting-github.md

**C. CI**

- [ ] Task 21: The app's unit tests run as 2 shards, and the merge job checks every shard's report (AC-18, AC-19)
      Check: both shards run locally into blobs, then pnpm exec vitest --merge-reports --coverage passes; pnpm format:check
      Files: .github/workflows/ci.yml
- [ ] Task 22: The e2e run splits into 3 shards with one merged report, and Chromium is cached (AC-18)
      Check: pnpm exec playwright test --shard=1/3 --list lists a third of the tests; pnpm format:check
      Files: .github/workflows/ci.yml, playwright.config.ts
- [ ] Task 23: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
