# Tasks: In-app updates, version and what's new

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: The spec changes from the plan: F reuses the Orynx restarted notice, AC-33 goes, AC-5's axe check lives in the panel test
      Check: pnpm gate specs
      Files: specs/045-in-app-updates/spec.md
- [x] Task 2: The updates contract: release, answer, install request and refusals, `updates.changed`, `update_available`, routes and builders (AC-6 to AC-13)
      Check: pnpm test packages/contracts/src/updates.test.ts packages/contracts/src/notifications.test.ts; pnpm typecheck
      Files: packages/contracts/src/updates.ts, updates.test.ts, notifications.ts, events.ts, routes.ts, index.ts, testing.ts
- [x] Task 3: Versions: parse tags, compare, read `git describe` (AC-2, AC-7, AC-14)
      Check: pnpm test packages/core/src/updates/versions.test.ts
      Files: packages/core/src/updates/versions.ts, versions.test.ts
- [x] Task 4: The releases client and map: one GET with no token, GitHub's problems, drafts and prereleases left out (AC-10, AC-12, AC-17)
      Check: pnpm test packages/core/src/integrations/releases
      Files: packages/core/src/integrations/releases/client.ts, client.test.ts, map.ts, map.test.ts, packages/core/src/test/fake-releases.ts
- [x] Task 5: The update service: start, every 6 hours, at most once a minute, the log line, busy while a session works or waits (AC-6 to AC-12, AC-22, AC-29)
      Check: pnpm test packages/core/src/updates/update-service.test.ts
      Files: packages/core/src/updates/update-service.ts, update-service.test.ts
- [x] Task 6: GET /api/updates, POST check and POST install, wired into createServer only when the host passes `updates` (AC-6, AC-9, AC-12)
      Check: pnpm test packages/core/src/routes/updates.test.ts
      Files: packages/core/src/routes/updates.ts, updates.test.ts, packages/core/src/create-server.ts, packages/core/src/index.ts
- [x] Task 7: The update notification, once per version, remembered in settings.json (AC-13)
      Check: pnpm test packages/core/src/updates/update-service.test.ts packages/core/src/notifications
      Files: packages/core/src/updates/update-service.ts, update-service.test.ts, packages/core/src/notifications/notification-service.ts, packages/core/src/settings/settings-store.ts
- [x] Task 8: The clone updater: the version from git, refusals, `git pull --ff-only && ./install.sh` detached with update.log, failure from the exit code (AC-2, AC-25, AC-27, AC-28)
      Check: pnpm test packages/core/src/updates/clone-updater.test.ts
      Files: packages/core/src/updates/clone-updater.ts, clone-updater.test.ts
- [x] Task 9: install.sh: DEVHUB_SERVICE in the LaunchAgent and the unit, the Linux sudo skip, no waiting for a password without a terminal (AC-25, AC-28)
      Check: bash -n install.sh; pnpm test packages/core/src/updates/clone-updater.test.ts
      Files: install.sh, README.md
- [x] Task 10: The server host picks its kind and hands `updates` to createServer: DEVHUB_SERVICE, DEVHUB_RELEASES_URL (AC-1, AC-2, AC-30)
      Check: pnpm test apps/server/src/config.test.ts apps/server/src/updates-host.test.ts; pnpm gate env-policy
      Files: apps/server/src/config.ts, config.test.ts, main.ts, updates-host.ts, updates-host.test.ts, .env.example
- [x] Task 11: The hub's side of the desktop messages: state in, download and restart out (AC-18 to AC-23)
      Check: pnpm test apps/server/src/desktop-updates.test.ts
      Files: apps/server/src/desktop-updates.ts, desktop-updates.test.ts, apps/server/src/updates-host.ts, packages/contracts/src/updates.ts
- [x] Task 12: The desktop updater sends its state to the hub, drops its native dialogs, and restarts on Linux through quitAndInstall after stopping the hub (AC-13, AC-18, AC-19, AC-22)
      Check: pnpm test apps/desktop/src/updates.test.ts apps/desktop/src/dialogs.test.ts
      Files: apps/desktop/src/updates.ts, updates.test.ts, dialogs.ts, dialogs.test.ts, main.ts
- [x] Task 13: The Mac's own update: latest-mac.yml, download, sha512, unzip, swap, reopen, put back on failure, Download when the folder can't be written (AC-20, AC-21, AC-23)
      Check: pnpm test apps/desktop/src/mac-update.test.ts
      Files: apps/desktop/src/mac-update.ts, mac-update.test.ts, apps/desktop/src/main.ts
- [x] Task 14: api-client: getUpdates, postUpdatesCheck, postUpdatesInstall and updatesQueryOptions; `updates.changed` and `sessions.changed` refresh it
      Check: pnpm test packages/api-client/src/updates.test.ts packages/app/src/live-updates.test.tsx
      Files: packages/api-client/src/endpoints/updates.ts, updates.test.ts, client.ts, queries.ts, index.ts, packages/app/src/live-updates.tsx, live-updates.test.tsx
- [x] Task 15: The About tab with its Version part, its loading skeletons and its axe check (AC-1 to AC-5)
      Check: pnpm test packages/app/src/features/settings
      Files: packages/app/src/features/settings/tabs.ts, settings-screen.tsx, settings-screen.test.tsx, queries.ts, components/about-panel.tsx, about-panel.test.tsx, packages/app/src/test/msw.ts
- [x] Task 16: The Updates part: up to date, out, checking, couldn't check, no releases, downloading, ready, updating, failed, busy, and by hand with its commands (AC-6 to AC-11, AC-18 to AC-23, AC-25, AC-27 to AC-30)
      Check: pnpm test packages/app/src/features/settings/components/updates-section.test.tsx
      Files: packages/app/src/features/settings/components/updates-section.tsx, updates-section.test.tsx, update-words.ts, about-panel.tsx, queries.ts
- [x] Task 17: The What's new part: newest first, New and Your version, notes as Markdown, links in the browser, the empty state, no notes (AC-14 to AC-17)
      Check: pnpm test packages/app/src/features/settings/components/whats-new.test.tsx
      Files: packages/app/src/features/settings/components/whats-new.tsx, whats-new.test.tsx, about-panel.tsx
- [x] Task 18: The update notification's look, words and place, which opens Settings › About from the centre and from a pop-up (AC-13)
      Check: pnpm test packages/app/src/features/notifications
      Files: packages/app/src/features/notifications/words.ts, words.test.ts, components/notification-centre.tsx, components/pop-ups.tsx, notification-centre.test.tsx, packages/app/src/features/settings/components/notifications-panel.tsx
- [x] Task 19: Release notes from feat and fix commits since the last release, used by release.yml (AC-34 to AC-36)
      Check: node --test scripts/lib/release-notes.test.ts
      Files: scripts/lib/release-notes.ts, release-notes.test.ts, scripts/release-notes.ts, .github/workflows/release.yml
- [x] Task 20: e2e: the About tab against a fake releases API, Settings' tab list with About, and every e2e hub pointed at the fake (AC-1, AC-3, AC-6, AC-7, AC-14, AC-30)
      Check: pnpm test:e2e e2e/about.spec.ts e2e/settings.spec.ts
      Files: e2e/about.spec.ts, e2e/settings.spec.ts, e2e/fake-tools/preload.ts, e2e/fake-tools/releases.ts, playwright.config.ts
- [ ] Task 21: Desktop e2e: no dialog, About shows the update from the fake releases server, the Mac swap on a copy of the packed app (AC-13, AC-18, AC-20, AC-24)
      Check: pnpm --filter @devhub/desktop package --dir; pnpm test:e2e:desktop
      Files: e2e/desktop/desktop.spec.ts, e2e/desktop/fake-releases.ts
- [ ] Task 22: Docs: updates in learn/desktop-app.md, README's update line, architecture's config keys, the bridge and the releases integration
      Check: pnpm gate learn-freshness; pnpm gate handbook-size
      Files: learn/desktop-app.md, README.md, docs/architecture.md
- [ ] Task 23: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
