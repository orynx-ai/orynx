# Tasks: Install Orynx, open it on your wifi, keep it as an app

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: The app manifest, icons, Apple touch icon and theme colours (AC-12)
      Check: Chrome's `Page.getInstallabilityErrors` on `pnpm start` reports none
      Files: apps/web/index.html, apps/web/public/manifest.webmanifest, icon-192.png, icon-512.png, apple-touch-icon.png
- [x] Task 2: `DEVHUB_LAN`, the front door, the access code and the orynx.local announcer (AC-1–AC-10)
      Check: pnpm test apps/server/src/lan.test.ts apps/server/src/announce.test.ts apps/server/src/config.test.ts
      Files: apps/server/src/config.ts, lan.ts, announce.ts, main.ts, their tests, .env.example
- [x] Task 3: `./install.sh` (AC-11)
      Check: `bash -n install.sh`; its certificate step and the server in LAN mode against a temporary DEVHUB_HOME: orynx.local resolves, https answers, http redirects
      Files: install.sh
- [x] Task 4: README, landing page, learn/local-security.md, docs/architecture.md, rule 10
      Check: pnpm gates
      Files: README.md, apps/landing/index.html, learn/local-security.md, docs/architecture.md, CLAUDE.md, AGENTS.md
