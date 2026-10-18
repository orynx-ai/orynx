# Tasks: Create pull request

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Add the session's PR to the contracts: `SessionPullRequestSchema` (number, a link that must be https on github.com, `owner/name`, opened at), `pullRequest` on the session (null by default, so a 013 session still parses), the `pull_request` and `pushed` steps, and their builders (AC-4, AC-11, AC-17, AC-20)
      Check: pnpm test packages/contracts/src/session.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/contracts/src/testing.ts
- [x] Task 2: Add the pull request bodies: the draft answer (a draft with its facts, or `cannot` with Q11c's reasons), `CreatePullRequestRequestSchema` (title trimmed to 1–256 characters, body at most 65,536), the answer (`opened`, `cannot`, or `failed` with each problem in Q11d, carrying a path, a sign-on link or a reset time where it needs one), and the paths (AC-2, AC-6 to AC-11)
      Check: pnpm test packages/contracts/src/pull-requests.test.ts; pnpm typecheck
      Files: packages/contracts/src/pull-requests.ts, packages/contracts/src/pull-requests.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [x] Task 3: Add the Push changes bodies: the draft answer (a message, `nothing_new` or `cannot`), `PushRequestSchema` (message trimmed to 1–256 characters), the answer (`pushed`, `nothing_new`, `cannot`, `failed`), and the paths (AC-17)
      Check: pnpm test packages/contracts/src/pull-requests.test.ts; pnpm typecheck
      Files: packages/contracts/src/pull-requests.ts, packages/contracts/src/pull-requests.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/testing.ts
- [x] Task 4: Read a GitHub repository from a remote's address, as a table: https, `git@github.com:`, `ssh://`, with and without `.git` or a trailing slash, any case in the host, a user name and password dropped. GitHub Enterprise, GitLab, an SSH host alias and a local path aren't on github.com (AC-2, AC-7)
      Check: pnpm test packages/core/src/sessions/github-remote.test.ts
      Files: packages/core/src/sessions/github-remote.ts, packages/core/src/sessions/github-remote.test.ts
- [x] Task 5: Tell a secret-looking file by its name, as a table: `.env` and `.env.*` (not `.env.example`), `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, in any folder; `src/keys.ts` and `docs/env.md` aren't (AC-8, Q6)
      Check: pnpm test packages/core/src/sessions/secret-files.test.ts
      Files: packages/core/src/sessions/secret-files.ts, packages/core/src/sessions/secret-files.test.ts
- [x] Task 6: Write and read the draft's text, as tables: the prompt from Q4's inputs (2,000 diff lines then counts only, the template cut at 10,000 characters, the base's last 20 subjects), Claude's answer read as title then description (a `#`, quotes, no blank line, an empty title), the key put in front, the Jira line added once, the fallback from the ticket and Claude's last summary, a commit message's `Co-Authored-By` trailer, and the push draft's prompt (AC-3, AC-5, AC-6, AC-15, Q5)
      Check: pnpm test packages/core/src/sessions/pull-request-text.test.ts
      Files: packages/core/src/sessions/pull-request-text.ts, packages/core/src/sessions/pull-request-text.test.ts
- [x] Task 7: Read what a push needs, with read-only git on a real temporary repository: the origin address (configured or as git expands it, whichever is on github.com, or none), the uncommitted files, the new files since the start, the branch's commit subjects, the base's last 20, and the PR template as a regular file inside the worktree only. The index's hash and `git status` stay the same (AC-2, AC-7, AC-14)
      Check: pnpm test packages/core/src/sessions/branch-git.test.ts
      Files: packages/core/src/sessions/branch-git.ts, packages/core/src/sessions/branch-git.test.ts, packages/core/src/test/git-repository.ts
- [x] Task 8: Commit what isn't committed: `add -A` and one commit with the message and trailer, made with the identity and signing your git settings have. No identity is `no_identity`, a failed signature is `signing`, and neither `.git/hooks` nor a `core.hooksPath` into the worktree runs (a marker file never appears) (AC-5, AC-8, AC-12)
      Check: pnpm test packages/core/src/sessions/branch-git.test.ts
      Files: packages/core/src/sessions/branch-git.ts, packages/core/src/sessions/branch-git.test.ts
- [x] Task 9: Push the branch to the bare `origin`: named on both sides, never forced, 2 minutes, `LC_ALL=C`. Up to date, `rejected` (origin has a commit the worktree doesn't), `auth`, `timeout` and `failed` are told apart from git's output, which is then dropped. The pushed commit id comes back, `main` on origin and the folder's checkout don't change, and an address with a password never shows in a result (AC-5, AC-9, AC-24)
      Check: pnpm test packages/core/src/sessions/branch-git.test.ts
      Files: packages/core/src/sessions/branch-git.ts, packages/core/src/sessions/branch-git.test.ts
- [x] Task 10: Let `client.ts` open, find and look up: `openPull()` (`exists`, `no_commits`, `sso` with GitHub's https link, `forbidden`, and the rate limit, network and timeout problems it has), `findOpenPull()` by branch, and `defaultBranch()`. A link that isn't https on github.com isn't kept. MSW handlers in `fake-github.ts`, and no answer holds the token; the hub-level leak test covers these calls in task 17, once they have routes (AC-5, AC-10, AC-11, AC-24)
      Check: pnpm test packages/core/src/integrations/github
      Files: packages/core/src/integrations/github/client.ts, packages/core/src/integrations/github/client.test.ts, packages/core/src/integrations/github/no-token-leaks.test.ts, packages/core/src/test/fake-github.ts
- [x] Task 11: Add `write()` to the adapter: a query with `tools: []`, `maxTurns: 1`, `persistSession: false`, `settingSources: []`, hooks off, `strictMcpConfig`, the allow-listed environment, an empty temporary `cwd` and a `canUseTool` that refuses everything. It answers Claude's text, or `login`, `limit`, `timeout` (interrupted and closed at 60 s) or `other`. The fake SDK learns a text-only answer, and the probe shows the flags it sends (AC-6, AC-15)
      Check: pnpm test packages/core/src/agents/claude/claude-adapter.test.ts; node e2e/fake-claude/probe.ts
      Files: packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/agents/claude/claude-adapter.test.ts, packages/core/src/test/fake-claude-sdk.ts, e2e/fake-claude/probe.ts
- [x] Task 12: Add the PR steps to progress: `pull_request` and `pushed` move the stepper to Pull request with every step done, and `resumeProgress()` moves Pull request back to Build as it does Review (AC-4, AC-17, AC-19)
      Check: pnpm test packages/core/src/sessions/progress.test.ts
      Files: packages/core/src/sessions/progress.ts, packages/core/src/sessions/progress.test.ts
- [x] Task 13: Draft a pull request: keep the last pushed commit with the session (a saved 013 `session.json` still reads), then `draft()` in `sessions/pull-requests.ts`. It answers each `cannot` (not connected, no origin, not on github.com, no changes, missing, working, discarded, opened), gathers Q4's inputs through the change reader and `branch-git.ts`, and gives Claude's draft or the fallback with the facts. `session.json` is byte for byte the same afterwards, and no event goes out (AC-2, AC-3, AC-6, AC-7, AC-14, AC-15)
      Check: pnpm test packages/core/src/sessions/pull-requests.test.ts packages/core/src/sessions/file-session-store.test.ts
      Files: packages/core/src/sessions/pull-requests.ts, packages/core/src/sessions/pull-requests.test.ts, packages/core/src/sessions/session-store.ts, packages/core/src/sessions/file-session-store.test.ts
- [x] Task 14: Create the pull request: one at a time for each session (two at once make one PR), the secret check, the commit, the push, then the PR opened, or the open one found and linked. Each failure is answered with its problem and nothing is saved, and the commit stays for the next press. A second press after GitHub failed pushes nothing new. On success, `pullRequest`, the step and PR open are saved, and `sessions.changed` and `session.changed` go out (AC-4, AC-5, AC-8 to AC-11, AC-13)
      Check: pnpm test packages/core/src/sessions/pull-requests.test.ts
      Files: packages/core/src/sessions/pull-requests.ts, packages/core/src/sessions/pull-requests.test.ts
- [ ] Task 15: Push changes: `draftPush()` with Claude's one-line message from the diff since the last push (the PR's title when Claude can't), or `nothing_new`, and `push()`: commit, push, the `pushed` step, the stepper at Pull request, and the last pushed commit saved (AC-17)
      Check: pnpm test packages/core/src/sessions/pull-requests.test.ts
      Files: packages/core/src/sessions/pull-requests.ts, packages/core/src/sessions/pull-requests.test.ts
- [ ] Task 16: Wire it into the session service: the four methods, a finished turn on a session with a PR becomes PR open rather than Done, Discard waits for a push under way, `get()` carries `pullRequest`, and the terminal hears `pull_request` reports with only the session, the ticket, the number and a code (AC-14, AC-18, AC-19, AC-20, AC-24)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts
- [ ] Task 17: Add the routes: `POST /api/sessions/:id/pull-request/draft`, `/pull-request`, `/push/draft` and `/push`, with 404 for an unknown session. Wire the GitHub client, its connection and `branch-git.ts` into `createServer()`, and extend the session leak test at `LOG_LEVEL=trace` to every failure: no token, address, title, description, message, diff line, path or git output in a log line or an event (AC-24)
      Check: pnpm test packages/core/src/routes/sessions.test.ts packages/core/src/create-server.test.ts packages/core/src/sessions/no-leaks.test.ts
      Files: packages/core/src/routes/sessions.ts, packages/core/src/routes/sessions.test.ts, packages/core/src/create-server.ts, packages/core/src/create-server.test.ts, packages/core/src/sessions/no-leaks.test.ts
- [ ] Task 18: Teach the e2e fakes. The fake Claude Code answers a drafting call (no tools) with a title and description, and fails it for "(no draft)". The hub's fake GitHub opens, finds and lists PRs (`PUT /tools` gains `pulls`). A sixth hub on port 4390 has a folder whose `origin` reads as `https://github.com/acme/web-app.git`, while `pushInsteadOf` sends the push to a bare repository (AC-25)
      Check: pnpm test:e2e e2e/sessions.spec.ts e2e/changes.spec.ts (still pass)
      Files: e2e/fake-claude/session.ts, e2e/fake-tools/preload.ts, e2e/fake-tools/config.ts, playwright.config.ts
- [ ] Task 19: Add `draftPullRequest`, `createPullRequest`, `draftPush` and `pushChanges` to the api-client, parsed with the contracts, as mutations (AC-2, AC-4, AC-17)
      Check: pnpm test packages/api-client
      Files: packages/api-client/src/endpoints/sessions.ts, packages/api-client/src/sessions.test.ts, packages/api-client/src/client.ts, packages/api-client/src/index.ts
- [ ] Task 20: Add `Textarea` to `@devhub/ui`: the `dh-input` look, 10 rows then scrolling inside, resizable in height, wired to `Field`'s label, help and error like `Input`, disabled and read-only. A story for each state, a test, and a row in `docs/design-map.md` (Q10b, AC-21, AC-22)
      Check: pnpm test packages/ui/src/components/textarea.test.tsx; pnpm gate component-coverage; pnpm storybook (no axe violations)
      Files: packages/ui/src/components/textarea.tsx, packages/ui/src/components/textarea.stories.tsx, packages/ui/src/components/textarea.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 21: Add the words: Q11's buttons, the dialog's lines (with "1 changed file"), the cannot lines, each failure line (the rate limit's time in the app's clock words), the two steps, Push changes' lines, and Discard's extra line (Q11)
      Check: pnpm test packages/app/src/features/sessions
      Files: packages/app/src/features/sessions/pull-request-words.ts, packages/app/src/features/sessions/pull-request-words.test.ts, packages/app/src/features/sessions/step-words.ts, packages/app/src/features/sessions/step-words.test.ts
- [ ] Task 22: Build `CreatePullRequestDialog`. Opening it drafts, with skeletons in the fields' sizes and the drafting line. Then come the drafted fields (react-hook-form with the contract's schema), focus on the title, Enter in the title not sending, the line about what happens, and Create busy with the fields read-only and Cancel off. A failure shows its line (`role="alert"`) and keeps the edits. The cannot line links Settings. Escape hands focus back. The draft is kept per session in `store.ts` until Claude works again (AC-2, AC-3, AC-6 to AC-10, AC-21, AC-23, Q10)
      Check: pnpm test packages/app/src/features/sessions/components/create-pull-request.test.tsx
      Files: packages/app/src/features/sessions/components/create-pull-request.tsx, packages/app/src/features/sessions/components/create-pull-request.test.tsx, packages/app/src/features/sessions/store.ts, packages/app/src/features/sessions/schemas.ts, packages/app/src/features/sessions/queries.ts
- [ ] Task 23: Build `PushChangesDialog`: Claude's commit message drafted on opening, the one field, the line about what happens, Push busy, the failure lines, and "Nothing new to push" (AC-17, AC-21)
      Check: pnpm test packages/app/src/features/sessions/components/push-changes.test.tsx
      Files: packages/app/src/features/sessions/components/push-changes.tsx, packages/app/src/features/sessions/components/push-changes.test.tsx, packages/app/src/features/sessions/schemas.ts
- [ ] Task 24: Lay out the title row. Create pull request shows only once Claude isn't working and there's a worktree and no PR (Q2). Then "Open PR #2841" opens GitHub through the platform, with Push changes beside it, and focus moves to Open PR once the PR opens. The new steps show in Claude's progress with the number as a link. The `Design:` note is updated (AC-1, AC-4, AC-16, AC-20)
      Check: pnpm test packages/app/src/features/sessions; pnpm gate design-source; pnpm gate style-policy
      Files: packages/app/src/features/sessions/components/session-header.tsx, packages/app/src/features/sessions/components/session-header.test.tsx, packages/app/src/features/sessions/components/session-progress.tsx, packages/app/src/features/sessions/components/session-progress.test.tsx, packages/app/src/features/sessions/session-screen.tsx, packages/app/src/features/sessions/session-screen.test.tsx
- [ ] Task 25: Say in Discard's confirm that the PR and the branch on GitHub stay, once a PR is open, and keep Open PR after Discard (AC-18)
      Check: pnpm test packages/app/src/features/sessions/components/discard-session.test.tsx
      Files: packages/app/src/features/sessions/components/discard-session.tsx, packages/app/src/features/sessions/components/discard-session.test.tsx
- [ ] Task 26: e2e create. Draft, edit the title and create, with PR open in a second tab too. The bare origin holds the branch with Orynx's commit and its trailer, and the fake GitHub got the title and the description. A ".env.local" stops the commit. "(no draft)" starts from the ticket (AC-1, AC-2, AC-4, AC-5, AC-6, AC-8, AC-13)
      Check: pnpm test:e2e e2e/pull-requests.spec.ts
      Files: e2e/pull-requests.spec.ts
- [ ] Task 27: e2e after the PR: Push changes updates the branch, and a follow-up on a PR-open session ends PR open. Discard keeps the PR. Then the keyboard path, and axe at 360 and 1280 px in light and dark (AC-17, AC-18, AC-19, AC-21, AC-22)
      Check: pnpm test:e2e e2e/pull-requests.spec.ts
      Files: e2e/pull-requests.spec.ts
- [ ] Task 28: Docs. `learn/sessions-and-worktrees.md` gets the PR, the push, the draft call and why hooks stay off. `learn/connecting-github.md` gets what Orynx writes. agent-runtime gets the PR section and `write()`. `docs/architecture.md` gets the routes, git now committing and pushing, and GitHub's writes. The roadmap gets its 014 line and a new 021 line, "After the merge" (Q8)
      Check: pnpm gate learn-freshness; pnpm gate handbook-size; pnpm gate specs
      Files: learn/sessions-and-worktrees.md, learn/connecting-github.md, .claude/skills/agent-runtime/SKILL.md, docs/architecture.md, docs/product/roadmap.md
- [ ] Task 29: Open the Session screen in a real browser (`pnpm dev`, own `DEVHUB_HOME`) at 360 and 1280 px, light and dark, in each state through `page.route`: the title row before and after the PR, the dialog drafting, drafted, creating, failed and unable, the fallback, and Push changes. Measure CLS, and tick each check here (AC-22, AC-23)
      Check: the screenshots and CLS values recorded in this task
      Files: specs/014-create-pull-request/tasks.md
- [ ] Task 30: Ask the user to run one real session on a throwaway GitHub repository of their own (Q12). Create the PR from the draft, check the branch, the commit and the PR on GitHub, change a file and push changes, then close the PR and delete the repository. Write down what happened
      Check: the user's notes recorded here; AC-2, AC-4, AC-5, AC-15 and AC-17 as seen
      Files: specs/014-create-pull-request/tasks.md, learn/sessions-and-worktrees.md
- [ ] Task 31: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
