# Tasks: Desktop app

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: The hub takes `DEVHUB_PORT=0` and writes the port it got to `runtime.json` and its log line (AC-7, AC-39)
      Check: pnpm test apps/server/src/config.test.ts apps/server/src/runtime-file.test.ts; pnpm typecheck; pnpm gate env-policy. The port written by `main.ts` (no unit test, like the rest of it) was checked by running the built hub with `DEVHUB_PORT=0`; task 10's e2e test keeps it covered
      Files: apps/server/src/config.ts, apps/server/src/config.test.ts, apps/server/src/main.ts, .env.example
- [x] Task 2: Saving over an unreadable `settings.json` keeps it as `settings-<date-time>.unreadable.json` (0600), and the log names it (AC-37, AC-38)
      Check: pnpm test packages/core/src/settings/settings-store.test.ts; pnpm typecheck
      Files: packages/core/src/settings/settings-store.ts, packages/core/src/settings/settings-store.test.ts, apps/server/src/main.ts
- [x] Task 3: The `apps/desktop` host: package (Electron 44.9.0, electron-builder, electron-updater, @electron/rebuild, all bundled or build-time only), tsconfig, vitest and tsdown configs, `LAYERS` row, coverage exclude for `main.ts`, CI matrix row, `electron-winstaller` in `ignoredBuiltDependencies`, and `src/config.ts` (the hub's environment, `DEVHUB_UPDATES_URL`) (AC-40)
      Check: pnpm test apps/desktop/src/config.test.ts; node --test scripts/lib/policies/boundaries.test.ts; pnpm gate boundaries; pnpm gate env-policy; pnpm typecheck
      Files: apps/desktop/package.json, apps/desktop/tsconfig.json, apps/desktop/vitest.config.ts, apps/desktop/tsdown.config.ts, apps/desktop/src/config.ts, apps/desktop/src/config.test.ts, scripts/lib/policies/boundaries.ts, scripts/lib/policies/boundaries.test.ts, vitest.config.ts, pnpm-workspace.yaml, pnpm-lock.yaml, .github/workflows/ci.yml, .env.example, docs/architecture.md (Packages row)
- [x] Task 4: The login shell's PATH, after the PATH the app got, with markers, closed stdin and a 10-second limit (AC-10, AC-11)
      Check: pnpm test apps/desktop/src/login-path.test.ts
      Files: apps/desktop/src/login-path.ts, apps/desktop/src/login-path.test.ts
- [x] Task 5: Finding the hub: another live hub on this home (pid alive and `GET /` answers), an ended one ignored, then waiting for this hub's `runtime.json` and `GET /`, 30 seconds at most (AC-6, AC-8, AC-9)
      Check: pnpm test apps/desktop/src/hub.test.ts
      Files: apps/desktop/src/hub.ts, apps/desktop/src/hub.test.ts
- [x] Task 6: The log file (`logs/orynx.log`, the last launch's as `orynx.old.log`, folder 0700, files 0600) and the link rules (https new windows and `vscode:`/`cursor:` to the OS, everything else refused) (AC-13, AC-14, AC-15, AC-21)
      Check: pnpm test apps/desktop/src/log-file.test.ts apps/desktop/src/links.test.ts
      Files: apps/desktop/src/log-file.ts, apps/desktop/src/log-file.test.ts, apps/desktop/src/links.ts, apps/desktop/src/links.test.ts
- [x] Task 7: The dialogs' words (Q1–Q3, AC-8's) and the update notices: once per launch, quiet on 404 or no network, macOS never downloads, Linux downloads and installs only on quit, no token or header (AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29)
      Check: pnpm test apps/desktop/src/dialogs.test.ts apps/desktop/src/updates.test.ts
      Files: apps/desktop/src/dialogs.ts, apps/desktop/src/dialogs.test.ts, apps/desktop/src/updates.ts, apps/desktop/src/updates.test.ts
- [x] Task 8: `main.ts`: one copy, the hub in a `utilityProcess` with `--serve-web` and `DEVHUB_PORT=0`, the window (1280 × 800, shown once drawn, no Node), links, the Dock, quit, the update checks at launch and every 6 hours (AC-3, AC-5, AC-17, AC-18, AC-22, AC-41)
      Check: pnpm typecheck; pnpm --filter @devhub/desktop build
      Files: apps/desktop/src/main.ts
- [x] Task 9: Packing: the server deployed with its production `node_modules` (hoisted), the web build, Claude Code left unsigned by us, ad-hoc signing, `.dmg` + `.zip` (arm64) and AppImage, the GitHub feed files (AC-1, AC-2, AC-12)
      Check: pnpm --filter @devhub/desktop package; codesign -dv on the packed claude shows TeamIdentifier=Q6L2SF6YDW; latest-mac.yml is in apps/desktop/release. Also run by hand on a throwaway home: the packed app opened Home on a free port, and quitting stopped the hub and removed runtime.json
      Files: apps/desktop/electron-builder.yml, scripts/pack-desktop.ts, apps/desktop/package.json, apps/desktop/build/icon.png (drawn from apps/web/public/favicon.svg), .gitignore, pnpm-lock.yaml
- [x] Task 10: The desktop e2e test on the packed app: temporary home, memory keychain, fake Claude Code, a fake releases server; Home shows, a second launch starts no copy, another live hub stops the app, links reach the recorder, the window has no Node, a stopped hub says so, quitting removes `runtime.json`, a 404 only logs, a Mac shows the notice (AC-3, AC-5, AC-7, AC-8, AC-9, AC-13, AC-14, AC-15, AC-18, AC-21, AC-22, AC-23, AC-24, AC-29, AC-40, AC-41)
      Check: pnpm --filter @devhub/desktop package --dir; pnpm test:e2e:desktop (9 passed on macOS, 2026-10-19)
      Files: playwright.desktop.config.ts, e2e/desktop/desktop.spec.ts, e2e/desktop/fake-releases.ts, playwright.config.ts (ignores e2e/desktop), package.json, apps/server/package.json (0.1.0, as the app), apps/desktop/electron-builder.yml (Linux executable name), apps/desktop/src/updates.ts (the status inside electron-updater's message)
- [x] Task 11: The release version: major.minor from `apps/desktop/package.json` plus the run number, written into `apps/desktop` and `apps/server` package.json, never committed (AC-22, AC-32)
      Check: node --test scripts/lib/release-version.test.ts; pnpm exec tsc -p tsconfig.json
      Files: scripts/release-version.ts, scripts/lib/release-version.ts, scripts/lib/release-version.test.ts
- [ ] Task 12: `release.yml`: refuse a commit not on `origin/main`, run `ci.yml` (now also `workflow_call`, with its own concurrency group), build macOS arm64 and Linux in parallel with the desktop e2e test on Linux, then publish `v<version>` with GitHub's notes; one run at a time; `workflow_dispatch` builds without publishing (AC-30, AC-31, AC-32, AC-33, AC-34, AC-35, AC-36)
      Check: pnpm exec prettier --check .github/workflows; pnpm gate secrets; the dry run (workflow_dispatch on feat/027-desktop-app, which you start on GitHub after pushing the branch) builds both apps and publishes nothing
      Files: .github/workflows/release.yml, .github/workflows/ci.yml
- [ ] Task 13: Docs: `docs/architecture.md` (stack rows, "Porting to a desktop app", the port), CLAUDE.md's Layout and Workflow lines, the new-package skill's desktop line, `learn/desktop-app.md` (how the app starts the hub, how `release` publishes, branch protection, making the repo public, the quarantine fallback), and a script for your `docs/product/spec.md` change (AC-30)
      Check: pnpm gate handbook-size; pnpm gate learn-freshness; pnpm gate agent-rules; pnpm gate specs
      Files: docs/architecture.md, CLAUDE.md, .claude/skills/new-package/SKILL.md, learn/desktop-app.md, AGENTS.md, .github/copilot-instructions.md, .cursor/rules/00-core.mdc (regenerated by pnpm agent-rules)
- [ ] Task 14: Hand checks on a Mac, from plan.md's list, each ticked with the date (AC-1, AC-2, AC-4, AC-10, AC-11, AC-12, AC-14, AC-16, AC-17, AC-19, AC-20, AC-24, AC-25)
      Check: every line under "Hand checks on a Mac" in plan.md is ticked or marked "not at hand" with the reason
      Files: specs/027-desktop-app/plan.md
- [ ] Task 15: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
