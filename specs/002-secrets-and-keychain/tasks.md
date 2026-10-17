# Tasks: Secrets and keychain

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Add the `keychain_unavailable` error code to the contracts (AC-6)
      Check: pnpm test packages/contracts packages/api-client; pnpm typecheck
      Files: packages/contracts/src/errors.ts, packages/contracts/src/errors.test.ts
- [x] Task 2: Token store over an in-memory keychain: read, save, delete, check, source, `.env` order, `status.changed` (AC-2, AC-3, AC-4, AC-5, AC-7, AC-8, AC-9)
      Check: pnpm test packages/core/src/secrets; pnpm typecheck
      Files: packages/core/src/secrets/keychain.ts, packages/core/src/secrets/token-store.ts, packages/core/src/secrets/memory-keychain.ts, packages/core/src/secrets/token-store.test.ts
- [x] Task 3: A keychain that can't be reached: fixed Q4(d) message, reads fall back to `.env`, saves fail, no token in any error (AC-6, AC-10, AC-14)
      Check: pnpm test packages/core/src/secrets; pnpm typecheck
      Files: packages/core/src/secrets/token-store.ts, packages/core/src/secrets/memory-keychain.ts, packages/core/src/secrets/token-store.test.ts
- [x] Task 4: OS keychain adapter over `@napi-rs/keyring`, loaded on first use, service `DevHub` (AC-1, AC-6)
      Check: pnpm test packages/core/src/secrets; pnpm typecheck; pnpm gate boundaries
      Files: packages/core/src/secrets/os-keychain.ts, packages/core/src/secrets/os-keychain.test.ts, packages/core/src/secrets/os-keychain-load.test.ts, packages/core/src/secrets/no-real-keychain.test.ts, packages/core/src/test/no-real-keychain.ts, packages/core/vitest.config.ts, apps/server/vitest.config.ts, packages/core/package.json, apps/server/package.json, pnpm-lock.yaml (via pnpm add)
- [x] Task 5: Opt-in real keychain check, `pnpm test:keychain`, left out of `pnpm test` and CI (AC-1, AC-2, AC-3 on the real keychain)
      Check: pnpm test packages/core (the real check does not run); pnpm exec vitest list --config packages/core/vitest.keychain.config.ts; pnpm typecheck. Not yet run against the real keychain: waiting for the user's yes
      Files: packages/core/src/secrets/os-keychain.real.test.ts, packages/core/vitest.config.ts, packages/core/vitest.keychain.config.ts, package.json
- [x] Task 6: Server config reads the repo-root `.env` (shell wins), the switch and the three token keys (AC-7, AC-8, AC-12, AC-13)
      Check: pnpm test apps/server/src/config.test.ts; pnpm gate env-policy; pnpm typecheck
      Files: apps/server/src/config.ts, apps/server/src/config.test.ts, apps/server/src/main.ts, packages/core/src/index.ts, .env.example, turbo.json
- [x] Task 7: Start-up notices with the Q4 wording: switch on, "set but not used", `chmod 600 .env` (AC-7, AC-11)
      Check: pnpm test apps/server/src/token-notices.test.ts; pnpm typecheck
      Files: apps/server/src/token-notices.ts, apps/server/src/token-notices.test.ts, apps/server/src/main.ts
- [x] Task 8: Wire the store into `createServer` as `app.tokens`; `main.ts` passes the OS keychain; nothing reads it at start (AC-1, AC-6, AC-14)
      Check: pnpm test packages/core apps/server; pnpm build; pnpm exec playwright test e2e/
      Files: packages/core/src/create-server.ts, packages/core/src/secrets/tokens-in-server.test.ts, packages/core/src/index.ts, apps/server/src/main.ts
- [x] Task 9: Docs: a `learn/` page on tokens and the keychain, architecture, local-security and the integration-adapter skill
      Check: pnpm gate learn-freshness; pnpm gate handbook-size; pnpm format:check
      Files: learn/tokens-and-keychain.md, learn/local-security.md, docs/architecture.md, .claude/skills/integration-adapter/SKILL.md, README.md
- [x] Task 10: STOP and run /review (passed 17 Oct 2026)
      Check: the review stamp matches the branch (pnpm review:stamp verify)
