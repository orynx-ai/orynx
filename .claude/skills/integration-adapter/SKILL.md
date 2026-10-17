---
name: integration-adapter
description: Use when connecting DevHub to Jira, GitHub or Slack, or changing what DevHub reads from or writes to them (inbox rules, tickets, PRs, mentions). Forbids storing or logging tokens outside the OS keychain, mapping Jira by status name, network calls outside the integration's client.ts, and faking our own modules in tests.
---

# How to build an integration

Each integration is a small adapter inside `packages/core`. It uses the developer's own account, so DevHub can never see more than that person already can. Read the Integrations and Security sections of `docs/product/spec.md` first.

## Folder

```
packages/core/src/integrations/<tool>/
├── client.ts       thin wrapper over the official SDK; the only file that talks to the network
├── problems.ts     each failure in the words the user sees (pure)
├── connection.ts   connect (check, then save), disconnect, and the tool's status line
├── map.ts          outside shapes → @devhub/contracts shapes (pure)
├── rules.ts        "needs you" rules for the inbox (pure)
└── *.test.ts
```

Jira (spec 003) is the worked example: read `packages/core/src/integrations/jira/` and `learn/connecting-jira.md` before building GitHub or Slack.

| Tool   | SDK (planned, see `docs/architecture.md`) | Connects with                                                |
| ------ | ----------------------------------------- | ------------------------------------------------------------ |
| Jira   | `jira.js`                                 | site + email + personal API token                            |
| GitHub | `@octokit/rest`                           | the `gh` CLI login, or a personal access token               |
| Slack  | `@slack/web-api`                          | user token (`search:read`, `channels:history`, `im:history`) |

Adding the SDK is part of that integration's spec. Any other library: stop and ask.

## Steps

1. **Contract first.** Add the shapes the app sees (inbox item, ticket, PR) to `@devhub/contracts`. See `.claude/skills/add-api-endpoint/SKILL.md`.
2. **Tokens.** Read and write tokens only through `app.tokens` (`packages/core/src/secrets/token-store.ts`, spec 002): `read(tool)` gives the token and whether it came from the keychain or `.env`, `save` and `remove` go to the OS keychain. Turn a `TokenStoreError` into an `ApiError` with its `code` (`keychain_unavailable` or `bad_request`). A token is never written to disk in plain text, never sent to the browser, never put in an error message, and never logged. `.env` is an opt-in fallback only. See `learn/tokens-and-keychain.md`.
3. **client.ts.** Wrap the SDK, and load it with `await import()` on first use, never at start (`jira.js/cloud` alone takes 4.6 s to load; import the smallest entry point that works). Return a typed result, never the SDK's error: turn each failure into a fixed problem (`rejected`, `sign_in_needed`, `not_found`, `unreachable` with a code that passes a fixed-word check, `timeout`, `<tool>_error` with its status). Nothing that held the request may leave the file. Wait at most 10 seconds.
4. **Connecting.** Check the credentials with the tool before saving anything, then save the token (the keychain is what fails) and then the non-secret settings in the settings store (`packages/core/src/settings/settings-store.ts`, `<DEVHUB_HOME>/settings.json`). Refused credentials answer 422 `integration_rejected`; an address or network problem answers 502 `integration_unreachable`. Both carry the problem's message.
5. **map.ts.** Map outside data to contracts. Jira status is mapped by **status category** (To do, In progress, Done), never by status name, because teams name statuses differently. Make the acceptance-criteria field configurable.
6. **rules.ts.** One pure function per inbox rule from the spec's "What counts as needs you" table. Each rule returns the reason text with the wait ("Review · 2 d", "No reply · 3 h"). Each rule can be switched off in Settings › Inbox rules.
7. **Cache.** Results go to the SQLite cache (`~/.devhub/cache.db`, planned with better-sqlite3 + drizzle) and refresh every 2 minutes. Store titles and metadata, not full Slack history.
8. **Status.** Report the connection state through `StatusSchema.integrations.<tool>` (`connected`, `not_connected`, `needs_admin_approval`, `error`) and publish `status.changed` on the event bus when it changes. Read the keychain only once the tool is set up, ask the tool at most once every 2 minutes, share one check between callers, and answer with the last result while re-checking.

## When a tool is down or not connected

The tool's tab and rows show a single line, and the rest of DevHub keeps working:

> GitHub is not connected. Connect it in Settings.

Never throw from a route because one integration failed. Return the other sources.

## What DevHub may write

| Tool   | Writes in v1                                                                            |
| ------ | --------------------------------------------------------------------------------------- |
| Jira   | A new issue, from a board column's + button                                             |
| GitHub | Push the session branch and open the PR, only after the user clicks Create pull request |
| Slack  | Nothing (Reply opens Slack)                                                             |

Any other write: stop and ask.

## Testing

- `map.ts` and `rules.ts` are pure: test them fully with plain data, including the edge cases from the spec (high-priority bug, unresolved comments, 2 h Slack wait).
- `client.ts` is tested with MSW faking the tool's HTTP API (`packages/core/src/test/fake-jira.ts` shows how; start MSW per file, never globally, because the event stream test opens a real socket). Never `vi.mock` the SDK wrapper or any of our modules.
- Every integration needs a leak test like `integrations/jira/no-token-leaks.test.ts`: the real hub at trace level, searched for the token and the header value built from it.
- Fake tokens must not look real (the secrets gate refuses them): `fake-token-for-tests`, not `ATATT3x…`.
- Route tests use `app.inject()` with MSW for the outside API and a temp `DEVHUB_HOME`.

## Don't

- Don't `console.log` a request with headers, or a token.
- Don't call the network from `map.ts`, `rules.ts`, routes or services; only `client.ts` does.
- Don't match Jira statuses by name.
- Don't let one integration's error break the inbox.

## Checked by

`pnpm gate secrets` · `pnpm gate boundaries` · `pnpm test packages/core` · the security-auditor agent during `/review` when `packages/core` changes
