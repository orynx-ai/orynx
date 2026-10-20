# Plan: Session kinds

Spec: `specs/031-session-kinds/spec.md` (approved 20 Oct 2026, every recommended answer)

## Order of work

1. **Contracts first**, so core and the app share one shape. `Session` gains three fields: `workOn` (`new_branch` | `pull_request`, default `new_branch`), `skipped` (the steps the stepper passed over, default none), and a nullable `folder` for an Ask with no folder. The `discarded` step gains `kept` (default false): the branch stayed because it's a pull request's. Defaults keep every saved session as it was (AC-23). `ComposerStart` keeps its shape: an Ask without `repositoryId` now means no folder.
2. **Core, pure rules**, each tested as a table before anything uses it:
   - `progress.ts`: at Finished, every step the stepper jumps over is skipped (Test; Build too when Claude never edited). A follow-up clears them, because those steps lie ahead again.
   - `compose.ts`: which kind a composer start is, from the mode, the chips as read and the folder's origin.
   - `brief.ts`: Claude's note for an Ask with no folder, and for a session on a pull request's branch.
3. **Core, git and GitHub**, against a real temporary repository with a bare origin, as the existing tests do:
   - The pull request read gains whether you wrote it, whether it's open, whether it's from a fork, its link and when it opened. They come from the same GraphQL query, with `viewer { login }` added.
   - `worktrees.make` can make a detached worktree from `origin/<head>` after fetching it.
   - `branch-git.push` can push `HEAD` to the pull request's branch.
4. **Core, the session service**, in two steps:
   - An Ask with no folder: no repository, and Claude in an empty folder of its own under the worktrees root.
   - Build on your PR: linked from the start, with `existing` for a live one, the detached worktree, Discard keeping the branch, and Push changes pushing `HEAD`.
5. **UI**: `Stepper` gains a `skipped` state, with a story, a test and a `docs/design-map.md` row, before the app uses it.
6. **App**, smallest visible change first:
   - The switch and its remembered mode.
   - The heading and placeholder.
   - "No folder" in the folder picker.
   - The `existing` line for a pull request.
   - The Session screen: the steps for each kind, skipped, the header lines, and the Discard step's words when the branch is kept.
7. **E2e**: the composer hub for Ask; the pull-requests hub (bare origin, fake GitHub) for Build on your PR; the sessions hub for a skipped Test.
8. **Docs and the browser check.** Add roadmap rows for 031 and 032 (`020-fix-a-failing-check` is folded into 031), and update `learn/sessions-and-worktrees.md` and the agent-runtime skill's rule 1. `docs/product/spec.md` is people-owned, so its "Agent sessions" lines go into `people-files.sh` for the user to run. Then every changed view at 360 and 1280 px in both themes, with `/api` faked.

## Decisions this plan makes inside the spec

- **Build is skipped too** when Claude finishes without editing anything. The spec names Test; a Build with a check and no edit would mislead in the same way. Flagged to the user with the plan.
- **The Discard step's words for a session on your PR** (wording nobody gave, so it's flagged to the user): "Discarded the changes" with "The worktree is deleted. fix/content-list stays as it is on GitHub."
- **Offline at start, with a fetched copy**: when the fetch fails but an earlier fetch left `origin/<head>`, the worktree is made from it and marked "(last fetched, offline)", as Q8f words it. With no copy, Claude couldn't start (AC-22).
- **The live-session check for a pull request** matches the repository and the number. The listed sessions gain the pull request they work on.

## Risks

| Risk                                                                                            | How we will notice early                                                                                 | What we do                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Discard deletes the user's own branch (`git branch -D fix/content-list`)                        | A worktrees test: the main checkout has `fix/content-list` checked out, and the session is discarded     | `remove` gets `null` for the branch of a `pull_request` session, so it never runs `branch -D`; the `discarded` step says `kept` |
| `git worktree add` refuses the PR's branch because the main checkout has it                     | The same test                                                                                            | Detached HEAD (`--detach origin/<head>`): no local branch is made, so nothing is checked out twice                              |
| Push sends the wrong commits from a detached HEAD                                               | A branch-git test where origin moved, and one where HEAD is behind                                       | Never forced, so origin refuses anything that isn't a fast-forward of its branch; the rejected line already exists (AC-17)      |
| Claude's own `git push origin fix/x` (when the push row allows it) fails in a detached worktree | A tool-decision test                                                                                     | Known limit: Orynx's Push changes is the way to push. The note says so. Claude's push from a PR session is out of scope         |
| A session saved before this spec reads as skipped, or loses its folder                          | Contract defaults tested with an old `session.json` in `file-session-store.test.ts`                      | `skipped` defaults to none, `workOn` to `new_branch`, `folder` stays filled for every older record                              |
| "Yours" differs between the inbox and the composer                                              | Client tests with an EMU login (underscore) and a renamed login                                          | Both compare GitHub's `author.login` with `viewer.login` from one query, case-insensitively                                     |
| An Ask with no folder reads anything through its empty `cwd`                                    | Tool-decision tests on that session: reads inside the empty folder, the brief's files, and anything else | The empty folder holds nothing; reads outside it and the brief's `reads` are refused, as for every session                      |
| The composer's switch makes the bar wrap at 360 px                                              | The browser check, and the existing AC-30 composer e2e                                                   | It shares the pickers' own row under 640 px, as spec 026 placed it                                                              |
| e2e on the pull-requests hub isn't retry-safe (memory)                                          | Read the first failure, never a retry's                                                                  | New tests make their own branch on the bare origin and never share a session                                                    |

## Touches

- Packages: contracts, core, ui, app, e2e. No api-client change: `startSession` already sends `ComposerStart`. No new dependency.
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, icon-buttons, test-policy, secrets, specs; Storybook a11y; coverage at 90%.
- Skills to follow: `agent-runtime` (worktrees, push, notes), `integration-adapter` (the GitHub read), `add-ui-component` (Stepper), `build-a-screen` and `clean-ui` (Home and Session), `client-state` (the remembered mode), `forms` (the composer), `honest-tests`.
