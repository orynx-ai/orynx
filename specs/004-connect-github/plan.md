# Plan: Connect GitHub

Spec: `specs/004-connect-github/spec.md`

## Order of work

1. **Contracts.** The GitHub connection shapes, so the server and the form refuse the same values:
   - the request: `{ method: 'gh' }` or `{ method: 'token', token? }`, with the token rule from 002 in GitHub's words;
   - the saved method, and the answer to GET and PUT: `saved`, `envToken` and `ghFound`;
   - the path `/github/connection` and a test builder.
2. **`@devhub/ui`.** `ChoiceGroup` (a fieldset with a legend, help or an error) and `ChoiceCard` (the design system's `dh-choice`: a native radio, a title and a detail line), each with stories and a test. They depend on nothing else, and the form needs them. Then Settings › Appearance moves onto them with no visible change (Q4 d).
3. **Core, gh.** `integrations/github/gh.ts` is the only file that starts gh:
   - it finds `gh` by looking through the search path the host passes, without running it;
   - it runs `gh auth token --hostname github.com` from that path, waits at most 5 seconds, and turns every failure into a fixed problem: missing, signed out, failed, or too slow. Only the exit code is kept.

   Tests start a small fake `gh` script written to a temp folder, never the real one.

4. **Core, the GitHub client.** `client.ts` wraps `@octokit/rest`, loaded on the first call. It is the only file that calls GitHub:
   - it calls `GET /user` and returns the login, plus the scopes from `X-OAuth-Scopes` (null when the header is absent, as with a fine-grained token);
   - every failure becomes a fixed problem: rejected, rate limited (with the reset time), unreachable, timeout, or a GitHub error with its status;
   - nothing from octokit's errors travels further.

   `problems.ts` holds the Q6 (c) wording, by problem and by way of connecting. Tests fake GitHub with MSW.

5. **Core, the shared status check.** Jira's "ask at most every 2 minutes, share one check, answer with the last result while re-checking" logic moves out of `jira/connection.ts` into `integrations/checked-status.ts`, unchanged, so GitHub uses the same code. Jira's tests stay as they are and must pass untouched.
6. **Core, the connection service.** `github/connection.ts`:
   - Connect checks first, then saves. The gh way runs gh and never touches the keychain. The token way uses the pasted token, else the saved one, else `.env`. A classic token without `repo` is refused (Q3).
   - Picking gh deletes a saved token. Disconnect removes the token, if any, and the setting, and leaves gh alone.
   - Read never runs gh or reads the keychain.
   - The status line runs gh or reads the keychain only when a way is saved, and names the account (Q5).

   `settings.json` gains the `github` key.

7. **Core, routes and wiring.** `GET`, `PUT` and `DELETE /api/github/connection`, each a thin handler over the service, with the same error codes to HTTP as Jira. `createServer` takes a `gh` option, and without it gh is never found, so no core test can run the real one. The status service asks the service for GitHub's line. Then the trace-level leak test for the gh token and a pasted token (AC-17).
8. **Server host.** `config.ts` passes the built-in `PATH` as gh's search path. `main.ts` builds the real gh runner. Playwright puts `e2e/fake-gh/` first on the server's PATH, holding a `gh` script that is always signed out (AC-20).
9. **API client.** Endpoint functions that parse with the contracts, `ApiClient` methods, and a query key.
10. **App.**
    - The Jira row's Connect, Manage and Close button, focus return and announcement move into a shared row, and Jira's tests pass untouched.
    - The GitHub row then uses that row with its own form: the two choices (gh picked when found), the token field only for the token way, and server errors placed by code and way.
    - Manage fills the form in. The `.env` help, Disconnect with its two confirm lines, and `status.changed` refreshing the GitHub query.
11. **e2e.** The GitHub form at 360 and 1280 px, in light and dark:
    - axe, contrast included;
    - no layout shift;
    - arrow keys between the choices, and Cancel returning focus;
    - the token way's client errors;
    - the gh way against the fake, signed-out gh, whose message shows under the choices with no call to github.com.
12. **Docs.**
    - A `learn/` page on connecting GitHub: the two ways, why `repo`, single sign-on, PATH, and what each row line means.
    - `docs/architecture.md`: `@octokit/rest` decided, gh's runner.
    - The integration-adapter skill: GitHub's problems and the fake gh.
    - `docs/design-map.md`: Choice card built.
    - The roadmap: Q1 moves the PR reads to 007.
13. **By hand (Q7).** You connect your real GitHub in `pnpm dev`, the gh way. Then `/review`.

## Risks

| Risk                                                                                                                | How we will notice early                                                                                             | What we do                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| octokit puts the request, and so the `authorization` header, on its errors, and one reaches a log or a response     | The client tests throw every failure and search the result for the token. AC-17 searches every output at trace level | `client.ts` never rethrows an octokit error. It returns our problem with a fixed message, keeping at most a fixed-word error code. Pino's `authorization` redaction is the second guard |
| octokit doesn't call global `fetch`, so MSW can't see it                                                            | The first client test gets a real network error instead of MSW's answer                                              | Pass `request.fetch` explicitly. If that fails too, stop and ask                                                                                                                        |
| A network failure and a real GitHub 500 look alike, because octokit reports both as status 500                      | A client test for each: `HttpResponse.error()` and a 500 answer                                                      | A failure with no `response` is unreachable or a timeout; one with a response is a GitHub error                                                                                         |
| `@octokit/rest` is slow to import, as `jira.js/cloud` was                                                           | Time `import('@octokit/rest')` when it is added                                                                      | Loaded on the first call only. If it is over a second, use `@octokit/core` (a dependency of `@octokit/rest`) and say so in architecture.md                                              |
| A core test or the e2e run starts your real gh and reads your gh token                                              | AC-20. A core test proves `createServer` without `gh` never finds one. e2e has a fake `gh` first on PATH             | Core's default gh has an empty search path. Tests pass a temp folder with a fake script. The e2e fake is always signed out, so even a press of Connect GitHub never reaches github.com  |
| gh hangs, for example on a keychain prompt, or prints more than the token                                           | gh tests with a sleeping script and one that prints two lines                                                        | 5 seconds, then SIGKILL. The output must be one line with no spaces, or it is "failed"                                                                                                  |
| The server's PATH differs from your shell's, so gh isn't found                                                      | Your by-hand check in Q7                                                                                             | The form says gh wasn't found and offers the token way. The `learn/` page says DevHub looks on the PATH of the terminal that started it                                                 |
| The first `/api/status` waits for gh (5 s) plus GitHub (10 s)                                                       | A status test with a slow gh and fake timers                                                                         | Only the first check after start waits, and Jira and GitHub run side by side. Later checks answer with the last result                                                                  |
| Moving Jira's check and row into shared code breaks Jira                                                            | Jira's existing tests and e2e must pass untouched in tasks 6 and 13                                                  | Move the code, then change nothing else in the same commit                                                                                                                              |
| A fieldset with `role="radiogroup"`, `aria-invalid` and `aria-describedby` trips axe, or the legend stops naming it | The ChoiceGroup story with an error (Storybook a11y `test: "error"`) and its test by role and name                   | Name it with `aria-labelledby` pointing at the legend, and keep the error tied through `aria-describedby`                                                                               |
| The cards make the row jump at 360 px when the check finishes or an error replaces the help                         | The e2e layout-shift and "keeps its place" checks with the form open                                                 | Errors replace a line rather than adding one. The busy button keeps its width                                                                                                           |
| The rate-limit time depends on the computer's locale or time zone                                                   | The problems test with a fixed reset time                                                                            | Always the local time as 24-hour `HH:MM`, built by hand, not with `toLocaleTimeString`                                                                                                  |
| Coverage drops under 90%                                                                                            | `pnpm test` with coverage after each core and app task                                                               | Test every problem in `gh.ts` and `client.ts` and every branch of the service. Exclude nothing new                                                                                      |

## Touches

- Packages: contracts, ui, core, api-client, app, server. Also `playwright.config.ts`, `e2e/`, `learn/`, `docs/` and `.claude/skills/`.
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, test-policy, env-policy, secrets, specs, learn-freshness, handbook-size, plus Storybook a11y.
- Skills to follow:
  - `.claude/skills/integration-adapter/SKILL.md`
  - `.claude/skills/add-api-endpoint/SKILL.md`
  - `.claude/skills/add-ui-component/SKILL.md`
  - `.claude/skills/forms/SKILL.md`
  - `.claude/skills/server-state/SKILL.md`
  - `.claude/skills/build-a-screen/SKILL.md`
  - `.claude/skills/clean-ui/SKILL.md`
  - `.claude/skills/honest-tests/SKILL.md`
