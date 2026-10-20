# Plan: Set up Orynx the first time

Spec: `specs/043-first-run-setup/spec.md`

## Order of work

1. **Contracts:** `ProfileSchema`, `SetupStateSchema`, `SetupRequestSchema`, the `already_set_up` error, `/api/profile` and `/api/setup`, and their test builders.
2. **Core, the password store** (`packages/core/src/setup/password-store.ts`): scrypt hash and salt in `DEVHUB_HOME/password` (0600), `verify`, and the cookie value (an HMAC keyed by the saved line). Memory when no path is given, for tests. It comes first because both the hub and the front door use it.
3. **Core, the routes:** `GET`/`PUT /api/profile` (settings.json `profile`) and `GET`/`POST /api/setup`, through a `createServer` option `password`.
4. **api-client:** the four calls, `profileQueryOptions` and `setupQueryOptions`.
5. **App, the profile from the server:** Edit profile, the profile menu and the sidebar footer read and save `/api/profile`; `stores/profile-store.ts` goes.
6. **App, the setup page:** `features/setup/setup-screen.tsx`, shown by `AppShell` in place of the app while `/api/setup` says not done. Opened in a real browser at 360 and 1280 px, light and dark.
7. **Server, the front door:** the password and its rate limit in place of the access code, the "Finish setting up" page, `main.ts` sharing one password store with the hub.
8. **e2e:** every hub's `DEVHUB_HOME` starts with a password, so no suite meets the setup page.
9. **Docs:** README (install from `orynx-ai/orynx`, the password), `install.sh`'s last words, `learn/local-security.md`, `docs/architecture.md`, the landing page, rule 10 (then `pnpm agent-rules`).

## Risks

| Risk                                                   | How we will notice early             | What we do                                                                   |
| ------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------- |
| A stranger on the wifi sets the password first.        | AC-7's front door test.              | No password, no way through from another device; `/api/setup` 409s once set. |
| A weak password is guessed over the wifi.              | AC-11's test.                        | 10 wrong tries per 15 minutes for all devices; scrypt makes each try slow.   |
| Every app test and e2e suite now meets the setup page. | The first app test run after task 6. | MSW's default says set up; each e2e home gets a password file.               |
| A picture too big for the request, or not a picture.   | The profile route's tests.           | The schema takes only `data:image/(png\|webp\|jpeg);base64,…` up to 512 KB.  |

## Touches

- Packages: contracts, core, api-client, app, server; README, install.sh, docs.
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, test-policy, env-policy, secrets, handbook-size, specs.
- Skills to follow: `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/server-state/SKILL.md`, `.claude/skills/forms/SKILL.md`, `.claude/skills/build-a-screen/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`.
