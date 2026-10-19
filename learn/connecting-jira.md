<!-- learn-sources: packages/contracts/src/jira.ts packages/contracts/src/token.ts packages/core/src/integrations/jira/client.ts packages/core/src/integrations/jira/ticket-map.ts packages/core/src/integrations/jira/adf-markdown.ts packages/core/src/integrations/jira/connection.ts packages/core/src/integrations/jira/problems.ts packages/core/src/integrations/checked-status.ts packages/core/src/integrations/connection-error.ts packages/core/src/routes/jira.ts packages/core/src/settings/settings-store.ts apps/server/src/system-certificates.ts apps/server/src/config.ts packages/app/src/features/settings/components/jira-connection-form.tsx packages/app/src/features/settings/components/jira-connection-row.tsx packages/app/src/features/settings/components/managed-connection-row.tsx packages/app/src/features/settings/components/connections-panel.tsx -->

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
- **Where messages go.** Each error takes its field's help line, so the field doesn't grow at desktop width. The "Create an API token" link (`ExternalLink`, with the arrow every link that leaves Orynx has) sits on its own line under API token, so it stays whatever the field says, and no message gains a link it doesn't mean ("sign in on the web first" has none). On a 360 px phone, Jira's longer answers wrap one or two lines more than the help.
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
- Jira is asked at most once every 2 minutes, and requests that arrive together share one check (`integrations/checked-status.ts`, which GitHub and Claude's login check use too; it compares answers by value). After the first check, status answers at once with the last result and re-checks behind it; if the answer changed, it publishes `status.changed`. Connect and Disconnect set the answer themselves, so nothing waits for Jira twice, and a check that was already running when either happened hands everyone waiting the newer answer.

## Your projects, for Settings › Repositories and Tickets

When the folder dialog opens, or Tickets shows its Project picker (spec 020), `GET /api/jira/projects` asks `connection.projects()`, which reads the saved site, email and token and calls `client.projects()`: `GET /rest/api/3/project/search`, 100 a page in key order, at most 1000, all within one 10-second wait, so the answer comes before the page's own 20-second wait gives up (spec 005). Nothing is cached; the list goes as soon as nothing on screen uses it. Not connected answers `bad_request` ("Connect Jira in Connections to pick a project."); every other failure is one of the answers above, in the same words. A project whose key DevHub couldn't save is left out instead of failing the list.

## Your issues, for Home (spec 007)

The inbox's sync asks `connection.credentials()` for the saved site, email and token. It reads settings and the keychain and never asks Jira; it answers null when Jira isn't connected, a `rejected` problem when the token is missing from the keychain, and spec 002's keychain words when the keychain can't be reached. Then `client.assigned()` makes one `POST /rest/api/3/search/jql` for your unfinished issues, oldest first, plus the priority order when one of them is a bug, within one 10-second wait. Each issue is checked on its own, so one Jira can't read is left out instead of failing the rest. An issue's link is built from the saved site, and every contract that carries one (the inbox, Tickets, search, a session) checks it with `JiraLinkSchema` from `contracts/src/jira.ts`: https, on the Jira Cloud host pattern (`jiraCloudHost`) this form checks. The answer's problems are the ones above; `map.ts` turns them into the inbox's (a refused token, a sign-in on the web, or no answer). See `learn/the-inbox.md`. Tickets (spec 008) reads the sprint in the same sync with four more calls: `mySprints()` (which asks `/myself` and the field list side by side, then your issues in active sprints), `boardColumns()`, `sprintIssues()` and `statusCategories()`. A board that's gone or hidden from you (404 or a plain 403) is an answer with no columns, not a problem. A sprint over 300 issues is cut short, and then one more search brings your own issues past the first 300. Since spec 020 you can pick the sprint, so the sync may ask instead for `account()` (`/myself` alone) with `projectSprints()` (a project's Scrum boards from the Agile API, `/rest/agile/1.0/board`, then each board's active and future sprints) or `sprint()` (`/rest/agile/1.0/sprint/{id}`), side by side, or for `issuesWithoutSprint()`, the tickets in no sprint, read as a sprint's are (`rankedIssues()`), with the project key quoted in the JQL (`project = "WEB"`) so a key that is a JQL word still reads. A sprint that's gone or hidden from you is an answer (there's no sprint to show), not a problem, and a board that's gone, hidden or keeps no sprints is skipped. Tickets' Sprint menu asks `connection.openSprints()`, which reads the token as `projects()` does and answers in the same words when it fails. Tickets' choice names one site's project and sprint, so disconnecting clears it, and so does connecting another site; reconnecting the same site keeps it. See `learn/the-tickets-board.md`.

## One issue, for a session's brief (spec 011)

When Claude starts on a ticket, the session asks `connection.credentials()` the same way, then `client.issue(request, key)` makes one `GET /rest/api/3/issue/{key}` for the summary, type and description, within the same 10-second wait. The key has already passed `JiraIssueKeySchema` (`PROJ-1423`) in the start request. It's the only read that asks for a description, and the answer is never cached or logged; it goes into the brief. `adf-markdown.ts` turns the description from Jira's document format into Markdown, never throwing on a shape it doesn't know. A failure is one of the problems above, and the session stops with it. See `learn/sessions-and-worktrees.md`.

## One issue in full, for the composer's brief and the ticket dialog (specs 015 and 022)

A Jira ticket chip in Home's composer is read when you press Send, before the session exists. `context-reader.ts` asks `connection.credentials()` as a session does, then `client.issueContext(request, key)` makes one `GET /rest/api/3/issue/{key}` with `summary,issuetype,description,comment,issuelinks`, and since spec 022 `status,priority,assignee,reporter,duedate,labels,created,updated` too. It keeps the last 20 comments, oldest first, each turned into Markdown by `adf-markdown.ts`, and each linked issue named by the link's own words from this issue's side ("blocks", "is cloned by"). An odd comment or link is left out rather than failing the ticket, and an odd field of spec 022's reads as missing. A ticket Jira hides or doesn't have is `not_found`, and the composer says so under its box with nothing made. The composer keeps only what the brief gives Claude: the summary, type, description, comments and links. See `learn/composer-and-context.md`.

The ticket dialog (spec 022) makes the same read through `GET /api/tickets/:key` and `tickets-service.detail()`, each time it opens. `ticket-map.ts` `ticketDetailOf()` turns the answer into what the page shows: the link built from the saved site, never taken from Jira, Jira's times made ISO, and the status's board column. Nothing of it is cached. See `learn/the-tickets-board.md`.

## Keeping the token in its place

- `client.ts` hands jira.js the email and token, and jira.js builds the `Authorization: Basic base64(email:token)` header. No error from jira.js leaves `client.ts`, so nothing that held the request reaches a log or a response.
- As a second guard, the Fastify logger redacts `authorization`, `proxy-authorization`, `cookie` and `x-devhub-token` headers up to five levels deep (`create-server.ts`).
- The row's Connect, Manage and Close button is `ManagedConnectionRow`, shared with GitHub. The Connections panel keeps one form open at a time, so the page never has two primary buttons, and while any tool's Connect or Disconnect is on its way every row's button waits. "Jira is connected." is said through the panel's one polite live region, so two rows never give the page two. If the saved settings never arrive, the opened row says "Could not reach the Orynx server. Check that Orynx is still running in your terminal, then reload the page." in place of a form.
- While a Connect or Disconnect is on its way, the form's Cancel and the row's Close do nothing (they stay focusable), and a second submit sends nothing, so the change always finishes where the person can see it.
- The token field asks browsers and password managers not to save it (`autoComplete="one-time-code"`, `data-1p-ignore`, `data-lpignore`), and the mutation that carries it keeps nothing in the cache (`gcTime: 0`).
- `no-token-leaks.test.ts` runs the real hub at trace level through connect, refusal, an unreachable site, status and disconnect. It finds neither the token nor its base64 value in any log line, response, event or `settings.json`.
- `settings.json` holds the site and email, GitHub's way of connecting (spec 004), Settings' own values (spec 005) and the sprint Tickets shows (spec 020), never a token. It is mode 0600 (the folder is created 0700), and is written through a temporary file and a rename, so a crash never leaves half a file. A broken file counts as empty (with a warn line) until the next save.

## Why only `jira.js/core`

`client.ts` loads `jira.js/core` with `await import()` on the first call, so starting DevHub costs nothing. It calls `/rest/api/3/myself`, `/rest/api/3/project/search` and the rest, such as spec 011's `/rest/api/3/issue/{key}`, through `client.sendRequest`, each with its own small zod schema. Importing `jira.js/cloud` instead loads every Jira Cloud endpoint and its schemas: 4.6 seconds on a MacBook. Spec 007 should import only what it needs, on first use.

## A company TLS proxy

Corporate networks often re-sign HTTPS with their own root certificate (Zscaler, for example), which lives in the OS store but not in Node's. Then every call to Jira fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, and the row says "Can't reach your-team.atlassian.net". At start, `apps/server/src/system-certificates.ts` adds the OS's certificates to Node's own, which is what `node --use-system-ca` does. It works in `pnpm dev` and `pnpm start` alike, on every OS. If the row still says it can't reach Jira, the warn line in the terminal names the code.

## Testing

- `packages/core/src/test/fake-jira.ts` starts MSW as Jira Cloud for one test file. It accepts `dev@example.com` with one fake token and fails any other request, so no test reaches the internet. Core tests never start MSW globally, because the event stream test opens a real socket.
- The app's tests fake `/api/jira/connection` with `packages/app/src/test/jira.ts`.
- The e2e run sets `DEVHUB_KEYCHAIN=memory`, so it can never read your real "DevHub" keychain item. It never sends valid credentials, because there is no Jira to answer; core route tests cover the full connect with MSW.
- A fake token in a test must not look like a real one: the secrets gate refuses `ATATT` followed by 20 or more characters. Use names like `fake-token-for-tests`.
