<!-- learn-sources: packages/contracts/src/jira.ts packages/contracts/src/token.ts packages/core/src/integrations/jira/client.ts packages/core/src/integrations/jira/connection.ts packages/core/src/integrations/jira/problems.ts packages/core/src/integrations/checked-status.ts packages/core/src/integrations/connection-error.ts packages/core/src/routes/jira.ts packages/core/src/settings/settings-store.ts apps/server/src/system-certificates.ts apps/server/src/config.ts packages/app/src/features/settings/components/jira-connection-form.tsx packages/app/src/features/settings/components/jira-connection-row.tsx packages/app/src/features/settings/components/managed-connection-row.tsx packages/app/src/features/settings/components/connections-panel.tsx -->

# Connecting Jira: from the form to "Connected"

Settings › Connections › Jira takes three things: the site you open Jira at, the email you sign in with, and a personal API token. DevHub checks them with Jira before it keeps anything. Spec 003 built it; GitHub (spec 004) follows the same shape and shares its status check, its error and its row (`learn/connecting-github.md`).

## The path of one Connect

```
form (react-hook-form + the contract's schema)
  └─ PUT /api/jira/connection { site, email, apiToken? }
       └─ routes/jira.ts ─ connection.connect()
            ├─ token: the one typed, else the saved one (keychain, then .env)
            ├─ client.check() ─ GET https://<site>/rest/api/3/myself (Basic auth, 10 s)
            ├─ Jira said no? → JiraConnectionError (a ConnectionError), nothing saved
            ├─ app.tokens.save('jira', token)      → OS keychain
            ├─ settings.update({ jira: { site, email } }) → <DEVHUB_HOME>/settings.json
            └─ status.changed → every open page refetches /api/status and the Jira settings
```

- **One schema, both sides.** `JiraConnectionRequestSchema` in `@devhub/contracts` trims every field (the token rule itself is shared with GitHub, in `token.ts`), turns `your-team` or a pasted link into `your-team.atlassian.net`, and refuses anything else. The form validates with it, so a mistake shows before anything is sent. The server validates with the same schema and answers `bad_request` without calling Jira.
- **Only `*.atlassian.net`.** The email and token go to whatever site is typed, so a typo such as `atlasian.net` would hand them to a stranger. Only Jira Cloud addresses are accepted (spec 003, Q2). Custom domains wait until someone needs one.
- **Check first, then save.** The token is saved before the site and email, because the keychain is the step that fails (locked or unreachable), and then nothing has changed. A refusal from Jira leaves an existing connection exactly as it was.
- **Where messages go.** Each error takes its field's help line, so the field doesn't grow at desktop width. The "Create an API token" link sits on its own line under API token, so it stays whatever the field says, and no message gains a link it doesn't mean ("sign in on the web first" has none). On a 360 px phone, Jira's longer answers wrap one or two lines more than the help.
- **A token left empty** means "keep the one DevHub has". In Manage that is the saved keychain token. With `DEVHUB_TOKENS_FROM_ENV=true` it is `DEVHUB_JIRA_API_TOKEN` from `.env`, and only the site and email are saved.

## What each answer means

`client.ts` is the only file that talks to Jira. It turns every failure into a fixed problem, and `problems.ts` gives it the words from spec 003, Q5(c). The route answers with the code, and the form puts the message where it belongs.

| Jira, or the network, answers                                   | Problem          | HTTP / code                   | The form shows it under   |
| --------------------------------------------------------------- | ---------------- | ----------------------------- | ------------------------- |
| 401, or 200 with `X-Seraph-LoginReason: AUTHENTICATED_FAILED`   | `rejected`       | 422 `integration_rejected`    | API token                 |
| 403 with `AUTHENTICATION_DENIED` (Jira wants its CAPTCHA first) | `sign_in_needed` | 422 `integration_rejected`    | API token                 |
| 404, or a page that isn't Jira's answer                         | `not_found`      | 502 `integration_unreachable` | Jira site                 |
| No answer: DNS, TLS, a reset socket                             | `unreachable`    | 502 `integration_unreachable` | Jira site                 |
| Nothing within 10 seconds                                       | `timeout`        | 502 `integration_unreachable` | Jira site                 |
| Any other status (429, 5xx, a plain 403)                        | `jira_error`     | 502 `integration_unreachable` | Jira site                 |
| The keychain is locked or missing                               |                  | 503 `keychain_unavailable`    | one line over the buttons |

The terminal gets one warn line per failed check with the problem, for example `{ kind: 'unreachable', code: 'ENOTFOUND' }`, and one per keychain failure with spec 002's safe reason (`{ kind: 'keychain_unavailable', reason: 'Error (GenericFailure)' }`). A code is kept only when it looks like one, so a token can never pass for it. Anything unexpected while the status line is worked out (an unreadable `settings.json`) is logged and makes the row say **Error**; it never breaks `GET /api/status`.

## The status line

`GET /api/status` asks `connection.status()` for Jira's line:

- No site and email saved: **Not connected**, and the keychain is never read. A fresh DevHub, CI and the e2e run never touch it.
- Saved: DevHub reads the token and asks Jira. "Personal API token for your-team.atlassian.net" (or "API token from .env for …") when Jira accepts. Otherwise the row says **Error** with the reason, such as "The saved API token is missing from your keychain. Connect again."
- Jira is asked at most once every 2 minutes, and requests that arrive together share one check (`integrations/checked-status.ts`, which GitHub uses too). After the first check, status answers at once with the last result and re-checks behind it; if the answer changed, it publishes `status.changed`. Connect and Disconnect set the answer themselves, so nothing waits for Jira twice, and a check that was already running when either happened hands everyone waiting the newer answer.

## Your projects, for Settings › Repositories

When the add-folder form opens, `GET /api/jira/projects` asks `connection.projects()`, which reads the saved site, email and token and calls `client.projects()`: `GET /rest/api/3/project/search`, 100 a page in key order, at most 1000, each page with the full 10-second wait (spec 005). Nothing is cached; the form drops the list when it closes. Not connected answers `bad_request` ("Connect Jira in Connections to pick a project."); every other failure is one of the answers above, in the same words. A project whose key DevHub couldn't save is left out instead of failing the list.

## Keeping the token in its place

- `client.ts` hands jira.js the email and token, and jira.js builds the `Authorization: Basic base64(email:token)` header. No error from jira.js leaves `client.ts`, so nothing that held the request reaches a log or a response.
- As a second guard, the Fastify logger redacts `authorization`, `proxy-authorization`, `cookie` and `x-devhub-token` headers up to four levels deep (`create-server.ts`).
- The row's Connect, Manage and Close button is `ManagedConnectionRow`, shared with GitHub. The Connections panel keeps one form open at a time, so the page never has two primary buttons, and while any tool's Connect or Disconnect is on its way every row's button waits. "Jira is connected." is said through the panel's one polite live region, so two rows never give the page two.
- While a Connect or Disconnect is on its way, the form's Cancel and the row's Close do nothing (they stay focusable), and a second submit sends nothing, so the change always finishes where the person can see it.
- The token field asks browsers and password managers not to save it (`autoComplete="one-time-code"`, `data-1p-ignore`, `data-lpignore`), and the mutation that carries it keeps nothing in the cache (`gcTime: 0`).
- `no-token-leaks.test.ts` runs the real hub at trace level through connect, refusal, an unreachable site, status and disconnect. It finds neither the token nor its base64 value in any log line, response, event or `settings.json`.
- `settings.json` holds the site and email, GitHub's way of connecting (spec 004) and Settings' own values (spec 005), never a token. It is mode 0600 (the folder is created 0700), and is written through a temporary file and a rename, so a crash never leaves half a file. A broken file counts as empty (with a warn line) until the next save.

## Why only `jira.js/core`

`client.ts` loads `jira.js/core` with `await import()` on the first call, so starting DevHub costs nothing. It calls `/rest/api/3/myself` and `/rest/api/3/project/search` through `client.sendRequest`, each with its own small zod schema. Importing `jira.js/cloud` instead loads every Jira Cloud endpoint and its schemas: 4.6 seconds on a MacBook. Spec 007 should import only what it needs, on first use.

## A company TLS proxy

Corporate networks often re-sign HTTPS with their own root certificate (Zscaler, for example), which lives in the OS store but not in Node's. Then every call to Jira fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, and the row says "Can't reach your-team.atlassian.net". At start, `apps/server/src/system-certificates.ts` adds the OS's certificates to Node's own, which is what `node --use-system-ca` does. It works in `pnpm dev` and `pnpm start` alike, on every OS. If the row still says it can't reach Jira, the warn line in the terminal names the code.

## Testing

- `packages/core/src/test/fake-jira.ts` starts MSW as Jira Cloud for one test file. It accepts `dev@example.com` with one fake token and fails any other request, so no test reaches the internet. Core tests never start MSW globally, because the event stream test opens a real socket.
- The app's tests fake `/api/jira/connection` with `packages/app/src/test/jira.ts`.
- The e2e run sets `DEVHUB_KEYCHAIN=memory`, so it can never read your real "DevHub" keychain item. It never sends valid credentials, because there is no Jira to answer; core route tests cover the full connect with MSW.
- A fake token in a test must not look like a real one: the secrets gate refuses `ATATT` followed by 20 or more characters. Use names like `fake-token-for-tests`.
