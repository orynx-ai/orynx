# Tasks: Set up Orynx the first time

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [ ] Task 1: Profile and setup schemas, routes and test builders (AC-4, AC-6)
      Check: pnpm test packages/contracts/src/profile.test.ts; pnpm typecheck
      Files: packages/contracts/src/profile.ts, profile.test.ts, routes.ts, errors.ts, index.ts, testing.ts
- [ ] Task 2: The password store: scrypt hash in a 0600 file, verify, cookie value (AC-5, AC-12)
      Check: pnpm test packages/core/src/setup
      Files: packages/core/src/setup/password-store.ts, password-store.test.ts, packages/core/src/index.ts
- [ ] Task 3: `/api/profile` and `/api/setup` in core (AC-3, AC-4, AC-6)
      Check: pnpm test packages/core/src/routes/setup.test.ts
      Files: packages/core/src/setup/profile-service.ts, routes/setup.ts, routes/setup.test.ts, create-server.ts, settings/settings-store.ts
- [ ] Task 4: The api-client calls and query options (AC-3, AC-6)
      Check: pnpm test packages/api-client/src/setup.test.ts
      Files: packages/api-client/src/endpoints/setup.ts, client.ts, queries.ts, index.ts, setup.test.ts
- [ ] Task 5: Edit profile, the profile menu and the footer use the server's profile (AC-6)
      Check: pnpm test packages/app/src/shell
      Files: packages/app/src/shell/profile-dialog.tsx, profile-menu.tsx, their tests, sidebar-footer.test.tsx, stores/profile-store.ts (deleted), test/setup.ts, test/msw.ts
- [ ] Task 6: The setup page, shown until Orynx is set up (AC-1, AC-2, AC-3, AC-13)
      Check: pnpm test packages/app/src/features/setup packages/app/src/shell/app-shell.test.tsx; pnpm gate design-source style-policy component-coverage; real browser at 360 and 1280 px, light and dark
      Files: packages/app/src/features/setup/setup-screen.tsx, setup-screen.test.tsx, shell/app-shell.tsx, shell/profile-fields.tsx
- [ ] Task 7: The front door asks for the password, slows guesses, and waits for setup (AC-7–AC-12)
      Check: pnpm test apps/server/src/lan.test.ts apps/server/src/config.test.ts
      Files: apps/server/src/lan.ts, lan.test.ts, main.ts, config.ts, .env.example
- [ ] Task 8: Every e2e hub starts set up
      Check: pnpm test:e2e e2e/settings.spec.ts
      Files: playwright.config.ts, e2e/fake-tools/config.ts
- [ ] Task 9: README installs from orynx-ai/orynx; install.sh, docs and rule 10 say password (AC-14)
      Check: bash -n install.sh; pnpm gates
      Files: README.md, install.sh, learn/local-security.md, docs/architecture.md, apps/landing/index.html, CLAUDE.md, AGENTS.md, .github/copilot-instructions.md, .cursor/rules/00-core.mdc
- [ ] Task 10: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
