<!-- learn-sources: packages/contracts/src/github.ts packages/core/src/integrations/github/gh.ts packages/core/src/integrations/github/client.ts packages/core/src/integrations/github/connection.ts packages/core/src/integrations/github/problems.ts packages/core/src/integrations/checked-status.ts packages/core/src/routes/github.ts packages/core/src/settings/settings-store.ts apps/server/src/config.ts playwright.config.ts packages/core/src/test/fake-gh.ts packages/app/src/features/settings/components/github-connection-form.tsx packages/app/src/features/settings/components/github-connection-row.tsx -->

# Connecting GitHub: the gh login or a token

Settings › Connections › GitHub offers two ways to connect: **Use my gh login** or **Use a personal access token**. DevHub checks with GitHub before it keeps anything, the same way Jira does (`learn/connecting-jira.md`). Spec 004 built it.

## The path of one Connect

```
form (react-hook-form + the contract's schema)
  └─ PUT /api/github/connection { method: 'gh' } or { method: 'token', token? }
       └─ routes/github.ts ─ connection.connect()
            ├─ token: gh.ts runs `gh auth token --hostname github.com` (the gh way),
            │         else the one typed, else the saved one (keychain, then .env)
            ├─ client.check() ─ GET https://api.github.com/user (10 s): the login and X-OAuth-Scopes
            ├─ GitHub said no, or no `repo` scope? → ConnectionError, nothing saved
            ├─ token way: app.tokens.save('github', token)  → OS keychain
            │  gh way:    app.tokens.remove('github') if a token was saved before
            ├─ settings.update({ github: { method } })      → <DEVHUB_HOME>/settings.json
            └─ status.changed → every open page refetches /api/status and the GitHub settings
```

- **The gh way keeps no copy.** DevHub asks gh for the token each time it needs one and holds it only for that call (spec 004, Q2). Signing out of gh, `gh auth switch` or a refreshed login is followed at the next check, and the row names the account. DevHub never runs `gh auth login` or `logout`, and Disconnect leaves gh signed in. The gh way never touches DevHub's keychain item.
- **One way at a time.** Picking gh deletes a token saved for the token way. If the keychain is locked, that fails, and the token way stays as it was.
- **Only github.com.** The token goes only to `api.github.com`. GitHub Enterprise Server is out of scope.
- **`repo` or nothing.** A classic token, and a gh login, must have the `repo` scope, because the PRs you review are mostly in private repos, and spec 014 opens PRs (Q3). GitHub lists a classic token's scopes in `X-OAuth-Scopes`, so DevHub refuses one without `repo` at Connect. A fine-grained token sends no such header, so DevHub accepts it. A repo it can't see simply has no pull requests in the inbox's search (spec 007), as on GitHub's own search page; nothing names it. gh's default login has `repo`; `gh auth refresh --scopes repo` adds it.
- **Single sign-on can't be checked here.** A classic token must be authorized for a company's SAML single sign-on, but `GET /user` works either way. GitHub only says so when a repo is read, so the token help mentions it. The inbox's GraphQL search (spec 007) takes the pull requests that came and leaves out the ones behind single sign-on, without naming them.
- **A token left empty** means "keep the one DevHub has": the saved keychain token in Manage, or `DEVHUB_GITHUB_TOKEN` from `.env` when `DEVHUB_TOKENS_FROM_ENV=true`. Then only the way is saved.

## Finding gh

- `apps/server/src/config.ts` hands core the shell's `PATH` as gh's search path, never a `PATH` written in `.env`, so a file can't decide which program DevHub starts. `DEVHUB_CLAUDE_CODE` follows the same rule (`learn/checking-claude.md`), and so does `gitEnvironment` (spec 011): the git that makes a session's worktree gets Claude Code's short allow list from the shell, your SSH agent, and `GIT_TERMINAL_PROMPT=0`, so a fetch never waits on a password prompt (`learn/sessions-and-worktrees.md`). The computer's folder picker for Choose folder (spec 020) is looked for on the same `PATH` (`learn/settings-and-folders.md`).
- `gh.ts` looks through that path for an executable `gh` (`gh.exe` on Windows) without running it, skipping relative folders such as `.`, as gh's own lookup does. That is how the form knows to pick gh, and how `GET /api/github/connection` says `ghFound`.
- gh runs only on Connect with the gh way, or when the status check needs a token for a saved gh connection. It gets 5 seconds, then SIGKILL. Its output must be one token on one line; anything else is "failed". stderr is read only to tell "no oauth token found" (signed out) from other failures, and only the exit code is kept.
- gh must be the real program, or a wrapper that ends with `exec gh …`: the time limit stops the program DevHub started, so a wrapper that starts gh as a child of its own would leave that child running.
- DevHub looks on the PATH of the terminal that started it. If gh is installed but the form says it isn't, start DevHub from a terminal where `which gh` finds it.

## What each answer means

`problems.ts` says each problem in Q6's words, for the way that was used. The route answers with the code, and the form puts the message where it belongs.

| What happened                                                 | Problem                     | HTTP / code                   | The form shows it under   |
| ------------------------------------------------------------- | --------------------------- | ----------------------------- | ------------------------- |
| No gh on the path                                             | `gh_missing`                | 422 `integration_rejected`    | the choices               |
| gh has no login for github.com                                | `gh_signed_out`             | 422 `integration_rejected`    | the choices               |
| gh failed another way, printed more than a token, or took 5 s | `gh_failed`, `gh_timeout`   | 422 `integration_rejected`    | the choices               |
| 401, or a 403 that isn't the rate limit                       | `rejected`                  | 422 `integration_rejected`    | the token, or the choices |
| `X-OAuth-Scopes` without `repo`                               | `no_repo_scope`             | 422 `integration_rejected`    | the token, or the choices |
| 429, or 403 with `X-RateLimit-Remaining: 0`                   | `rate_limited` (reset time) | 502 `integration_unreachable` | one line over the buttons |
| No answer, or a page that isn't GitHub's (a Wi-Fi sign-in)    | `unreachable`               | 502 `integration_unreachable` | one line over the buttons |
| Nothing within 10 seconds                                     | `timeout`                   | 502 `integration_unreachable` | one line over the buttons |
| Any other status (5xx)                                        | `github_error`              | 502 `integration_unreachable` | one line over the buttons |
| The keychain is locked or missing (the token way only)        |                             | 503 `keychain_unavailable`    | one line over the buttons |

octokit reports a failed fetch as status 500 with no `response`, so `client.ts` tells the network from a real 500 by whether GitHub answered. A timeout shows up as the request's own `AbortSignal` having fired.

## The status line

- No way saved: **Not connected**. gh never runs and the keychain is never read.
- Saved: DevHub gets the token the saved way, asks GitHub, and names the account: "Signed in as octocat with the gh command-line tool", "Personal access token for octocat", or "Token from .env for octocat". Otherwise the row says **Error** with the reason, such as "The saved token is missing from your keychain. Connect again."
- GitHub is asked at most once every 2 minutes through `integrations/checked-status.ts`, the same code as Jira's and Claude's login check (spec 010): one check shared by everyone asking, the last answer while a re-check runs, and `status.changed` when the line changes. Jira and GitHub run side by side, so the first `/api/status` waits for the slower one.

## Your pull requests, for Home (spec 007)

The inbox's sync asks `connection.credentials()` for a token: gh's for the gh way (running gh, never asking GitHub), the saved one for the token way. Null means GitHub isn't connected; a token missing from the keychain is a `rejected` problem; a signed-out gh or a locked keychain keeps the words from specs 002 and 004. Then `client.inbox()` sends one GraphQL query to `api.github.com/graphql` with the same octokit settings as Connect (no redirects, 10 seconds, the token in the header only). GraphQL's own `RATE_LIMITED` error reads as a rate limit with GitHub's reset time. The query's limits keep it to about 24 points a sync, because GitHub prices by the most nodes a query could return; the sum sits next to the query. A pull request's link must be https on github.com, or it isn't kept. See `learn/the-inbox.md`.

## Opening pull requests (spec 014)

Create pull request is the one thing Orynx writes to GitHub, and only on your press. The session's git pushes the branch with your own git login (`learn/sessions-and-worktrees.md`); then `client.ts` opens the PR with the token `connection.credentials()` gives, the same way the inbox reads:

- `openPull()` is `POST /repos/{owner}/{repo}/pulls` with the head, the base, your title and your description. A 422 that says "already exists" is `exists`, and Orynx then links that open PR (`findOpenPull()`, `GET …/pulls?head=owner:branch&state=open`) as it is. A 422 that says "No commits between" is `no_commits`.
- A 403 with `X-GitHub-SSO` is `sso`, with GitHub's own link to authorize the token, kept only when it's https on github.com. Any other 403, or the 404 GitHub gives for a repository the account can't see, is `forbidden`. The rate limit, a refused token, the network and the 10-second limit read as for the other calls.
- `defaultBranch()` (`GET /repos/{owner}/{repo}`) names the base when the session's own wasn't on origin.
- A PR's `html_url` must be https on github.com (`GitHubLinkSchema`, which lives in `contracts/github.ts` beside `GitHubRepositorySchema` from spec 014), or the answer reads as not GitHub's.

A classic token or gh login with `repo` can open PRs (spec 004, Q3). A fine-grained token needs Pull requests: write on the repository, or GitHub answers 403 and the dialog says the account can't open pull requests there.

## Keeping the token in its place

- `client.ts` hands octokit the token and names `https://api.github.com` itself, and octokit sends `Authorization: token …`. Redirects are refused, so the header can't follow one to another host. No octokit error leaves `client.ts`, and octokit's own logger is silenced, so it never writes a request to the terminal. Every request names itself `Orynx` (the user agent), and the "Create a token" link names the new token Orynx too. That link, like every link that leaves Orynx, is `@devhub/ui`'s `ExternalLink`: its arrow, and a highlight and underline on hover.
- `gh.ts` is the only file that sees gh's output. A failure keeps only the exit code.
- `settings.json` gets only `{ "github": { "method": … } }` from GitHub. Each save changes its own key and keeps the rest as written: Jira's site and email, Settings' own values (spec 005) and the sprint Tickets shows (spec 020), even ones this version can't read.
- The Fastify logger's `authorization` redaction is the second guard, as for Jira.
- `no-token-leaks.test.ts` runs the real hub at trace level through both ways, every kind of failure, status and disconnect, and finds neither token nor gh's output in any log line, response, event or `settings.json`.

## Testing

- `packages/core/src/test/fake-github.ts` starts MSW as `api.github.com` for one test file, accepting two fake tokens for `octocat`.
- `packages/core/src/test/fake-gh.ts` gives each test a folder with a `gh` that DevHub finds and runs like the real one. Each `gh` is a symlink to one shared script, `fake-gh/gh`, which reads what to do from `behaviour.sh` in the folder and logs its arguments. macOS checks every new program the first time it runs, one at a time, about 0.2 s each: with a fresh script per test, a parallel run made gh wait past its timeout.
- `createServer()` without a `gh` gets one with an empty search path, so no core test can start your real gh.
- The e2e run puts `e2e/fake-gh/` first on the server's `PATH` (`playwright.config.ts`), for all six of its hubs, and names a fake Claude Code the same way with `DEVHUB_CLAUDE_CODE`. That gh is always signed out, so the e2e run never reads your gh login, and a press of Connect GitHub never reaches github.com. The second hub, which Home's spec uses, connects GitHub the token way instead, against GitHub faked inside its process (`e2e/fake-tools/preload.ts`). The third, on port 4396, runs sessions (spec 011), the fourth, on port 4394, approvals (spec 012), the fifth, on port 4392, a session's changes and follow-ups (spec 013), and the sixth, on port 4390, pull requests (spec 014), each with the same fakes and its own data folder. The sixth's fake GitHub opens and lists pull requests into the spec's list, which `GET /tools` on its control port gives back, and its `HOME` is a folder of the run's, so its git never reads your `~/.gitconfig`. Each hub's fakes take what the tools hold on the port below the hub's (`controlPortFor`), so the hubs run side by side. The config refuses to start the run if the fake can't run (Windows, or no executable bit) or a `node_modules/.bin/gh` would come before it, rather than fall back to your real gh.
