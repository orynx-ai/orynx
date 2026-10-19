# Plan: Desktop app

Spec: `specs/027-desktop-app/spec.md`

## Order of work

1. **Server first** (tasks 1–2). The hub must take `DEVHUB_PORT=0` and write the port it got, and `settings.json` must survive an update. Both are small, unit-tested, and change nothing for `pnpm dev`, `pnpm start` or the e2e run, which keep a fixed port.
2. **The `apps/desktop` host and its pure parts** (tasks 3–7): config, the login-shell PATH, finding the hub (one per home, its port, waiting for it), the log file, the link rules, and the update notices. Each is a plain module with its own unit test. Nothing here imports `electron`: in Node, `require('electron')` is only the path to the binary, so the logic stays testable and `main.ts` only wires it to Electron.
3. **`main.ts`** (task 8): the Electron wiring (window, one copy, the hub's `utilityProcess`, quit, the Dock, links, updater). It is excluded from unit coverage like `apps/server/src/main.ts`, and covered by the desktop e2e test.
4. **Packing** (task 9): electron-builder with the server, its production `node_modules` and the web build as plain resources. This is the first time the real thing runs, so it comes before the e2e test that needs it.
5. **The desktop e2e test on the packed app** (task 10), because better-sqlite3 rebuilt for Electron only exists in the packed app.
6. **Release** (tasks 11–12): the version stamp, then `release.yml` with `ci.yml` reused. Last, because it builds on everything above.
7. **Docs, then the hand checks on a Mac** (tasks 13–14), then /review.

## Risks

| Risk                                                                                                                                    | How we will notice early                                                               | What we do                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| better-sqlite3 built for Node won't load in Electron's Node (a different module ABI even on Node 24)                                    | Task 9: the packed app's server exits at start, and the log says `NODE_MODULE_VERSION` | Rebuild the packed copy with `@electron/rebuild` for Electron 44.9.0 (Q7). The repo's own `node_modules` stay built for Node, so `pnpm dev` and tests are untouched                                          |
| `pnpm deploy` in pnpm 10 wants `inject-workspace-packages`, and its symlinked `node_modules` may not survive electron-builder's copy    | Task 9: the deploy fails, or the packed app can't find a package                       | Deploy with `--config.node-linker=hoisted` (plain folders) and `--legacy` if pnpm asks for it                                                                                                                |
| electron-builder re-signs the bundled Claude Code and strips Anthropic's entitlements                                                   | Task 9: `codesign -dv` on the packed `claude` no longer shows team `Q6L2SF6YDW`        | `signIgnore` for that path. If ad-hoc signing still touches it, sign the app ourselves after packing, with that file left out                                                                                |
| electron-builder writes no `latest-mac.yml`/`latest-linux.yml` with `--publish never`                                                   | Task 9: the files are missing from `apps/desktop/release/`                             | Run electron-builder's own `--publish always` in the publish job instead of `gh release create`                                                                                                              |
| Electron's postinstall downloads ~100 MB in every CI job once `electron` is in `onlyBuiltDependencies`                                  | Task 3: the first CI run of the branch takes longer per job                            | `ELECTRON_SKIP_BINARY_DOWNLOAD=1` in the shared setup action, cleared in the release build jobs                                                                                                              |
| `ci.yml`'s concurrency (`cancel-in-progress: true` on the ref) cancels a release's checks when it's called from `release.yml`           | Task 12: the dry run on the branch shows a cancelled CI job                            | Put the workflow's name in the concurrency group, so a called run has a group of its own                                                                                                                     |
| A login shell prints banners or asks questions (oh-my-zsh, nvm) and pollutes or blocks the PATH read                                    | Task 4: the unit test with a noisy fake shell                                          | Read PATH between two markers, with stdin closed and a 5-second limit; fall back to the PATH the app got                                                                                                     |
| Claude Code's Seatbelt sandbox, the osascript folder picker or the keychain behave differently when started from an app, not a terminal | Task 14: the hand checks on a Mac                                                      | Stop and ask before /review if any fails. The sandbox missing means sessions get no commands, which `sandboxAvailable()` already says in the log                                                             |
| An ad-hoc signed download says "damaged" instead of offering Open Anyway                                                                | Task 14                                                                                | Document `xattr -dr com.apple.quarantine /Applications/Orynx.app` in `learn/desktop-app.md` and tell the user before /review                                                                                 |
| electron-updater on Linux updates only a real AppImage (`APPIMAGE` set), so the e2e test's unpacked build can't download an update      | Task 10                                                                                | The e2e test covers the quiet 404 and the macOS notice path with a fake releases server. The Linux download and install-on-quit are unit-tested in task 7 and checked by hand on the first two real releases |
| Coverage for `apps/desktop` drops below 90%                                                                                             | Task 3 onwards: `pnpm test apps/desktop` with coverage                                 | Keep Electron calls in `main.ts` (excluded, e2e-covered) and every decision in the pure modules                                                                                                              |
| A pid in an old `runtime.json` reused by another program makes Orynx say another hub is running                                         | Rare; the user sees AC-8's dialog with no Orynx running                                | The check also asks the port in that file for `GET /` before it counts the hub as running                                                                                                                    |

## Touches

- Packages: `apps/server` (config, runtime file, main), `packages/core` (settings store), new `apps/desktop`, `.github/workflows` and the setup action, `scripts/` (release version), docs.
- Gates that check this work: boundaries (the new host in `LAYERS`), env-policy (`apps/desktop/src/config.ts` and the new key in `.env.example`), secrets, test-policy, specs, handbook-size, learn-freshness, agent-rules; the vitest coverage thresholds; the CI "every package sent a report" step (the new matrix row).
- Skills to follow: `.claude/skills/new-package/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`, `.claude/skills/write-a-gate/SKILL.md` (only for the `LAYERS` row and its policy test).
- New dependencies (Q6, Q7): `electron@44.9.0` (Node 24.22.0, released 2026-10-17), `electron-builder`, `electron-updater`, `@electron/rebuild`, all in `apps/desktop`. `zod`, `tsdown` and `@playwright/test` are already in the repo.

## Hand checks on a Mac (task 14)

Tick each with the date. These are the parts no test can reach: Gatekeeper, the real keychain, the real sandbox and the OS's own pickers.

- [ ] AC-1: the `.dmg` from task 9, opened from Finder after a browser download: Open Anyway once, then later launches open without asking
- [ ] AC-4: the real `~/.devhub` and keychain: settings, folders and sessions are there; the keychain asks once; Jira and GitHub read as connected
- [ ] AC-10, AC-11: `gh` from Homebrew is found, and a session's `pnpm test` finds `node` and `pnpm`
- [ ] AC-12: an allowed command runs inside the sandbox, the Claude login check works, and `codesign -dv` on the packed `claude` shows `Q6L2SF6YDW`
- [ ] AC-14: Open in VS Code opens the worktree
- [ ] AC-16: Choose folder opens the Mac's picker and fills the field
- [ ] AC-17, AC-19: close the window then click the Dock icon; ⌘K, ⌘C, ⌘V, ⌘Z and ⌘R work
- [ ] AC-20: every screen in light and dark at 360 and 1280 px looks as in the browser
- [ ] AC-24: with a fake newer `latest-mac.yml` (`DEVHUB_UPDATES_URL`), the macOS notice shows once and Download opens the release page
- [ ] AC-2, AC-25: on Linux, if one is at hand: the AppImage opens, and after the next real release it updates on quit
