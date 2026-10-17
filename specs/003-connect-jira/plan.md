# Plan: Connect Jira

Spec: `specs/003-connect-jira/spec.md`

## Order of work

1. **Contracts.** Add the two error codes and the Jira connection shapes:
   - the site field, which turns `your-team` or a pasted link into `your-team.atlassian.net`;
   - the request, with an optional token;
   - the response: site, email, and whether `.env` holds a token.

   The server validates with them and the form reuses the request schema, so each rule lives in one place.

2. **`@devhub/ui`.** Add `pending` to Button and build Input and Field, each with a story and a test. They don't depend on the server, and the form needs both.
3. **Core, the settings file.** A small store for `<DEVHUB_HOME>/settings.json`, with mode 600, written to a temporary file and then renamed. `createServer` takes it as an option and uses an in-memory store by default, the way it treats the keychain and sessions. Existing tests stay unchanged, and only `main.ts` passes the real file.
4. **Core, the Jira client.** `client.ts` wraps jira.js. It is the only file that calls Jira:
   - it builds the Basic auth header, calls `GET /rest/api/3/myself`, and waits at most 10 seconds;
   - it turns every failure into a fixed outcome: rejected, sign-in needed, no Jira there, unreachable, timeout, or a Jira error with its status;
   - nothing from jira.js's errors travels further.

   Tests fake Jira with MSW.

5. **Core, the connection service.** Connect checks first, then saves the token and the site and email. Disconnect removes all three. Read never touches the keychain. Then the status line:
   - it reads the keychain only when a site and email are saved;
   - checks run at most once every 2 minutes and share one in-flight call;
   - after the first check, status answers at once with the last result while a re-check runs, and publishes `status.changed` if the answer changed.

   Tests fake the clock and Jira.

6. **Core, routes and wiring.**
   - `GET`, `PUT` and `DELETE /api/jira/connection`, each a thin handler over the service. Our error codes map to HTTP: 400, 422, 502, and 503 for the keychain.
   - The status service asks the connection service for Jira's line.
   - Pino redacts `authorization` headers.
   - The AC-15 leak test runs the real server at trace level and searches for both the token and its base64 Basic auth value.
7. **Server host.**
   - `DEVHUB_KEYCHAIN=os|memory` in `config.ts` and `.env.example`, set to `memory` in Playwright's server env.
   - `main.ts` passes the settings file under `DEVHUB_HOME`.
   - The server starts with `--use-system-ca` in both `pnpm dev` and `pnpm start`.
8. **API client.** Endpoint functions that parse with the contracts, `ApiClient` methods, and a query key. `status.changed` also invalidates the Jira connection query, so a second tab follows (AC-14).
9. **App.** The Jira row's Connect, Manage and Close button opens the form inside the row:
   - react-hook-form with the contract's request schema;
   - a mutation whose server errors land on the right field by code;
   - a polite live region for "Jira is connected." and "Jira is disconnected.";
   - then Manage's filled-in form, the `.env` help, and Disconnect with its confirm step inside the form.
10. **e2e.** Settings with the form open at 360 and 1280 px, in light and dark. Client-side errors, Cancel returning focus, and no layout shift. The e2e run never submits valid values, because there is no Jira to answer.
11. **Docs.**
    - A `learn/` page on connecting Jira, covering the API token, why only atlassian.net, the certificate setting and what each row line means.
    - `docs/architecture.md`: jira.js decided, `settings.json`, `DEVHUB_KEYCHAIN`, `--use-system-ca`.
    - The integration-adapter skill: the outcome codes.
    - `docs/design-map.md`: Input and Field built, Button `pending`.
    - The forms skill: Input exists now.
    - The roadmap: Q1 moves the reads to 007 and 008.
12. **By hand, with your yes (Q6).** You connect your real Jira in `pnpm dev`, and I run `pnpm test:keychain` once. Then `/review`.

## Risks

| Risk                                                                                                                            | How we will notice early                                                                                                                     | What we do                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jira.js puts the request headers, and so the Basic auth value, on its errors, and one reaches a log or a response               | The client tests in task 6 throw every failure and search the error for the token and its base64. AC-15 searches every output at trace level | `client.ts` never rethrows a jira.js error. It returns our outcome with a fixed message, and logs at most the error's name and code. Pino `redact` is the second guard |
| jira.js 6 doesn't use `fetch`, so MSW can't see its calls                                                                       | The first test in task 6 fails with a real network error instead of the MSW answer                                                           | Stop and ask. The choices are a different jira.js option, or a small `fetch` client without jira.js, which would need your OK to drop a planned library                |
| A company TLS proxy makes every Jira call fail with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`                                         | Your by-hand check in task 17. The server logs the error code at warn                                                                        | `--use-system-ca` on the server's `node` command, in dev and start. The `learn/` page names the error                                                                  |
| `/api/status` waits up to 10 s on Jira, so the sidebar footer and Settings show "Checking" for that long                        | A route test with fake timers. The shell's CLS e2e still passes                                                                              | Only the first check after start waits. Later ones answer with the last result and re-check behind it. The 10 s timeout caps the worst case                            |
| The e2e run or a test reads your real keychain once status can read tokens                                                      | AC-18; the no-real-keychain guard from spec 002 still throws in core and server tests                                                        | Status reads the keychain only when a site and email are saved. e2e uses `DEVHUB_KEYCHAIN=memory`. Tests use the in-memory store by default                            |
| `shadcn add input` fails behind the corporate proxy                                                                             | The task 4 command errors with a certificate message                                                                                         | `NODE_OPTIONS=--use-system-ca`, or write the shadcn source by hand. It is about 20 lines                                                                               |
| The form inside the row breaks "no box inside a box", or the row jumps when the form opens or the check finishes                | The design-reviewer in `/review`. The e2e CLS check runs with the form open                                                                  | No border around the form: it shares the row. The busy button keeps its width. Errors replace the help line instead of adding one                                      |
| Design system 1.1, with the Clean UI sizes, sits on the unmerged `feat/clean-ui-answers`, so this branch still has the 1.0 text | Already known                                                                                                                                | Build to the Clean UI skill and the 1.1 text (Input 40 px). Rebase if `feat/clean-ui-answers` merges first                                                             |
| Two Connect presses or two tabs write `settings.json` at once                                                                   | AC-13 (one request per click). Settings file test with two writes                                                                            | The busy button blocks a double press. Writes go through one queue in the store. Last write wins between tabs                                                          |
| Coverage drops under 90%                                                                                                        | `pnpm test` with coverage after each core and app task                                                                                       | Test every outcome in `client.ts` and every branch in the service. Exclude nothing new                                                                                 |

## Touches

- Packages: contracts, ui, core, api-client, app, server. Also root config (`.env.example`, `playwright.config.ts`, `package.json` scripts), `e2e/`, `learn/` and `docs/`.
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, test-policy, env-policy, secrets, specs, learn-freshness, handbook-size, plus Storybook a11y
- Skills to follow:
  - `.claude/skills/integration-adapter/SKILL.md`
  - `.claude/skills/add-api-endpoint/SKILL.md`
  - `.claude/skills/add-ui-component/SKILL.md`
  - `.claude/skills/forms/SKILL.md`
  - `.claude/skills/server-state/SKILL.md`
  - `.claude/skills/build-a-screen/SKILL.md`
  - `.claude/skills/clean-ui/SKILL.md`
  - `.claude/skills/honest-tests/SKILL.md`
