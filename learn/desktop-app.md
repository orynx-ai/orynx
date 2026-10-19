<!-- learn-sources: apps/desktop/src/main.ts apps/desktop/src/hub.ts apps/desktop/src/login-path.ts apps/desktop/src/updates.ts apps/desktop/src/links.ts apps/desktop/src/log-file.ts apps/desktop/electron-builder.yml scripts/pack-desktop.ts scripts/lib/release-version.ts .github/workflows/release.yml e2e/desktop/desktop.spec.ts -->

# The desktop app: how Orynx installs, starts, releases and updates

Spec 027 made Orynx an app you install: a `.dmg` for Apple Silicon Macs and an AppImage for Linux. It is the same hub and the same page as `pnpm start`, in a window of its own, with no terminal and no Node to install. A push of `main` to `release` builds and publishes it.

## How it starts

`apps/desktop/src/main.ts` does, in order:

1. Points Electron's own data (page storage, caches) at `<DEVHUB_HOME>/desktop`, and takes the single-instance lock. The lock lives with that data, so it is per home: a second launch on the same home brings the open window to the front instead.
2. Opens `<DEVHUB_HOME>/logs/orynx.log` for this launch, keeping the last one as `orynx.old.log`. The hub's output goes there, since nothing has a terminal.
3. Stops if another hub already runs on this home: `runtime.json` names a live pid and its port answers HTTP (`hub.ts`). Two hubs on one home would overwrite each other's `runtime.json`, settings and sessions. You see "Orynx is already running", and the app quits. That is what happens while `pnpm start` or `pnpm dev` runs on `~/.devhub`; give those their own `DEVHUB_HOME` and `DEVHUB_PORT` to run both.
4. Reads the login shell's PATH (`login-path.ts`): an app opened from Finder gets only `/usr/bin:/bin:/usr/sbin:/sbin`, so `gh`, `node` and `pnpm` from Homebrew or nvm would be missing. The hub gets the PATH the app was started with, then the shell's folders. The limit is 10 seconds: a zsh with nvm took 0.8 s warm and over 5 s on its first start after login.
5. Starts `server/dist/main.mjs` in a `utilityProcess` with `--serve-web`, `DEVHUB_PORT=0` and `NODE_ENV=production`, waits for `runtime.json` to name that process and its port to answer (30 seconds at most), and opens the window on `http://127.0.0.1:<port>`.

A free port every launch means the page's address changes, so what the page saves in the browser (theme, sidebar width, Tickets view, the composer's model) starts fresh each time. The user chose that over a fixed port (spec 027, Q2).

The window has no Node and no preload. `links.ts` decides where an address goes: a new `https:` window (Jira, GitHub) opens in the default browser, Open in's `vscode:` and `cursor:` links go to the editor, and anything else is refused. If the hub stops on its own, "Orynx stopped" names the log and offers Quit or Open again. Quitting stops the hub with SIGTERM first, the way Ctrl-C stops `pnpm start`, so `runtime.json` goes too.

## Packing it

```sh
pnpm --filter @devhub/desktop package --dir   # the app folder only: apps/desktop/release/mac-arm64/Orynx.app
pnpm --filter @devhub/desktop package         # also the .dmg and .zip (macOS) or the AppImage (Linux)
```

`scripts/pack-desktop.ts` builds the hub, the web app and `main.cjs`, deploys the hub with its production `node_modules` into `apps/desktop/.stage`, copies the web build beside it, and runs electron-builder (`apps/desktop/electron-builder.yml`). In the app, `Contents/Resources/server` and `Contents/Resources/web` are plain files beside `app.asar`, so the hub finds `../../web/dist` exactly as it does in the repo. Four things that cost time to find:

- `pnpm pack` is pnpm's own command (it makes a tarball), so the script is called `package`.
- pnpm 10 deploys a workspace package only with `--legacy`; `--config.node-linker=hoisted` gives plain folders with no symlinks.
- electron-builder always drops the `node_modules` at the top of a folder it copies, but keeps one a level down. So the config copies `.stage` as a whole, and `server/node_modules` survives.
- `main.cjs` is CommonJS: electron-updater calls `require('electron')`, which an ES module bundle can't keep. Everything else is bundled in, so the app ships no `node_modules` of its own.

better-sqlite3 13 and `@napi-rs/keyring` are Node-API with prebuilt files, so they load in Electron as built, with no rebuild. Electron 44.9.0 ships Node 24.22, which meets the repo's `engines`.

**Signing.** There is no Apple Developer account yet (Q12), so the app is ad-hoc signed (`identity: '-'`), which Apple Silicon needs to run it at all, with no hardened runtime. The bundled Claude Code keeps Anthropic's own signature (`signIgnore`): `codesign -dv` on `Resources/server/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude` shows team `Q6L2SF6YDW`.

**The icon** (`apps/desktop/build/icon.png`) is `apps/web/public/favicon.svg` drawn at 824 of 1024 px, as Apple's icon grid has it, with Playwright's Chromium. It stays until there is a designed one (Q4).

## Testing it

```sh
pnpm --filter @devhub/desktop package --dir
pnpm test:e2e:desktop
```

`e2e/desktop/desktop.spec.ts` launches the packed app, never the source: only the packed app holds the hub with its own `node_modules`. Each test gives it a throwaway `DEVHUB_HOME`, the memory keychain, the e2e run's fake `gh` and Claude Code, and a fake releases server through `DEVHUB_UPDATES_URL`. The OS's browser and message boxes are swapped for recorders. The windows open on your screen while it runs. The main `pnpm test:e2e` run skips `e2e/desktop`.

With a message box open, Electron doesn't act on SIGTERM, so a test that leaves the app at a dialog stops it with SIGKILL.

## Releasing it

`release` only ever moves to a commit on `main`:

```sh
git push origin main:release
```

Never commit on `release` or merge a pull request into it: a merge commit isn't on `main`, so the next push would fail the review-stamp push gate, and `release.yml` refuses it ("release must point at a commit on main"). On GitHub, turn on a rule for `release` that blocks force pushes and deletion (Settings › Rules › Rulesets, or Branches).

Each push runs `.github/workflows/release.yml`, one run at a time:

1. It checks that the commit is on `origin/main`.
2. It runs `ci.yml`'s jobs (`workflow_call`).
3. It packs macOS arm64 on `macos-latest` and Linux x64 on `ubuntu-latest`, and runs `pnpm test:e2e:desktop` on the Linux build under `xvfb-run`.
4. It publishes `v<version>` with the `.dmg`, the `.zip`, the AppImage, `latest-mac.yml`, `latest-linux.yml` and the blockmaps, with GitHub's notes. It needs only `GITHUB_TOKEN`.

The version is major.minor from `apps/desktop/package.json` and the run number as the patch: `0.1.37`. `scripts/release-version.ts` writes it into `apps/desktop` and `apps/server` in the CI checkout only, so About Orynx, the file names and `/api/status` agree, and nothing is committed. To start `0.2`, change `apps/desktop/package.json` on `main`. A re-run of a run that already published fails at its tag and changes nothing.

**A dry run.** Actions › Release › Run workflow, on any branch, builds both apps and publishes nothing.

## Updates

`updates.ts` checks this repo's Releases at launch and every 6 hours, with no token. An unsigned Mac can't install an update, so it shows "Orynx 0.1.38 is out" once per launch and Download opens the release page. Linux's AppImage downloads the update, checks its sha512 against `latest-linux.yml`, says "It installs the next time you quit Orynx.", and installs it on quit. Orynx never restarts itself, so a running session is never cut off.

**While the repo is private** every check is a 404 and only the log says so ("Orynx couldn't check for updates (404)."). electron-updater wraps that 404 in a long message of its own, and the log reads the status out of it. No token ships in the app. When the repo goes public, the same builds start finding updates: nothing changes in Orynx.

To see the macOS notice by hand, serve a `latest-mac.yml` with a higher version and start the packed app with `DEVHUB_UPDATES_URL=http://127.0.0.1:<port>`, as the e2e test does.

## Installing it (until the install guide, spec 018)

- **macOS**: open the `.dmg` and drag Orynx to Applications. The first open says macOS can't check it; System Settings › Privacy & Security › Open Anyway, once per install. If macOS says the app is damaged instead, `xattr -dr com.apple.quarantine /Applications/Orynx.app` clears the download's quarantine. An unsigned app's signature changes with every build, so after each update the keychain asks once more whether Orynx may use "DevHub".
- **Linux**: `chmod +x Orynx-<version>.AppImage` and open it. AppImages need FUSE 2 (`libfuse2`, `libfuse2t64` on Ubuntu 24.04). Sessions run commands only with `bubblewrap` and `socat` installed. Ubuntu 24.04 also blocks the user namespaces Electron's sandbox uses; CI turns that off with `sysctl kernel.apparmor_restrict_unprivileged_userns=0`, and the install guide should say what a laptop should do.
