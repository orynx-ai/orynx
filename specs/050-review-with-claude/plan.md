# Plan: Review with Claude

Spec: `specs/050-review-with-claude/spec.md`

## Shape

A review session is an Ask (`mode: 'ask'`, read-only, no stepper, Sessions' Kind filter says Ask) with one new field, `review`. That keeps every Ask rule as it is (`readOnly: mode !== 'build'`, no branch, no push, no Reply to reviewers) and makes the review-only parts depend on `session.review !== null`:

- **Start:** `ComposerStartSchema` gets `review: true`, allowed only with `mode: 'ask'` and exactly one pull request chip. `composeNow` finds the folder by the PR's origin (`chooseFolder`, as Fix does) and answers `existing` with the PR's live review session unless `another`. The record has `review` and, with a folder, a worktree path.
- **Checkout:** `runAsk` makes the worktree first when the session has `review` and a folder: a new `worktrees.review()` fetches `pull/<n>/head` and the base, adds a detached worktree at the head, and returns the head and the merge base. The merge base is saved as `startCommit`, so the Changes tab's reader (`changes.list` and `fileDiff` from `startPointOf`) shows the PR's diff without any change. Claude reads in the worktree, not the folder.
- **Diff only:** with no folder, or a failed fetch, `runAsk` saves GitHub's diff of the PR (`pullDiff`) beside the brief. The Changes reader serves a review without a worktree from that saved diff, split per file and parsed with `parseUnifiedDiff`.
- **Comments:** `review-tools.ts` holds `review_comment`, an `OrynxTool` like `session-tools.ts`, given to `startClaude` only for a review. It checks the line against the session's diff (`fileDiff`), refuses the 21st comment, saves the comment to `session.review.comments` and adds a `commented` step.
- **Summary and verdict:** when a run ends, the last answer is the summary. Its last line, `Verdict: approve | comment | request changes`, is read and dropped from the summary (`readVerdict`, pure).
- **Posting:** `review.ts` in core sessions: change a comment (keep, text), the status (how many commits were pushed since, from `pullState`'s head and commit count), and post (one `client.postReview`, then mark the comments posted). Errors map like 049's replies.

## Order of work

1. **Contracts:** the review shapes on `Session`, the start flag, the `commented` activity, and the three endpoints' requests and answers. Everything else parses them.
2. **GitHub client:** `postReview`, and `pullState` with the commit count. The service tests then use the real client against the fake GitHub (`packages/core/src/test/fake-github.ts`).
3. **Core, bottom up:** `worktrees.review()` against a real temp repository, then the pure parts (`lineInDiff`, `readVerdict`, the tool), then the session service (start, checkout or diff only, the tool wired in, summary at the end), then `review.ts` and its routes.
4. **api-client:** the three calls with query options and mutations.
5. **ui:** `DiffNote` (the note box), a note slot in `DiffView`, and a count in `FileList`. Each has stories and tests, and none needs app code.
6. **app:** Home's row action, the Changes tab for a review (notes, Keep, Edit, counts), the next-move bar, and the Post review dialog.
7. **e2e and docs:** one e2e from Home's row to a posted review on the fake GitHub, with axe at 360 and 1280 px in both themes. Then `learn/sessions-and-worktrees.md`, `learn/connecting-github.md` and the agent-runtime skill's Ask rule (a review has a worktree).

## Risks

| Risk                                                                                                                                                                 | How we will notice early                                                                                                                                   | What we do                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Code that branches on `mode === 'ask'` hides something a review needs: the Changes tab, the live-session check (`newestLive` skips Asks), or cleanup of the worktree | Task 9 greps every `mode === 'ask'`, `!== 'build'` and `askPlace` use and lists each in its commit; the app's session-screen test renders a review session | Each place gets a `review` check, never a new mode                                                                                 |
| Our diff and GitHub's disagree on which lines can take a comment (rename detection, the three-dot base), so a review posts with a 422                                | The worktree test diffs a fixture PR. AC-19's test shows GitHub's 422 words in the dialog                                                                  | The tool checks against the same merge-base diff GitHub uses (`base...head`). A 422 leaves nothing posted, and the dialog says why |
| `git fetch origin pull/<n>/head` writes to the user's repository                                                                                                     | Task 4's test lists refs before and after: no branch and no remote-tracking ref for the PR, only objects and `FETCH_HEAD`                                  | Fetch the head into `FETCH_HEAD` only, and read its commit before the base fetch replaces it                                       |
| `session-service.ts` (2,016 lines) and its large test file grow further, and its tests have been flaky (spec 049)                                                    | Every core task runs `session-service.test.ts` with the fake clock                                                                                         | Review logic lives in `review-tools.ts` and `review.ts`. The service only wires it                                                 |
| Claude ends without the `Verdict:` line                                                                                                                              | `readVerdict`'s tests feed it answers without one                                                                                                          | The recommendation line is left out. The dialog still starts on Comment (Q3)                                                       |
| A comment's text breaks GitHub's 65,536-character limit, or GitHub has an undocumented cap on comments                                                               | The contract caps text at 65,536. Claude has 20 comments at most                                                                                           | A 422 shows GitHub's own words (AC-19)                                                                                             |
| Shared e2e ports with other clones' sessions (memory)                                                                                                                | The e2e task waits for a free run and never kills another clone's server                                                                                   |                                                                                                                                    |

## Touches

- Packages: contracts, core, api-client, ui, app; `e2e/review-with-claude.spec.ts`; `learn/`, `.claude/skills/agent-runtime/SKILL.md`.
- Gates that check this work: boundaries, style-policy, design-source (the session screen's note gains the review parts), icon-buttons (Review with Claude), component-coverage (`DiffNote`), test-policy, secrets, specs, learn-freshness. Also typecheck, lint, and the coverage thresholds.
- Skills to follow: `add-api-endpoint`, `agent-runtime` (read-only Ask, posting only on the press), `integration-adapter` (GitHub's calls stay in `client.ts`), `add-ui-component`, `server-state`, `forms` (the edit box and the dialog), `honest-tests`, `clean-ui`, `build-a-screen`.
