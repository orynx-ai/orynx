<!-- learn-sources: packages/core/src/secrets/token-store.ts packages/core/src/secrets/os-keychain.ts packages/core/src/secrets/memory-keychain.ts packages/core/src/create-server.ts apps/server/src/config.ts apps/server/src/token-notices.ts apps/web/vite.config.ts packages/core/vitest.config.ts packages/core/src/agents/agent-environment.ts -->

# Tokens and the keychain: where Jira, GitHub and Slack tokens live

DevHub calls Jira, GitHub and Slack with the developer's own tokens. A token is as good as a password, so it lives in the OS keychain, never in a file DevHub writes, never in the browser and never in a log line. Spec 002 built the store; specs 003, 004 and 016 save tokens into it.

## The store

`createServer()` gives the hub one store, `app.tokens` (`packages/core/src/secrets/token-store.ts`). Routes use it; nothing outside `@devhub/core` ever holds a token. The inbox's sync (spec 007) reads tokens the same way, through each connection's `credentials()`, holds them only for that sync's requests, and writes none to `cache.db`. Tickets' sprint (spec 008) is read in that same sync with the same credentials, and its leak test checks the sprint's part of `cache.db` too.

| Call                             | What it does                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.tokens.read('jira')`        | `{ token, source: 'keychain' }`, else the `.env` token as `{ token, source: 'env' }`, else `null`                                           |
| `app.tokens.save('jira', token)` | Saves to the keychain only, then publishes `status.changed`. Refuses empty tokens, whitespace and more than 4096 characters (`bad_request`) |
| `app.tokens.remove('jira')`      | Deletes the keychain's token (fine if there is none), then publishes `status.changed`                                                       |

When the keychain is locked, refuses access or does not exist, every call fails with `TokenStoreError` code `keychain_unavailable` and one fixed message: "Orynx can't reach your OS keychain. Unlock it, or turn on the .env fallback (see .env.example)." The keychain's own error is dropped, not kept as `cause`, because it could echo the token it was given, and errors end up in logs and responses. Only its name and code survive, in `error.reason` (for example "Error (ERR_MODULE_NOT_FOUND)"), so a log can still say what went wrong; a name or code that isn't a fixed word, and so could be a token, becomes "unknown". A read still succeeds when `.env` has that tool's token.

## The OS keychain

`createOsKeychain()` (`packages/core/src/secrets/os-keychain.ts`) wraps `@napi-rs/keyring`: macOS Keychain, Windows Credential Manager, or the Secret Service on Linux. Items use the service **DevHub** (the code name: the product became Orynx on 18 Oct 2026, and the service kept its name so saved tokens stay readable) and the tool as the account (`jira`, `github`, `slack`). On a Mac, open Keychain Access and search for "DevHub", or list an item's details (not its secret) with:

```sh
security find-generic-password -s DevHub -a jira
```

The native library loads on the **first token call**, not when DevHub starts, so a machine where it can't load (Linux without D-Bus) gets `keychain_unavailable` instead of a server that won't start. Since spec 007 that first call comes soon after start when a tool is connected: the inbox's first sync reads the token, and so does each 2-minute sync while a page is open (the gh way runs `gh auth token` instead). With nothing connected, as in the e2e run and Ubuntu CI, the keychain is never touched. `apps/server` lists `@napi-rs/keyring` as its own dependency too: tsdown keeps npm packages out of the bundle, so the server must be able to resolve it at run time.

**The macOS prompt.** macOS lets the program that created an item read it without asking. Node is that program, so after `nvm` installs a new Node, macOS asks once: "node wants to use your confidential information stored in "DevHub" in your keychain". Choose **Always Allow**. Because the inbox syncs on its own, that prompt can now appear soon after DevHub starts, with no click from you; choosing Deny brings it back at the next sync, and the inbox shows the keychain line until you allow it.

**What that means for Claude sessions.** The same rule lets _any_ script run by that `node` read the "DevHub" items without a prompt: an npm postinstall script, `pnpm test` in a project, or a command Claude runs in a session worktree. The keychain protects tokens from other users and other programs, not from code you run as yourself. The agent runtime must keep Claude's commands away from these items. Spec 010 runs no command, only Claude Code's login check, so how is decided in spec 011, where sessions first run; see `.claude/skills/agent-runtime/SKILL.md`.

## The `.env` fallback (opt-in)

For a keychain that can't be used, a person can keep tokens in the repo-root `.env` instead. It is plain text, so it is off by default.

```sh
DEVHUB_TOKENS_FROM_ENV=true
DEVHUB_JIRA_API_TOKEN=…
DEVHUB_GITHUB_TOKEN=…
DEVHUB_SLACK_USER_TOKEN=…
```

- `apps/server/src/config.ts` reads `.env` with `node:util` `parseEnv`. Two settings never come from it: gh's search path is the shell's `PATH` only, and `DEVHUB_CLAUDE_CODE` (the Claude Code the e2e run swaps for a fake) is the shell's only, so a file can't decide which program DevHub starts. A variable set in the shell wins over the file, and an empty value counts as not set. Only when the switch is on does it pass the tokens to `createServer({ envTokens })`.
- Once read, `forgetTokenSettings()` deletes the three token settings from the server's own environment, so no child process (git and gh) inherits a token. gh gets the server's environment with those settings gone. Claude Code gets less: only the allow list in `packages/core/src/agents/agent-environment.ts`, built from the shell's environment, so no `DEVHUB_*` setting reaches it at all (`learn/checking-claude.md`); DevHub asks it for GitHub's token only when you chose the gh way (`learn/connecting-github.md`). Turbo does not pass them through either, so under `pnpm dev` a token set in the shell never reaches the server, Vite or Storybook: there, tokens come only from `.env`. `pnpm start` runs the server outside turbo, so a shell token does reach it.
- `apps/web/vite.config.ts` reads the same `.env` for `DEVHUB_PORT`, `DEVHUB_WEB_PORT` and `DEVHUB_HOME`, so in `pnpm dev` the proxy and the token in the page follow the server.
- The keychain's token wins over the `.env` one. DevHub never writes `.env`, so saving a token always goes to the keychain.
- `.env` is ignored by git, and the secrets gate and the pre-commit hook refuse to commit it.
- At start, `apps/server/src/token-notices.ts` prints what applies, naming settings and never their values. The `chmod` line shows whenever a readable `.env` holds a token, switch on or off:
  - "Tokens: OS keychain first, then .env (DEVHUB_TOKENS_FROM_ENV is on)."
  - "DEVHUB_GITHUB_TOKEN is set but not used. To use tokens from .env, set DEVHUB_TOKENS_FROM_ENV=true."
  - ".env holds tokens and other users on this computer can read it. Run: chmod 600 .env"

## Testing without the real keychain

- Core tests use `createMemoryKeychain()`, or `createUnreachableKeychain()` for a locked one. These fake an outside service, like an MSW handler; they never stand in for our own code. `createServer()` uses an empty in-memory keychain when the host passes none.
- The adapter's own tests fake `@napi-rs/keyring` with `vi.mock`.
- In `pnpm test`, `packages/core/vitest.config.ts` and `apps/server/vitest.config.ts` point `@napi-rs/keyring` at a stub that fails to load. A test that forgets to fake it gets an error instead of your real keychain, and `no-real-keychain.test.ts` proves the stub is in place. Never `vi.doUnmock` the library: the next import loads the real one.
- `pnpm test:keychain` is the one run that uses the real keychain. It saves, reads and deletes one item under the service **DevHub test**. It is never part of `pnpm test`, `pnpm verify` or CI.

Since spec 003, `/api/status` reads the Jira token once a site and email are saved. So:

- the e2e run sets `DEVHUB_KEYCHAIN=memory` (`apps/server/src/config.ts`), and the server keeps tokens in memory, so it never reads a developer's real "DevHub" items (it already sets `DEVHUB_TOKENS_FROM_ENV=false`, so `.env` tokens never reach it either);
- the Fastify logger redacts `authorization`, `proxy-authorization`, `cookie` and `x-devhub-token` headers, in either casing and up to five levels deep, wherever a log line carries one (`packages/core/src/create-server.ts`), behind `client.ts`, which never lets an HTTP client's error out. See `learn/connecting-jira.md`.
- the options `createServer()` gained for Settings › Repositories (spec 005), `userHome` and `dataDir`, are folder paths; no token travels with them, and the folder check reads the disk without touching the keychain.
- its `claudeCode` option (spec 010) runs Claude Code's own login check, which reads Claude Code's keychain item, never DevHub's. Left out, no program is found, so no test reads either.
