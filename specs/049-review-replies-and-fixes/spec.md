# Review replies, five fixes, and faster tests

Status: approved
Roadmap: not on the roadmap. The user's ask from 27 Oct 2026, on a list of next steps: "fix these things in single branch and pr also reduce the time of test cases and ci pipeline", naming 021 after the merge, context in follow-ups, replies to review comments, and five fixes. Two of those were already on `main`: after the merge (spec 047, part C) and context in follow-ups (the follow-up box has + Add context and chips). So was half of the fourth fix: Delete has "Also delete the branch" (spec 039, AC-32). This spec takes the rest. It was 048, the next free number then (046 is drafted on this laptop and not merged); `048-session-redesign` reached `main` first, so it's 049. The branch is `feat/049-review-replies-and-fixes`, made from `origin/main` at `5685768` and rebased on `6513b42`. Reply to reviewers is the replying part of spec 048's part G; its Review comments tab, the notes in the diff and the marks in the file list stay for a later spec.

## Assumptions

Correct these now, or the work goes ahead on them.

**A. Reply to reviewers**

- A session whose pull request is open gets **Reply to reviewers** in the page bar after Open PR: a small secondary button. Under 768 px it moves into More actions, like the others. (Spec 048 moved Push changes from the page bar into the next-move bar, so the button follows Open PR, which stayed.)
- It opens a dialog, **Reply to reviewers**, that reads the pull request's unresolved review threads from GitHub (the first 50, as the brief does). Each thread shows its file and line, its last comment (author and text), a **Reply** text box, and a **Resolve** checkbox.
- Claude drafts the replies with one call that has no tools, as it drafts Push changes' commit message (spec 014). It gets the threads and the session's diff from its start commit, and writes a short reply for each thread its changes address. A thread with Claude's reply starts with Resolve ticked. A thread Claude didn't address starts empty and unticked.
- When Claude can't draft (no Claude Code, or the call fails), every box starts empty and unticked, and a line says "Claude couldn't draft replies. Write your own, or leave a thread as it is."
- **Post replies** is the only thing that writes to GitHub (rule 11). For each thread, in order, it posts the reply when the box has text, then resolves the thread when Resolve is ticked. A thread with an empty box that's unticked stays as it is. Post replies is disabled until at least one thread has a reply or is ticked.
- Replies go out as you, with your GitHub token, and nothing is added to them.
- When everything posts, the dialog closes and focus goes back to Reply to reviewers. When a thread fails, the dialog stays open. The threads that posted leave the list, so pressing again never posts twice, and each failed thread says "GitHub refused this: <GitHub's reason>".
- While the threads load, each row is a skeleton. When GitHub can't be reached: "Orynx couldn't read the review threads. <problem>" with **Try again**. When none are unresolved: "No review threads are waiting on #2836." with **Close**.
- It needs the token's `repo` scope, which Orynx already requires (spec 004, Q3). Replying and resolving are GraphQL calls: `addPullRequestReviewThreadReply` and `resolveReviewThread`.
- Lines written while building, in Push changes' words where they fit; a person hasn't confirmed them yet (27 Oct 2026). GitHub's problems: "Your GitHub account can't reply in acme/web-app.", "Authorize your GitHub token for acme's single sign-on, then try again.", "GitHub's rate limit is used up until 14:05.", "Couldn't reach GitHub. Try again." and "GitHub refused it. Try again." A post that never reached Orynx: "Couldn't post the replies. Try again." Why it can't: "Connect GitHub to reply to reviewers." and "There's no open pull request to reply on." A reply too long: "Keep the reply under 65,536 characters." While posting, the button reads "Posting…".
- A reply that went out before its Resolve failed keeps its thread in the list with Resolve ticked and its box emptied, so a second press resolves it without posting the reply again.

**B. Five fixes**

1. **"Ready for" counts every change.** At the end of each turn of a Build, Orynx asks git whether the worktree differs from the session's start commit (committed or not, with git's ignore rules), and saves `changed` in `session.json`. A Build whose only change came from a command Claude ran, such as a formatter or codegen, now reads "Done, ready for PR" (or "ready to push" on your own PR) in the sidebar, the state pill and the finished notification, as Create pull request already does from the diff. Older sessions have no `changed`, so they read as they do today.
2. **Markdown in Jira comments.** Besides what it writes today, Claude's comments to Jira turn `[text](https://…)` into a link (only `http`, `https` and `mailto` links), `*text*` and `_text_` into italics, lines that start with `> ` into a quote, a pipe table with a `---` line under its header into a table with a header row, and a list item indented by two or more spaces into a list nested under the item above. Anything else stays as written.
3. **The Claude tab keeps the last 200 commands.** When a command drops off, `session.json` counts it, and the top of the Terminal's Claude tab says "Orynx keeps the last 200 commands. 37 earlier ones aren't shown." Each command keeps its last 200 lines, as it does today, so `session.json` stays a few MB at most.
4. **A saved folder that's gone.** Settings › Repositories looks at each folder when it lists them. A folder that isn't there, or isn't a git repository any more, gets a warning pill, **Folder not found**, on its row. Edit lets you point it at the folder's new place, as it does now. Nothing is deleted.
5. **Claude pages through a Jira search.** When Jira finds more, `search_jira` answers with `next`, and Claude passes `next` back to read the following page, at most 100 issues a page. The tool's description changes from "narrow the query rather than asking for more" to "pass `next` to read the next page; narrow the query when you only need a few".

**C. Faster tests and CI** (measured on CI run `40475587716`, 27 Oct 2026)

- Today the required check `CI passed` waits on Unit tests (app): 289 s of tests on one runner, 5 to 8 minutes for the job. Every other required job ends within about 2.5 minutes. The advisory e2e job takes 8 to 21 minutes: 485 s of tests on 2 workers.
- Nearly half the app run is importing the same modules again for each of its 134 files. With `isolate: false` in `packages/app/vitest.config.ts`, the 134 files share one module graph per worker: locally, 118.7 s became 38.7 s, and all 1,203 tests passed (27 Oct 2026). `src/test/setup.ts` already resets every store, MSW and the DOM after each test. Before that's kept, the app suite runs 3 times in shuffled order (`--sequence.shuffle`) and must pass every time. `ui` and `core` get the same trial, and keep it only where it passes and saves time.
- The app's unit tests then run as 2 shards (`vitest run packages/app/ --shard=i/2`), each a job with its own blob report. The merge job checks that every package, and every app shard, sent its report. Coverage is still checked once, on the merged reports. The goal: `CI passed` in about 3 minutes.
- The e2e run splits into 3 shards, each with a blob report, merged into the one `playwright-report` artifact. It stays advisory. Playwright's Chromium is cached between runs.
- Two flaky tests in `packages/core/src/sessions/session-service.test.ts` failed 2 of the last 3 `main` runs: "AC-4: … at most every 250 ms" counts events against the real clock, and "AC-13, Q11 …" races its answer (`already_answered`). They move to the fake clock and wait for the event they need.
- No test is deleted or weakened, and coverage stays at 90% or more.

## Goal

After Claude fixes review comments and you push, answer the reviewers from Orynx: Claude drafts a reply for each thread it fixed, you edit it, and one press posts the replies and resolves the threads. Five rough edges go away: a command-only change counts as ready, Jira comments keep their links and tables, long sessions stop growing `session.json`, a moved folder shows up in Settings, and Claude can read past the first 100 Jira results. CI tells you a pull request is green in about half the time.

## Acceptance criteria

| ID    | Given                                                                       | When                                         | Then                                                                                                                                   |
| ----- | --------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | A session whose PR is open                                                  | I look at the page bar                       | Reply to reviewers shows after Open PR; under 768 px it's in More actions                                                              |
| AC-2  | That PR has 3 unresolved threads and Claude's changes address 2             | I press Reply to reviewers                   | Skeleton rows, then 3 threads: 2 with Claude's reply and Resolve ticked, 1 empty and unticked                                          |
| AC-3  | That dialog                                                                 | I edit a reply and press Post replies        | GitHub gets my edited reply on that thread and the 2 ticked threads are resolved; the untouched thread gets nothing; the dialog closes |
| AC-4  | Claude can't draft                                                          | I open the dialog                            | Every box is empty and unticked, the "couldn't draft" line shows, and Post replies is disabled until I write or tick                   |
| AC-5  | One reply of 3 is refused by GitHub                                         | I press Post replies                         | The 2 that posted leave the list, the refused one stays with GitHub's reason, and pressing again posts only that one                   |
| AC-6  | GitHub can't be reached                                                     | I open the dialog                            | The error line and Try again show; Try again reads the threads again                                                                   |
| AC-7  | No unresolved threads                                                       | I open the dialog                            | "No review threads are waiting on #2836." and Close                                                                                    |
| AC-8  | The dialog                                                                  | I don't press Post replies                   | Nothing is written to GitHub (checked on the fake GitHub)                                                                              |
| AC-9  | The dialog                                                                  | I use only the keyboard                      | Tab reaches every reply box, checkbox and button in order, Escape closes it, and focus returns to Reply to reviewers                   |
| AC-10 | A Build where Claude edited nothing but ran a formatter that changed a file | The turn ends                                | The sidebar, the pill and the notification say it's ready for a PR                                                                     |
| AC-11 | A Build that changed nothing                                                | The turn ends                                | It reads "Done", as today                                                                                                              |
| AC-12 | A session saved before this change                                          | I open it                                    | It reads as it did                                                                                                                     |
| AC-13 | Claude comments with a link, italics, a quote, a table and a nested list    | Jira gets the comment                        | Each is Jira's own link, italics, quote, table and nested list; a `javascript:` link stays as text                                     |
| AC-14 | A session ran 230 commands                                                  | I open the Claude tab                        | It lists the last 200, oldest first, under "Orynx keeps the last 200 commands. 30 earlier ones aren't shown."                          |
| AC-15 | A session ran 12 commands                                                   | I open the Claude tab                        | All 12 show and the line doesn't                                                                                                       |
| AC-16 | A saved folder I moved                                                      | I open Settings › Repositories               | Its row has Folder not found; after Edit points it at the new place, the pill is gone                                                  |
| AC-17 | Claude's JQL matches 250 issues                                             | It searches with limit 100, then with `next` | It gets 100, 100, then 50 with no `next`                                                                                               |
| AC-18 | A pull request                                                              | CI runs                                      | 2 app shards and 3 e2e shards run; `CI passed` waits for every unit shard; one coverage check runs on the merged reports               |
| AC-19 | An app shard's tests fail                                                   | CI runs                                      | `CI passed` fails and the merge job lists the failure                                                                                  |
| AC-20 | The dialog and the pill                                                     | Checked at 360 and 1280 px, light and dark   | No axe violations, nothing scrolls sideways, and nothing shifts while the threads load                                                 |
| AC-21 | The app suite without isolation                                             | It runs 3 times in shuffled order            | Every run passes, and `pnpm test packages/app` takes under half the time it did                                                        |

## Out of scope

- Posting a new review, approving, or commenting on lines that have no thread.
- Replying to threads on someone else's pull request, or from Home.
- Unresolving threads, or editing a reply after it's posted.
- The 5 e2e tests that fail on `main` today (the job is advisory).
- Dropping or rewriting slow unit tests. Making them faster is a separate question from splitting the run.
- The other Markdown that Jira's format has: strikethrough, headings inside lists, panels and mentions.

## Open questions

The work is not done until every question has an answer. Write the date with each answer.

| #   | Who decides | Question                                                                                                                                                                                                                | Answer                                                                                                           |
| --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Q1  | You         | What goes in each reply? Recommended: Claude drafts a reply for each thread it fixed, and you edit it. The other choices: the same line for every thread ("Fixed in abc1234."), or no replies, only Resolve.            | Claude drafts a reply for each thread its changes address; you edit, then Post replies. The user, 27 Oct 2026.   |
| Q2  | You         | Where is Reply to reviewers? Recommended: a page-bar button after Push changes while the PR is open. The other choice: only in More actions (⋯). (After Open PR since spec 048 moved Push changes out of the page bar.) | A page-bar button after Push changes while the PR is open. The user, 27 Oct 2026 ("As written").                 |
| Q3  | You         | How many commands does the Claude tab keep? Recommended: the last 200, about 3 MB at most. The other choices: 500, or 100.                                                                                              | The last 200 commands. The user, 27 Oct 2026.                                                                    |
| Q4  | You         | Is the wording in the Assumptions right: the button and dialog, the couldn't-draft, error, empty and refused lines, the Claude tab's line, Folder not found, and `search_jira`'s description?                           | Yes, as written in the Assumptions. The user, 27 Oct 2026.                                                       |
| Q5  | Design      | No screen draws the dialog or the pill. Recommended: reuse `Dialog`, `Textarea`, `Checkbox`, `Skeleton`, `Callout` and `Pill` (warning tone), with no new component.                                                    | Reuse Dialog, Textarea, Checkbox, Skeleton, Callout and Pill (warning); no new component. The user, 27 Oct 2026. |
| Q6  | You         | Run the app's unit tests without per-file isolation (118.7 s to 38.7 s locally)? Recommended: yes, kept only if 3 shuffled runs pass. The risk: state one test file leaves behind could change another's result.        | Yes, kept only if 3 shuffled runs pass. The user, 27 Oct 2026.                                                   |

## Design

None: no file in `docs/design/screens/` draws these. Reply to reviewers sits in `session.html`'s page bar beside Push changes (spec 014). Folder not found is a `Pill` on `settings.html`'s Repositories row (Q5).

On 27 Oct 2026, with spec 048's `session-review.html` on `main`, the user chose to ship this dialog ("Ship the dialog"). That mockup's Review comments tab, its notes in the diff and its marks in the file list stay for their own spec, which can reuse this spec's threads, draft and posting.
