<!-- learn-sources: packages/core/src/secrets/token-store.ts packages/core/src/secrets/os-keychain.ts packages/core/src/secrets/memory-keychain.ts packages/core/src/create-server.ts apps/server/src/config.ts apps/server/src/token-notices.ts packages/core/vitest.config.ts -->

# Tokens and the keychain: where Jira, GitHub and Slack tokens live

DevHub calls Jira, GitHub and Slack with the developer's own tokens. A token is as good as a password, so it lives in the OS keychain, never in a file DevHub writes, never in the browser and never in a log line. Spec 002 built the store; specs 003, 004 and 016 save tokens into it.

## The store

`createServer()` gives the hub one store, `app.tokens` (`packages/core/src/secrets/token-store.ts`). Routes use it; nothing outside `@devhub/core` ever holds a token.

| Call                             | What it does                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.tokens.read('jira')`        | `{ token, source: 'keychain' }`, else the `.env` token as `{ token, source: 'env' }`, else `null`                                           |
| `app.tokens.save('jira', token)` | Saves to the keychain only, then publishes `status.changed`. Refuses empty tokens, whitespace and more than 4096 characters (`bad_request`) |
| `app.tokens.remove('jira')`      | Deletes the keychain's token (fine if there is none), then publishes `status.changed`                                                       |

When the keychain is locked, refuses access or does not exist, every call fails with `TokenStoreError` code `keychain_unavailable` and one fixed message: "DevHub can't reach your OS keychain. Unlock it, or turn on the .env fallback (see .env.example)." The keychain's own error is dropped, not kept as `cause`, because it could echo the token it was given, and errors end up in logs and responses. A read still succeeds when `.env` has that tool's token.

## The OS keychain

`createOsKeychain()` (`packages/core/src/secrets/os-keychain.ts`) wraps `@napi-rs/keyring`: macOS Keychain, Windows Credential Manager, or the Secret Service on Linux. Items use the service **DevHub** and the tool as the account (`jira`, `github`, `slack`). On a Mac, open Keychain Access and search for "DevHub", or list an item's details (not its secret) with:

```sh
security find-generic-password -s DevHub -a jira
```

The native library loads on the **first token call**, not when DevHub starts. Starting DevHub, the e2e run and Ubuntu CI never touch the keychain, and a machine where the library can't load (Linux without D-Bus) gets `keychain_unavailable` instead of a server that won't start. `apps/server` lists `@napi-rs/keyring` as its own dependency too: tsdown keeps npm packages out of the bundle, so the server must be able to resolve it at run time.

**The macOS prompt.** macOS lets the program that created an item read it without asking. Node is that program, so after `nvm` installs a new Node, macOS asks once: "node wants to use your confidential information stored in "DevHub" in your keychain". Choose **Always Allow**.

## The `.env` fallback (opt-in)

For a keychain that can't be used, a person can keep tokens in the repo-root `.env` instead. It is plain text, so it is off by default.

```sh
DEVHUB_TOKENS_FROM_ENV=true
DEVHUB_JIRA_API_TOKEN=…
DEVHUB_GITHUB_TOKEN=…
DEVHUB_SLACK_USER_TOKEN=…
```

- `apps/server/src/config.ts` reads `.env` with `node:util` `parseEnv`. A variable set in the shell wins over the file. Only when the switch is on does it pass the tokens to `createServer({ envTokens })`.
- The keychain's token wins over the `.env` one. DevHub never writes `.env`, so saving a token always goes to the keychain.
- `.env` is ignored by git, and the secrets gate and the pre-commit hook refuse to commit it.
- At start, `apps/server/src/token-notices.ts` prints what applies, naming settings and never their values:
  - "Tokens: OS keychain first, then .env (DEVHUB_TOKENS_FROM_ENV is on)."
  - "DEVHUB_GITHUB_TOKEN is set but not used. To use tokens from .env, set DEVHUB_TOKENS_FROM_ENV=true."
  - ".env holds tokens and other users on this computer can read it. Run: chmod 600 .env"

## Testing without the real keychain

- Core tests use `createMemoryKeychain()`, or `createUnreachableKeychain()` for a locked one. These fake an outside service, like an MSW handler; they never stand in for our own code. `createServer()` uses an empty in-memory keychain when the host passes none.
- The adapter's own tests fake `@napi-rs/keyring` with `vi.mock`.
- In `pnpm test`, `packages/core/vitest.config.ts` and `apps/server/vitest.config.ts` point `@napi-rs/keyring` at a stub that fails to load. A test that forgets to fake it gets an error instead of your real keychain, and `no-real-keychain.test.ts` proves the stub is in place. Never `vi.doUnmock` the library: the next import loads the real one.
- `pnpm test:keychain` is the one run that uses the real keychain. It saves, reads and deletes one item under the service **DevHub test**. It is never part of `pnpm test`, `pnpm verify` or CI.

Spec 003 will make `/api/status` read tokens. From then on, the e2e run needs its own keychain service or the in-memory keychain, so it never reads a developer's real "DevHub" items.
