# Tasks: Connect Jira

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Add the `integration_rejected` and `integration_unreachable` error codes (AC-4, AC-5)
      Check: pnpm test packages/contracts packages/api-client; pnpm typecheck
      Files: packages/contracts/src/errors.ts, packages/contracts/src/errors.test.ts
- [x] Task 2: Jira connection contracts: site rule (atlassian.net only, forgiving input), request with optional token, response with `envToken`, paths, test builder (AC-7, AC-10, AC-12)
      Check: pnpm test packages/contracts; pnpm typecheck
      Files: packages/contracts/src/jira.ts, packages/contracts/src/jira.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [x] Task 3: Button `pending`: disabled, spinner before the label (motion-safe), same width (AC-13)
      Check: pnpm test packages/ui/src/components/button.test.tsx; pnpm gate component-coverage; pnpm gate style-policy
      Files: packages/ui/src/components/button.tsx, packages/ui/src/components/button.test.tsx, packages/ui/src/components/button.stories.tsx
- [x] Task 4: Input and Field in `@devhub/ui`: 40 px, label, help, error state wired with `aria-invalid` and `aria-describedby` (AC-2, AC-7, AC-16, AC-17)
      Check: pnpm test packages/ui; pnpm gate component-coverage; pnpm gate style-policy; pnpm gate boundaries
      Files: packages/ui/src/components/input.tsx, packages/ui/src/components/input.test.tsx, packages/ui/src/components/input.stories.tsx, packages/ui/src/components/field.tsx, packages/ui/src/components/field.test.tsx, packages/ui/src/components/field.stories.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 5: Settings file store: `<DEVHUB_HOME>/settings.json`, mode 600, atomic writes in one queue, and an in-memory store for tests (AC-3). `createServer` takes it in task 9, where the routes first use it
      Check: pnpm test packages/core/src/settings; pnpm typecheck
      Files: packages/core/src/settings/settings-store.ts, packages/core/src/settings/settings-store.test.ts, packages/core/src/index.ts
- [x] Task 6: Jira client over jira.js: check email and token with `/myself`, 10 s timeout, every failure becomes a fixed outcome, nothing from jira.js's errors escapes (AC-4, AC-5, AC-6, AC-15)
      Check: pnpm test packages/core/src/integrations/jira; pnpm typecheck; pnpm gate boundaries
      Files: packages/core/src/integrations/jira/client.ts, packages/core/src/integrations/jira/client.test.ts, packages/core/src/integrations/jira/problems.ts, packages/core/src/integrations/jira/problems.test.ts, packages/core/src/test/fake-jira.ts, packages/core/package.json, apps/server/package.json, pnpm-lock.yaml (via pnpm add)
- [x] Task 7: Jira connection service: connect checks then saves, disconnect removes all three, read never touches the keychain, `.env` token, `status.changed` (AC-3, AC-4, AC-8, AC-10, AC-11, AC-12)
      Check: pnpm test packages/core/src/integrations/jira; pnpm typecheck
      Files: packages/core/src/integrations/jira/connection.ts, packages/core/src/integrations/jira/connection.test.ts
- [x] Task 8: Jira's status line: keychain read only once a site and email are saved, a check at most every 2 minutes, shared in-flight check, last result while re-checking (AC-1, AC-9)
      Check: pnpm test packages/core/src/integrations/jira; pnpm typecheck
      Files: packages/core/src/integrations/jira/connection.ts, packages/core/src/integrations/jira/connection-status.test.ts
- [x] Task 9: Routes `GET`, `PUT` and `DELETE /api/jira/connection`, error codes to HTTP, `createServer` takes the settings store, and the status service uses Jira's line (AC-3, AC-7, AC-8, AC-11, AC-14)
      Check: pnpm test packages/core; pnpm typecheck
      Files: packages/core/src/routes/jira.ts, packages/core/src/routes/jira.test.ts, packages/core/src/status/status-service.ts, packages/core/src/create-server.ts, packages/core/src/create-server.test.ts
- [x] Task 10: Pino redacts `authorization` headers; leak test at trace level for the token and its base64 Basic value (AC-15)
      Check: pnpm test packages/core; pnpm gate secrets
      Files: packages/core/src/create-server.ts, packages/core/src/integrations/jira/no-token-leaks.test.ts
- [x] Task 11: Server host: `DEVHUB_KEYCHAIN=os|memory`, the settings file under `DEVHUB_HOME`, the OS's certificates trusted at start (as `--use-system-ca` does), e2e uses the memory keychain (AC-18)
      Check: pnpm test apps/server; pnpm gate env-policy; pnpm build; pnpm exec playwright test e2e/smoke.spec.ts
      Files: apps/server/src/config.ts, apps/server/src/config.test.ts, apps/server/src/main.ts, apps/server/src/system-certificates.ts, apps/server/src/system-certificates.test.ts, packages/core/src/index.ts, .env.example, playwright.config.ts, turbo.json
- [x] Task 12: API client: Jira connection get, save and delete, parsed with the contracts; query key (AC-3, AC-10, AC-11). Task 14 makes `status.changed` refresh it, where a test can see it
      Check: pnpm test packages/api-client; pnpm typecheck
      Files: packages/api-client/src/endpoints/jira.ts, packages/api-client/src/jira.test.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/index.ts
- [ ] Task 13: The Connect form in the Jira row: Connect and Close, fields, client errors, server errors on the right field, busy button, "Jira is connected." (AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-13, AC-16)
      Check: pnpm test packages/app/src/features/settings; pnpm gate design-source; pnpm gate style-policy; pnpm lint
      Files: packages/app/src/features/settings/components/jira-connection-form.tsx, packages/app/src/features/settings/components/jira-connection-form.test.tsx, packages/app/src/features/settings/components/connections-panel.tsx, packages/app/src/features/settings/components/connections-panel.test.tsx, packages/app/src/features/settings/queries.ts, packages/app/src/test/msw.ts
- [ ] Task 14: Manage, the `.env` help, and Disconnect with its confirm step; a second tab follows (AC-10, AC-11, AC-12, AC-14)
      Check: pnpm test packages/app/src/features/settings; pnpm gate style-policy; pnpm lint
      Files: packages/app/src/features/settings/components/jira-connection-form.tsx, packages/app/src/features/settings/components/jira-connection-form.test.tsx, packages/app/src/features/settings/components/connections-panel.tsx, packages/app/src/features/settings/queries.ts, packages/app/src/live-updates.tsx
- [ ] Task 15: e2e: the form at 360 and 1280 px in light and dark, client errors, Cancel returns focus, no layout shift, memory keychain (AC-2, AC-7, AC-16, AC-17, AC-18)
      Check: pnpm build; pnpm exec playwright test e2e/connect-jira.spec.ts; open Settings in `pnpm dev` at 360 and 1280 px, light and dark
      Files: e2e/connect-jira.spec.ts
- [ ] Task 16: Docs: a `learn/` page on connecting Jira; architecture, integration-adapter and forms skills, roadmap (Q1)
      Check: pnpm gate learn-freshness; pnpm gate handbook-size; pnpm format:check
      Files: learn/connecting-jira.md, docs/architecture.md, docs/product/roadmap.md, .claude/skills/integration-adapter/SKILL.md, .claude/skills/forms/SKILL.md, README.md
- [ ] Task 17: By hand, after your yes (Q6): you connect your real Jira in `pnpm dev`, and I run `pnpm test:keychain` once; record what happened
      Check: the Jira row says Connected for your site; `pnpm test:keychain` passes
      Files: specs/003-connect-jira/tasks.md
- [ ] Task 18: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
