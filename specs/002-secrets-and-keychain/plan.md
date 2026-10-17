# Plan: Secrets and keychain

Spec: `specs/002-secrets-and-keychain/spec.md`

## Order of work

1. **Contracts**: add the `keychain_unavailable` error code. Spec 003's routes will return it, and the store's error uses the same name.
2. **Core, the token store with an in-memory keychain**: read, save and delete; checking a token; tagging where each token came from; the keychain-then-`.env` order; and `status.changed` on every change. The keychain sits behind a small `Keychain` interface. That way every rule can be tested without the OS. The in-memory keychain fakes an outside service, like an MSW handler; it doesn't stand in for our own code.
3. **Core, a keychain that can't be reached**: one `TokenStoreError` with a fixed message. Reads fall back to `.env` and saves fail. No token in any message or `cause`.
4. **Core, the OS keychain adapter** over `@napi-rs/keyring`. It loads the library only on first use (`await import`), so starting DevHub never loads the native module. If the module fails to load on some machine, that counts as "can't be reached" rather than a crash. Unit-tested with the library faked.
5. **The opt-in real check** (`pnpm test:keychain`, Q5). It has its own vitest config and is left out of `pnpm test`, `verify` and CI. It runs against the real keychain only after the user says yes.
6. **Server config**: read the repo-root `.env` with Node's `util.parseEnv`. Shell variables win, and a missing file is fine. Add the switch and the three token keys, plus `.env.example` and turbo's pass-through list. `loadConfig` takes the env and the file's text as arguments, so it stays pure and its tests never touch `process.env`.
7. **Server notices**: a pure function turns the config, and whether `.env` can be read by other users, into the Q4 lines. `main.ts` logs them at start.
8. **Wire it in**: `createServer` takes `keychain` and `envTokens`, builds the store on its own event bus, and exposes it as `app.tokens` for spec 003's routes. `main.ts` passes the OS keychain. Tests get an empty in-memory keychain by default. AC-14 runs through the real server at log level trace.
9. **Docs**: a `learn/` page on tokens (the macOS prompt, the `.env` fallback, finding the item in Keychain Access). Update `docs/architecture.md` (the keyring is now decided, and `.env` loading), the "Where tokens live" part of `learn/local-security.md`, and step 2 of the integration-adapter skill.

## Risks

| Risk                                                                                                      | How we will notice early                                               | What we do                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm add` fails behind the corporate TLS proxy                                                           | The install in task 4 errors with a certificate message                | `NODE_OPTIONS=--use-system-ca`, as in `corporate-tls-proxy`                                                    |
| `pnpm start` can't find `@napi-rs/keyring`: tsdown keeps npm packages external, and pnpm is strict        | `pnpm build` + the e2e smoke test in task 8                            | Add it to `@devhub/server`'s dependencies too, the same way `fastify` is listed in both                        |
| The native module fails to load on Ubuntu CI (no D-Bus or Secret Service) and crashes the server at start | The CI e2e job; locally, the e2e smoke test still passes after task 8  | Load the library lazily on first use; a load error becomes `keychain_unavailable`                              |
| A test reads or writes the real keychain by accident                                                      | `createServer` with no `keychain` option uses memory; review checks it | Only `main.ts` passes `createOsKeychain()`; the real check has its own config and file name (`*.real.test.ts`) |
| A token leaks through an error `cause`, a log serializer or an event                                      | AC-14 runs the real server at `trace` and searches every output        | Errors carry a fixed message; the store never logs; events carry only a type                                   |
| `@napi-rs/keyring` treats "not found" differently per OS (returns null or throws)                         | Task 4 unit tests and the real check in task 5                         | The adapter maps "not found" to `null` and any other failure to `keychain_unavailable`                         |
| Spec 003's e2e would read the user's real "DevHub" item once status reads tokens                          | Not in 002: nothing reads tokens at start                              | Recorded for 003: give e2e its own keychain service name or an in-memory store                                 |
| macOS shows "node wants to use your confidential information" after a Node upgrade                        | The real check in task 5                                               | Documented in the `learn/` page; Always Allow                                                                  |

## Touches

- Packages: contracts, core, server (and root config: `.env.example`, `turbo.json`, `package.json`, `vitest.config.ts`)
- Gates that check this work: secrets, env-policy, boundaries, test-policy, specs, learn-freshness, handbook-size
- Skills to follow: `.claude/skills/integration-adapter/SKILL.md` (tokens), `.claude/skills/honest-tests/SKILL.md`, `.claude/skills/add-api-endpoint/SKILL.md` (the error code only)
