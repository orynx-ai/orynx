# Tasks: Connect Claude

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Add the Claude login contract: signed in (how, email, organisation), signed out or error, its two paths, and a test builder (AC-2, AC-3, AC-4, AC-6)
      Check: pnpm test packages/contracts; pnpm typecheck
      Files: packages/contracts/src/claude.ts, claude.test.ts, routes.ts, index.ts, testing.ts
- [x] Task 2: Add the short environment the agent's programs get: the allow list from the spec's Assumptions, and never a `DEVHUB_*` variable (AC-10)
      Check: pnpm test packages/core/src/agents
      Files: packages/core/src/agents/agent-environment.ts, agent-environment.test.ts
- [x] Task 3: Add `@anthropic-ai/claude-agent-sdk` at one exact version, and find the program in its platform package without running it. Name the SDK and its two peers in `docs/architecture.md`. `apps/server` lists it too, because its bundle keeps npm packages external and looks from there (Q2, Q8)
      Check: pnpm test packages/core/src/agents/claude; pnpm gate boundaries
      Files: packages/core/package.json, apps/server/package.json, pnpm-lock.yaml, packages/core/src/agents/claude/claude-code.ts, claude-code.test.ts, docs/architecture.md
- [x] Task 4: Run `auth status --json` with the short environment, a 10-second timeout and a small output limit, and read the answer with zod into a login or a problem (missing, failed with its exit code, unreadable, timeout). Add the fake program, which writes down its arguments and environment (AC-3, AC-6, AC-10, AC-12)
      Check: pnpm test packages/core/src/agents/claude
      Files: packages/core/src/agents/claude/claude-code.ts, claude-code.test.ts, map.ts, map.test.ts, packages/core/src/test/fake-claude.ts, packages/core/src/test/fake-claude/claude
- [x] Task 5: Let `createCheckedStatus` hold any answer, and add `checkNow()`, which shares a check that's already running. Jira and GitHub behave as before (AC-7, AC-9)
      Check: pnpm test packages/core/src/integrations
      Files: packages/core/src/integrations/checked-status.ts, checked-status.test.ts, jira/connection.ts, github/connection.ts
- [x] Task 6: Add Claude's login check: at most every 2 minutes, Check again at once, `status.changed` when the answer changes, and a log line with only the problem's kind and exit code (AC-5, AC-6, AC-9, AC-11)
      Check: pnpm test packages/core/src/agents/claude
      Files: packages/core/src/agents/claude/claude-login.ts, claude-login.test.ts
- [x] Task 7: Add `GET /api/claude/login` and `POST /api/claude/login/check`, take `claudeCode` in `createServer`, and answer the status line's `connected` from the same check. With no program, nothing starts and Claude is not connected (AC-1, AC-4, AC-5, AC-12)
      Check: pnpm test packages/core/src/routes/claude.test.ts packages/core/src/create-server.test.ts; pnpm typecheck
      Files: packages/core/src/routes/claude.ts, claude.test.ts, packages/core/src/create-server.ts, packages/core/src/status/status-service.ts, packages/core/src/index.ts
- [ ] Task 8: Prove no email, organisation or program output reaches the log at `LOG_LEVEL=trace` or the event stream, signed in, signed out and failing, and that `settings.json` and the keychain don't change (AC-11)
      Check: pnpm test packages/core/src/agents/claude/no-leaks.test.ts
      Files: packages/core/src/agents/claude/no-leaks.test.ts
- [ ] Task 9: Pass the SDK's program from `apps/server`, add `DEVHUB_CLAUDE_CODE` (an absolute path, empty for the SDK's own) to `config.ts` and `.env.example`, and point the e2e run at `e2e/fake-claude/claude`, which reads its answer from a file the test writes (AC-12, Q10)
      Check: pnpm test apps/server; pnpm gate env-policy
      Files: apps/server/src/config.ts, config.test.ts, main.ts, .env.example, playwright.config.ts, e2e/fake-claude/claude, e2e/fake-claude/answer.ts
- [ ] Task 10: Add `claudeLogin()`, `checkClaudeLogin()` and their query options to the api-client, refresh the login on `status.changed`, and give the app's tests a default "signed out" answer (AC-5)
      Check: pnpm test packages/api-client packages/app/src/live-updates.test.tsx
      Files: packages/api-client/src/endpoints/claude.ts, claude.test.ts, client.ts, queries.ts, index.ts, packages/app/src/live-updates.tsx, live-updates.test.tsx, packages/app/src/test/msw.ts
- [ ] Task 11: Add `Card` to `@devhub/ui` with plain, `selected` (2 px `info` border, no wash) and `placeholder` (dashed, `bg-sidebar`) looks, a story for each, a test and its design-map row (AC-14, AC-15, Q4)
      Check: pnpm test packages/ui/src/components/card.test.tsx; pnpm gate component-coverage style-policy; Storybook a11y
      Files: packages/ui/src/components/card.tsx, card.stories.tsx, card.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 12: Add `ClaudeCard`: skeletons while loading, Active with the account line for each way of signing in, Not signed in and Error with Check again, which says "Checking…", stays focused and starts one check (AC-2, AC-3, AC-4, AC-6, AC-7, AC-8, Q3, Q5, Q6)
      Check: pnpm test packages/app/src/features/settings/components/claude-card.test.tsx
      Files: packages/app/src/features/settings/components/claude-card.tsx, claude-card.test.tsx, packages/app/src/features/settings/queries.ts
- [ ] Task 13: Put the Claude card and "More agents" in a row above the permission modes, side by side when there's room and stacked at 360 px, and prove the tab's keyboard path to Check again (AC-13, AC-14, AC-15)
      Check: pnpm test packages/app/src/features/settings
      Files: packages/app/src/features/settings/components/coding-agent-panel.tsx, coding-agent-panel.test.tsx, packages/app/src/features/settings/settings-screen.test.tsx
- [ ] Task 14: e2e: the footer and the card signed out, sign in with the fake, then Check again turns this tab and a second tab to Active and connected with no reload. Keyboard path, and axe at 360 and 1280 px in light and dark (AC-1, AC-4, AC-5, AC-13, AC-14)
      Check: pnpm test:e2e e2e/coding-agent.spec.ts
      Files: e2e/coding-agent.spec.ts
- [ ] Task 15: Docs: move agent-runtime rule 6 to 011 (Q1), add a `learn/` page on how DevHub checks Claude, and bring the pages whose sources changed up to date
      Check: pnpm gate learn-freshness handbook-size
      Files: .claude/skills/agent-runtime/SKILL.md, learn/checking-claude.md, learn/tokens-and-keychain.md, learn/live-updates.md, learn/local-security.md
- [ ] Task 16: Open the Coding agent tab in a real browser (`pnpm dev`, own `DEVHUB_HOME`) at 360 and 1280 px, light and dark, in each state through `page.route`. Measure CLS while it loads, and tick each check in this file. Then ask the user to check their real login and the signed-out card (Q7)
      Check: screenshots in the scratchpad, CLS 0 for the Active answer, the user's word for Q7
      Files: specs/010-connect-claude/tasks.md
- [ ] Task 17: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
