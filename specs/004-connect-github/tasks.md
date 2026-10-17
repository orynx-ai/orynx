# Tasks: Connect GitHub

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: GitHub connection contracts: the request (`gh`, or `token` with an optional token), the saved method, the answer with `envToken` and `ghFound`, the path, a test builder (AC-9, AC-12, AC-14)
      Check: pnpm test packages/contracts; pnpm typecheck
      Files: packages/contracts/src/github.ts, packages/contracts/src/github.test.ts, packages/contracts/src/token.ts (the token rule, shared with Jira), packages/contracts/src/jira.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [x] Task 2: ChoiceGroup and ChoiceCard in `@devhub/ui`: a fieldset named by its legend, native radios, title and detail, help or an error tied to the group (AC-2, AC-18, AC-19)
      Check: pnpm test packages/ui; pnpm gate component-coverage; pnpm gate style-policy; pnpm gate boundaries
      Files: packages/ui/src/components/choice-group.tsx, packages/ui/src/components/choice-group.test.tsx, packages/ui/src/components/choice-group.stories.tsx, packages/ui/src/components/choice-card.tsx, packages/ui/src/components/choice-card.test.tsx, packages/ui/src/components/choice-card.stories.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 3: Settings › Appearance uses ChoiceGroup and ChoiceCard, with no visible change (Q4 d)
      Check: pnpm test packages/app/src/features/settings; pnpm gate style-policy
      Files: packages/app/src/features/settings/components/appearance-panel.tsx, packages/app/src/features/settings/components/appearance-panel.test.tsx
- [x] Task 4: gh runner: find gh on the search path without running it; `gh auth token --hostname github.com` within 5 s; missing, signed out, failed, too slow; a fake gh for tests (AC-4, AC-17, AC-20)
      Check: pnpm test packages/core/src/integrations/github; pnpm typecheck
      Files: packages/core/src/integrations/github/gh.ts, packages/core/src/integrations/github/gh.test.ts, packages/core/src/test/fake-gh.ts
- [x] Task 5: GitHub client over `@octokit/rest`: `GET /user` for the login and scopes, 10 s, every failure a fixed problem, nothing from octokit escapes; Q6 (c) messages by problem and way (AC-6, AC-7, AC-8, AC-17)
      Check: pnpm test packages/core/src/integrations/github; pnpm typecheck; pnpm gate boundaries
      Files: packages/core/src/integrations/github/client.ts, packages/core/src/integrations/github/client.test.ts, packages/core/src/integrations/github/problems.ts, packages/core/src/integrations/github/problems.test.ts, packages/core/src/test/fake-github.ts, packages/core/package.json, apps/server/package.json (the server bundles core but not npm packages), pnpm-lock.yaml (via pnpm add). `@octokit/rest` loads in about 0.2 s. A 429 with no reset time says "Try again in a minute.", which Q6 didn't word
- [x] Task 6: Move Jira's 2-minute shared status check into `integrations/checked-status.ts`, with no change in behaviour
      Check: pnpm test packages/core/src/integrations; pnpm typecheck
      Files: packages/core/src/integrations/checked-status.ts, packages/core/src/integrations/checked-status.test.ts, packages/core/src/integrations/jira/connection.ts
- [x] Task 7: GitHub connection service: connect checks then saves both ways, `repo` scope check, picking gh deletes a saved token, disconnect leaves gh alone, read never runs gh, `.env` token, `status.changed` (AC-3, AC-4, AC-5, AC-6, AC-7, AC-10, AC-12, AC-13, AC-14)
      Check: pnpm test packages/core/src/integrations/github packages/core/src/settings; pnpm typecheck
      Files: packages/core/src/integrations/github/connection.ts, packages/core/src/integrations/github/connection.test.ts, packages/core/src/integrations/connection-error.ts (the error both tools throw; JiraConnectionError extends it), packages/core/src/integrations/jira/connection.ts, packages/core/src/settings/settings-store.ts, packages/core/src/settings/settings-store.test.ts
- [x] Task 8: GitHub's status line: gh or the keychain only once a way is saved, the shared 2-minute check, names the account and follows a gh account switch (AC-1, AC-11)
      Check: pnpm test packages/core/src/integrations/github; pnpm typecheck
      Files: packages/core/src/integrations/github/connection.ts, packages/core/src/integrations/github/connection-status.test.ts
- [x] Task 9: Routes `GET`, `PUT` and `DELETE /api/github/connection`, error codes to HTTP, `createServer` takes `gh` (none by default), the status service uses GitHub's line (AC-1, AC-3, AC-9, AC-11, AC-16, AC-20)
      Check: pnpm test packages/core; pnpm typecheck
      Files: packages/core/src/routes/github.ts, packages/core/src/routes/github.test.ts, packages/core/src/routes/jira.ts, packages/core/src/status/status-service.ts, packages/core/src/create-server.ts, packages/core/src/index.ts, packages/core/src/test/fake-gh.ts and packages/core/src/test/fake-gh/gh (found while building: macOS checks each new program the first time it runs, one at a time, so a fresh fake gh per test timed out under a parallel run; each test folder now links to one shared script)
- [x] Task 10: Leak test at trace level: the gh token and a pasted token, and their `authorization` header, appear nowhere; gh's output is never logged (AC-17)
      Check: pnpm test packages/core; pnpm gate secrets
      Files: packages/core/src/integrations/github/no-token-leaks.test.ts
- [x] Task 11: Server host: gh's search path from the built-in `PATH`, the real gh runner in `main.ts`, and a fake signed-out gh first on PATH in Playwright's server (AC-20)
      Check: pnpm test apps/server; pnpm gate env-policy; pnpm build; pnpm exec playwright test e2e/smoke.spec.ts
      Files: apps/server/src/config.ts, apps/server/src/config.test.ts, apps/server/src/main.ts, playwright.config.ts, e2e/fake-gh/gh
- [x] Task 12: API client: GitHub connection get, save and delete, parsed with the contracts; query key (AC-3, AC-12, AC-13)
      Check: pnpm test packages/api-client; pnpm typecheck
      Files: packages/api-client/src/endpoints/github.ts, packages/api-client/src/github.test.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/index.ts
- [ ] Task 13: Move the Jira row's Connect, Manage and Close toggle, focus return and announcement into a shared row, with Jira's tests passing untouched
      Check: pnpm test packages/app/src/features/settings; pnpm gate component-coverage
      Files: packages/app/src/features/settings/components/managed-connection-row.tsx, packages/app/src/features/settings/components/managed-connection-row.test.tsx, packages/app/src/features/settings/components/jira-connection-row.tsx
- [ ] Task 14: The GitHub form: two choices (gh picked when found), the token field for the token way, errors placed by code and way, busy button, "GitHub is connected." (AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-15, AC-18)
      Check: pnpm test packages/app/src/features/settings; pnpm gate design-source; pnpm gate style-policy; pnpm lint
      Files: packages/app/src/features/settings/components/github-connection-form.tsx, packages/app/src/features/settings/components/github-connection-form.test.tsx, packages/app/src/features/settings/components/github-connection-row.tsx, packages/app/src/features/settings/components/github-connection-row.test.tsx, packages/app/src/features/settings/components/connections-panel.tsx, packages/app/src/features/settings/queries.ts, packages/app/src/features/settings/schemas.ts, packages/app/src/test/github.ts, packages/app/src/test/msw.ts
- [ ] Task 15: Manage fills the form in, the `.env` help, Disconnect with its two confirm lines, and a second tab follows (AC-12, AC-13, AC-14, AC-16)
      Check: pnpm test packages/app/src/features/settings; pnpm lint
      Files: packages/app/src/features/settings/components/github-connection-form.tsx, packages/app/src/features/settings/components/github-connection-form.test.tsx, packages/app/src/features/settings/queries.ts, packages/app/src/live-updates.tsx
- [ ] Task 16: e2e: the GitHub form at 360 and 1280 px in light and dark, axe, no layout shift, arrow keys and Cancel, token-way errors, and the fake signed-out gh (AC-2, AC-4, AC-18, AC-19, AC-20)
      Check: pnpm build; pnpm exec playwright test e2e/connect-github.spec.ts e2e/connect-jira.spec.ts; open Settings in `pnpm dev` at 360 and 1280 px, light and dark
      Files: e2e/connect-github.spec.ts
- [ ] Task 17: Docs: a `learn/` page on connecting GitHub; architecture, integration-adapter skill, design map, roadmap (Q1)
      Check: pnpm gate learn-freshness; pnpm gate handbook-size; pnpm format:check
      Files: learn/connecting-github.md, docs/architecture.md, .claude/skills/integration-adapter/SKILL.md, docs/product/roadmap.md, README.md
- [ ] Task 18: By hand (Q7): you connect your real GitHub in `pnpm dev`, the gh way; record what happened
      Check: the GitHub row says Connected and names your account
      Files: specs/004-connect-github/tasks.md
- [ ] Task 19: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
