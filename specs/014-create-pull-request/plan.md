# Plan: Create pull request

Spec: `specs/014-create-pull-request/spec.md`

## Before the first task

013 merged on 18 Oct 2026 (PR #21), and this branch is rebased onto that `main` (`1bda33c`). The spec's answers fit what 011 to 013 built, at these hand-over points:

- `SessionStateSchema` already has `pr_open`, and `SessionItem` and `AgentChip` already draw it ("PR open", the branch icon). Nothing sets it yet.
- `SessionStepSchema` already has `pull_request`. Nothing moves the stepper there, and `resumeProgress()` moves only Review back to Build.
- A finished turn always sets `done` (`session-service.ts`, the `work` event).
- `StoredSession` keeps `startCommit`, and 013's `ChangesReader` lists the changed files with their counts and reads one file's diff as `DiffLine`s. The draft reuses both, so 014 adds no diff code of its own.
- `GitHubConnection.credentials()` gives the inbox's token: gh's for the gh way, the saved one for the token way. `client.ts` has only `check()` and `inbox()`.
- The adapter runs one kind of query: a session, with tools, a sandbox and `canUseTool`.
- `session-service.ts` is 952 lines. The pull-request work goes in a module of its own that the service wires in.
- The title row (`session-header.tsx`) shows Stop Claude while Claude works and nothing otherwise. Discard sits under the Changes tab (`changes-panel.tsx`).

## Order of work

Today a session ends at Done, with Claude's changes in its worktree. This spec adds the one way out: a dialog with Claude's draft, then a commit, a push to `origin` and a PR on GitHub, and later pushes to the same PR.

1. **Contracts** (tasks 1 to 3).
   - The session gains `pullRequest` (number, link, repository, opened at), null by default so a 013 session still reads.
   - Two new steps: `pull_request` (number, link, files committed, branch, whether Orynx linked a PR that was already open) and `pushed` (number, link, files committed).
   - `pull-requests.ts` holds the bodies.
     - `PullRequestDraftAnswer`: either a draft (title, body, whether Claude wrote it, how many files Orynx will commit, the branch, the repository, the base) or `cannot` with Q11c's reason.
     - `CreatePullRequestRequest`: the title trimmed to 1–256 characters, the body at most 65,536.
     - `CreatePullRequestAnswer`: `opened` (number, link, linked), `cannot`, or `failed` with a problem. A problem can carry the secret file's path, GitHub's single sign-on link, or the rate limit's reset time.
     - The same shape for Push changes: a draft message or `nothing_new`, `{ message }` trimmed to 1–256 characters, then `pushed`, `nothing_new`, `cannot` or `failed`.
   - Answers are 200 with a result, as 013's `cannot_send` is. Paths go in `routes.ts`.
2. **Pure pieces in core** (tasks 4 to 6), each tested as a table.
   - `github-remote.ts`: owner and name from a github.com remote, in https, `git@github.com:` and `ssh://` forms, with or without `.git`. A user name or password in the address is dropped. Anything else isn't on github.com: GitHub Enterprise, GitLab, an SSH host alias, a local path.
   - `secret-files.ts`: Q6's names.
   - `pull-request-text.ts`:
     - the prompt from Q4's inputs, with the 2,000-line cap and the template cut at 10,000 characters;
     - reading Claude's answer: the title on its first line, a blank line, then the description. A leading `#` or quotes are taken off the title;
     - the key put in front of the title, and the Jira line added to the description (Q5);
     - the fallback draft from the ticket and Claude's last summary (AC-6);
     - the `Co-Authored-By` trailer.
3. **git for the push** (tasks 7 to 9): `branch-git.ts`, on real temporary repositories with the bare `origin` from `test/git-repository.ts`.
   - Every call has hooks off (`core.hooksPath=/dev/null`) and uses `gitEnvironment()` with `LC_ALL=C`, so git's English messages can be told apart, and a time limit.
   - Reads, which write nothing:
     - the origin address as configured and as git expands it, taking whichever is on github.com;
     - the uncommitted files (`diff --name-only HEAD` with `diff.autoRefreshIndex=false`, plus `ls-files --others --exclude-standard`);
     - the new files since the start, for the secret check;
     - the branch's commit subjects and the base's last 20;
     - the PR template, only as a regular file inside the worktree.
   - Commit: `add -A`, then a commit with your identity and signing as your git settings have them. No identity and a failed signature each have their own problem.
   - Push: `push origin refs/heads/<branch>:refs/heads/<branch>`, never forced, 2 minutes. git's output is read only to name the problem (`auth`, `rejected`, `timeout`, `failed`), then dropped, because it can hold the remote's address with a password. The pushed commit id comes back, and up to date is its own answer.
4. **GitHub** (task 10). `client.ts` gains three calls, with MSW handlers in `test/fake-github.ts` and the token-leak test extended.
   - `openPull()`: `POST /repos/{o}/{r}/pulls`. A 422 "already exists" is `exists`, a 422 "No commits between" is `no_commits`, a 403 with `X-GitHub-SSO` is `sso` with GitHub's link (https on github.com only), and any other 403 or a 404 is `forbidden`.
   - `findOpenPull()`: by `head=owner:branch`.
   - `defaultBranch()`: for a base that wasn't on `origin`.
5. **The draft call** (task 11). `AgentAdapter.write(prompt, instructions)` runs a query with no tools:
   - `tools: []`, `maxTurns: 1` and `persistSession: false`, so nothing joins `~/.claude/projects/`;
   - `settingSources: []`, hooks off, `strictMcpConfig`, the allow-listed environment, an empty temporary folder as its `cwd`, and a `canUseTool` that refuses everything;
   - 60 seconds, then it's interrupted and closed.

   It answers with the text, or the problem kind (`login`, `limit`, `timeout`, `other`). The answer is plain text, not the SDK's `outputFormat`, because structured output rides on a tool, and this call has none (see Risks).

6. **The session** (tasks 12 to 16).
   - Progress gains the two steps and moves the stepper to Pull request. `resumeProgress()` moves Pull request back to Build too.
   - `StoredSession` keeps the commit Orynx last pushed.
   - `pull-requests.ts` in `sessions/`:
     - `draft()` changes nothing and sends no event;
     - `create()` runs one at a time for each session: the secret check, then commit, push, then find or open the PR, then save;
     - `draftPush()` and `push()` work from the last pushed commit.
   - The service wires it in. Its `whileEnding()` covers a push, so Discard waits. A finished turn on a session with a PR becomes `pr_open`, not `done` (AC-19). The terminal hears `pull_request` reports with the session, the ticket, the number and a code.
7. **Routes and the e2e fakes** (tasks 17 and 18).
   - Four POST routes, wired in `createServer()`, with the session leak test at `LOG_LEVEL=trace` covering every failure.
   - The e2e fake Claude Code answers a drafting call. "(no draft)" in the ticket's title makes it fail.
   - The hub's fake GitHub opens and finds PRs.
   - A sixth hub (port 4390) has a folder whose `origin` reads as github.com, while git's `pushInsteadOf` sends the push to a bare repository.
8. **api-client** (task 19): the four calls, parsed with the contracts. They're mutations: a draft asks Claude each time, so nothing caches it.
9. **`@devhub/ui`** (task 20): `Textarea`, with the `dh-input` look, 10 rows then scrolling inside, resizable in height, and wired to `Field` like `Input`. It has a story for each state, a test, and a row in `docs/design-map.md`.
10. **The app** (tasks 21 to 25).
    - The words: every line in Q11, the two steps, and Discard's extra line.
    - The dialog draft, kept per session in `store.ts` with the run it was made in, so it's drafted again once Claude has worked again (Q10h).
    - `CreatePullRequestDialog` and `PushChangesDialog`: react-hook-form with the contract's schemas, Enter in the title doesn't submit, and every state from Q10c and Q10d.
    - The title row: Create pull request (Q2), then Open PR and Push changes. The new steps have a link, and the `Design:` note is updated.
11. **e2e, docs, the browser and the real run** (tasks 26 to 30), then `/review`.

## Risks

| Risk                                                                                                                                | How we will notice early                                                                                                                                      | What we do                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The pinned Claude Code treats `tools: []` as "the default tools", or still offers a built-in, so the draft call could read a file   | Task 11 asserts the options. `node e2e/fake-claude/probe.ts`, with a write call added, shows the flags the SDK sends (`--tools=`), as 011 checked a session's | `canUseTool` refuses everything as well, and the `cwd` is an empty temporary folder, so there's nothing to read even if a tool slips through. The real run (task 30) drafts once |
| Claude answers in another shape: a Markdown heading, the title in quotes, or no blank line                                          | Task 6's table has each shape                                                                                                                                 | Read the first non-empty line as the title and the rest as the body. Strip `#` and quotes. An empty title falls back to the ticket's                                             |
| git's messages differ by version or locale, so a push failure gets the wrong name                                                   | Task 9 makes each failure for real against the bare origin: a rejected push, an unreachable remote, a hung one                                                | `LC_ALL=C`. Anything not recognised is `failed` ("Couldn't push to acme/web-app. Try again."), which is never wrong, only less specific                                          |
| git's output or the remote's address leaks into the log: an https remote can hold `user:token@`                                     | Task 9's test uses an origin address with a password in it. Task 17's leak test searches every log line and event for it                                      | git's output is read only to pick a problem name, then dropped. The page gets `owner/name` from `github-remote.ts`, never the address                                            |
| A commit or push waits on a prompt: gpg's pinentry, a credential helper's window, an SSH passphrase                                 | Can't be faked honestly: tests have no agent or pinentry. The real run (task 30) uses your own setup                                                          | `GIT_TERMINAL_PROMPT=0` as in 011. The commit gets 60 seconds and the push 2 minutes, then a problem. A window that opens is your own tool asking you, after your press          |
| A repository's hooks run anyway, through `core.hooksPath` in its config or husky's `.husky/`                                        | Task 8 sets both, with hooks that write a marker file, and checks no marker appears after a commit and a push                                                 | `-c core.hooksPath=/dev/null` on every call, as 011 does (simple-git's `allowUnsafeHooksPath`; see the simple-git 4 memory)                                                      |
| The draft call changes the worktree's index, or the session                                                                         | Task 7 hashes the index around the reads. Task 13 compares `session.json` before and after a draft and listens for events                                     | `diff.autoRefreshIndex=false` and `--no-optional-locks` on reads, no `git status`. A draft never calls `change()`                                                                |
| Two tabs, or a double press, make two commits or two PRs                                                                            | Task 14 runs two creates at once                                                                                                                              | One create or push per session at a time. The second finds the PR the first opened and answers `opened` with it                                                                  |
| The PR opens on GitHub, then Orynx closes before saving it                                                                          | Task 14: GitHub answers 422 "already exists" on the next try                                                                                                  | Find the open PR from the branch and link it (Q9a), with the step "Linked pull request"                                                                                          |
| A 013 session on your disk lacks the new fields                                                                                     | Task 13 reads a saved 013 `session.json`                                                                                                                      | Schema defaults: no `pullRequest`, no last pushed commit                                                                                                                         |
| `session-service.ts` grows past easy reading, and its tests past 1,250 lines                                                        | The diff in tasks 13 to 16                                                                                                                                    | The pull-request work lives in `sessions/pull-requests.ts` with its own tests. The service only wires it in and keeps the one state rule (AC-19)                                 |
| The dialog's skeleton and the drafted fields have different heights, so the dialog jumps                                            | Task 23's test checks the field sizes. Task 29 measures CLS with `page.route` and a slow draft                                                                | The skeletons take `Input`'s height and `Textarea`'s 10 rows                                                                                                                     |
| Spec 020 (`feat/020-first-use-feedback`, reviewed, not merged) changes shared pieces: `IconButton`, `Tooltip`, its icon-button gate | `git log origin/main` before task 20 and task 25                                                                                                              | Merge `main` when it lands, before the next task. Every button 014 adds has visible text, so its icon-button rule shouldn't apply                                                |
| e2e ports collide with other worktrees' runs (fixed 4389–4399), and the known flakes (home-inbox AC-18, verify load)                | `lsof` before `pnpm test:e2e`                                                                                                                                 | Never kill another run. Read the first failure of a retried spec                                                                                                                 |
| The learn-freshness gate fails once the sources change                                                                              | `pnpm gate learn-freshness` in task 28                                                                                                                        | Update `learn/sessions-and-worktrees.md` and `learn/connecting-github.md` in the same change                                                                                     |

## Touches

- Packages: contracts, core, api-client, ui, app, e2e. Nothing in `apps/server`: no new setting.
- New dependency: none. simple-git, @octokit/rest and the Agent SDK are listed.
- People-owned files not edited: `docs/design/**`, `tokens.css`, `docs/product/spec.md`.
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, test-policy, learn-freshness, specs, handbook-size, secrets, env-policy, and Storybook a11y.
- Skills to follow: `.claude/skills/agent-runtime/SKILL.md`, `.claude/skills/integration-adapter/SKILL.md`, `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/server-state/SKILL.md`, `.claude/skills/client-state/SKILL.md`, `.claude/skills/forms/SKILL.md`, `.claude/skills/add-ui-component/SKILL.md`, `.claude/skills/build-a-screen/SKILL.md`, `.claude/skills/clean-ui/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`.
