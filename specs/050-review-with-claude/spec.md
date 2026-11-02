# Review with Claude: Claude reviews a teammate's pull request, and you post the comments you keep

Status: approved
Roadmap: not on the roadmap. This is the user's ask from 1 Nov 2026. They first asked "suggest something cool to implement and you think user will use", and after this was the pick, "write spec for it". The spec takes 050, the next free number: 049 is on `main` and 046 is drafted on this laptop. The branch is `feat/050-review-with-claude`, made from `origin/main` at `488a57c`. It reverses two earlier choices, for review sessions only. Spec 031 Q4 had an Ask read "the folder where it is", and this spec gives Claude a checkout of the PR's head (Q1). Specs 031 and 049 kept "posting a review" out of scope, and this spec adds it.

## Assumptions

Correct these now, or the work goes ahead on them.

**A. Starting a review**

- Home's **Review requested** rows lose today's + (Add to composer). Each gets **Review with Claude** instead: an `IconButton` with `FileSearchIcon`, drawn as spec 047's Fix is (Q2). The title still opens the PR's files on GitHub. You can still add the PR to the composer through + Add context or by pasting its link.
- One press starts a review session and opens it. Like Fix, it uses the composer's model and effort and leaves the composer's draft as it was. Its title is "Review web-app #2841".
- If that PR already has a session that isn't Stopped, spec 047 part A's callout shows: Open session, or Start a new session. Starting a new one is how you review again after the author pushes.
- A review session is read-only, like an Ask. Claude reads and searches, but never edits, commits, pushes or makes a branch.

**B. What Claude reads**

- Orynx finds the PR's repository among Settings › Repositories by the folder's `origin`, as a Build on your own PR does (`chooseFolder`). It fetches the PR's head (`pull/<n>/head`, so a PR from a fork works too) and its base branch into that folder's git. It then makes a detached worktree at the head under `~/.devhub/worktrees/`, and Claude reads there. The fetch adds objects and `FETCH_HEAD` to your repository, never a branch.
- The session's start commit is the merge base of head and base. So the Changes tab shows exactly the PR's changes, the same files and counts GitHub shows.
- When no saved folder holds the repository, or the fetch fails, Claude reviews from the diff alone in an empty folder. The first step says "Claude reviews from the diff only: <reason>.", where the reason is "no saved folder holds acme/web-app" or "git couldn't fetch acme/web-app". Not git's own message, which can hold paths and remote addresses (`worktrees.ts`; changed while building, 2 Nov 2026).
- The brief is the PR chip's brief from spec 031: the description, failing checks, unresolved review comments, and the diff up to 2,000 lines. To that it adds a review note, which tells Claude:
  - it is reviewing a teammate's pull request
  - comment only on what matters: bugs, risk, missing tests, unclear code
  - don't repeat a comment that's already there
  - write at most 20 line comments
  - end with a short summary for the author, plus whether it would approve, comment or request changes
- The worktree goes away when the session is deleted, and with spec 047's cleanup, as any other worktree does.

**C. Claude's comments**

- Claude comments through one Orynx tool, `review_comment` (path, line, side, text). It runs in-process like spec 044's Jira tools, and it only saves the comment in `session.json`. Nothing goes to GitHub.
- The tool takes only a line that's in the PR's diff: a changed line, or a context line GitHub shows around one. GitHub refuses comments anywhere else. On any other line it answers Claude: "Line 88 of src/a.ts isn't in this pull request's diff. Comment on a line in the diff, or put it in your summary." It refuses a 21st comment: "That's 20 comments. Put the rest in your summary."
- A comment may hold a GitHub suggestion block (` ```suggestion `) on a new-side line, which the author applies with one click on GitHub. Orynx shows the block as code and doesn't draw it as a diff.
- Each comment is a step in Claude's progress: "Commented on src/a.ts:42".
- Claude's last message is the review's summary, and its recommendation is read from it.
- A follow-up ("look harder at the SQL") runs Claude again on the same checkout, and any new comments join the list. Claude can't remove a comment. You untick it.
- When Claude stops or fails partway, the comments it already made stay and can be posted.

**D. Seeing and choosing**

- The Changes tab shows the PR's diff. Each comment is a note under its line, drawn like the reviewer's note in `session-review.html` (Q6). It has Claude's mark, the text, a **Keep** checkbox (ticked) and **Edit**. Edit swaps the text for a text box with **Save** and **Cancel**. An unticked note is dimmed and won't be posted. Keep and edits are saved in `session.json` and survive a reload.
- The file list shows how many comments each file has, beside its +/− counts.
- Once Claude is done, the next-move bar (spec 048) says "Claude left 6 comments" with **Post review**. With none, it says "Claude found nothing to comment on." and Post review posts the summary alone. While Claude works, the bar reads as it does for an Ask today.

**E. Posting**

- **Post review** opens the dialog **Post your review on #2841**. It holds:
  - **Summary**: a text box holding Claude's summary
  - **Your verdict**: three choices, **Comment**, **Approve** and **Request changes**, starting on Comment (Q3)
  - Claude's recommendation on the line under the choices, for example "Claude would request changes."
  - "6 of 8 comments will be posted."
- The dialog's **Post review** button is the only thing that writes to GitHub (rule 11). There is no Settings permission for it, because posting is always your press.
- It posts one review with `POST /repos/{owner}/{repo}/pulls/{n}/reviews`. The review carries the commit Claude read as `commit_id` (a review from the diff alone sends none, so GitHub takes the latest, which its diff came from; 2 Nov 2026), the summary, the verdict, and every kept comment not posted yet, each with its path, line and side. GitHub takes all of it or none, so half a review never goes out.
- Comment and Request changes need a summary, which is GitHub's rule. Approve can go without one. When it's missing, the field says "Write a summary to comment or request changes." and nothing is sent.
- If the author pushed after Claude read the PR, the dialog says "The author pushed 2 commits since Claude read it. The comments go on the commit Claude read." Orynx checks the PR's head when the dialog opens.
- The review goes out as you, with your GitHub token, and nothing is added to the text (Q4).
- Once posted, the dialog closes and focus returns to Post review's place. The next-move bar says "Review posted" with **Open on GitHub**, and the posted notes say "Posted" and lose Keep and Edit. Comments a follow-up adds later go out as another review. A posted comment never goes twice.
- When posting fails, the dialog stays open, nothing is marked posted, and a `Callout` gives 049's words for the cause:
  - "Your GitHub account can't review in acme/web-app."
  - "Authorize your GitHub token for acme's single sign-on, then try again."
  - "GitHub's rate limit is used up until 14:05."
  - "Couldn't reach GitHub. Try again."
  - "GitHub refused it: <GitHub's reason>"

  While posting, the button reads "Posting…".

- Home's row leaves at the next sync, once GitHub no longer lists you as a requested reviewer (spec 007).
- The new client call needs the `repo` scope that Orynx already requires. A fine-grained token needs "Pull requests: write", and without it GitHub's 403 shows as the first error line.

## Goal

Review requests are the one thing on Home that Orynx can't finish for you. Press Review with Claude on one. Claude reads the pull request's own code and comments on the lines that matter. You keep, edit or drop each comment, pick Comment, Approve or Request changes, and post one review to GitHub. Nothing reaches GitHub until you press Post review.

## Acceptance criteria

| ID    | Given                                                          | When                                              | Then                                                                                                                                                                                                                         |
| ----- | -------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | Home lists a Review requested row                              | I look at the row                                 | Its action is Review with Claude, with that tooltip and name, and no +. Other rows keep their actions                                                                                                                        |
| AC-2  | That row, with a saved folder for its repository               | I press Review with Claude                        | A session "Review web-app #2841" starts and opens, the sidebar lists it, and the composer's draft is unchanged                                                                                                               |
| AC-3  | That PR already has a session that isn't Stopped               | I press Review with Claude                        | Spec 047 part A's callout shows. Open session opens it, and Start a new session starts a second review                                                                                                                       |
| AC-4  | The review session has started                                 | I open the Changes tab                            | It lists the PR's files with the counts GitHub shows. My saved folder's branch, index and files are unchanged                                                                                                                |
| AC-5  | A PR from a fork                                               | The session starts                                | Claude reads the fork's head, fetched through `pull/<n>/head`                                                                                                                                                                |
| AC-6  | No saved folder holds the repository                           | The session starts                                | The first step says "Claude reviews from the diff only: no saved folder holds acme/web-app.", and the review goes on                                                                                                         |
| AC-7  | A review session                                               | Claude tries to edit a file                       | It's refused as in any Ask, and the worktree is unchanged                                                                                                                                                                    |
| AC-8  | Claude comments on line 42 of src/a.ts, a line in the diff     | The comment is saved                              | A step "Commented on src/a.ts:42" shows, a note sits under that line in Changes, and the file list shows 1 beside src/a.ts                                                                                                   |
| AC-9  | Claude comments on a line that isn't in the diff               | The tool answers                                  | Claude gets the "isn't in this pull request's diff" answer, and no note appears                                                                                                                                              |
| AC-10 | Claude has made 20 comments                                    | It makes a 21st                                   | The tool refuses it with "That's 20 comments…"                                                                                                                                                                               |
| AC-11 | Claude finished with 8 comments                                | I look at the next-move bar                       | "Claude left 8 comments" and Post review                                                                                                                                                                                     |
| AC-12 | Those 8 notes                                                  | I untick one, edit another's text, then reload    | The unticked note stays dimmed and the edited text stays. The dialog says "7 of 8 comments will be posted."                                                                                                                  |
| AC-13 | Claude finished with no comments                               | I look at the bar                                 | "Claude found nothing to comment on." and Post review                                                                                                                                                                        |
| AC-14 | I press Post review                                            | The dialog opens                                  | Claude's summary is in Summary, Comment is chosen, and Claude's recommendation shows under the choices                                                                                                                       |
| AC-15 | The dialog with Comment and an empty summary                   | I press Post review                               | "Write a summary to comment or request changes." shows and nothing is sent                                                                                                                                                   |
| AC-16 | The dialog with Request changes                                | I press Post review                               | The fake GitHub gets one review: `REQUEST_CHANGES`, `commit_id` = the head Claude read, my summary, and the 7 kept comments with path, line and side. The dialog closes and the bar says "Review posted" with Open on GitHub |
| AC-17 | Any time before I press Post review                            | Claude works, I edit, I open and close the dialog | The fake GitHub gets no write                                                                                                                                                                                                |
| AC-18 | The author pushed 2 commits after Claude read the PR           | I open the dialog                                 | "The author pushed 2 commits since Claude read it…" shows, and posting uses the commit Claude read                                                                                                                           |
| AC-19 | GitHub answers 422                                             | I press Post review                               | The dialog stays with "GitHub refused it: <reason>", nothing is marked Posted, and pressing again sends the same review                                                                                                      |
| AC-20 | GitHub is unreachable, rate limited, or wants single sign-on   | I press Post review                               | The matching line shows and the dialog stays open                                                                                                                                                                            |
| AC-21 | A posted review, then a follow-up where Claude adds 2 comments | I press Post review again                         | The second review holds only those 2. The posted notes say "Posted" and have no Keep or Edit                                                                                                                                 |
| AC-22 | Claude is stopped after 3 comments                             | I look at the bar                                 | Post review is there, and the dialog counts 3                                                                                                                                                                                |
| AC-23 | A posted review                                                | The next sync runs                                | The Review requested row leaves Home                                                                                                                                                                                         |
| AC-24 | The Changes tab and the dialog                                 | I use only the keyboard                           | Tab reaches each note's Keep and Edit in the diff's order, and then Post review. Arrow keys move between the verdicts. Escape closes the dialog and focus returns to Post review                                             |
| AC-25 | The row, the notes, the file list counts and the dialog        | Checked at 360 and 1280 px, in light and dark     | No axe violations, nothing scrolls sideways, notes wrap inside the diff, and nothing shifts while the diff loads                                                                                                             |

## Out of scope

- Starting a review anywhere but Home's Review requested row: not from search, the composer's PR chip, or your own PR.
- Comments on a range of lines or on a whole file, and replies to existing threads. Spec 049 replies on your own PR.
- Pending reviews on GitHub, editing or deleting a review after it's posted, and dismissing one.
- Moving the checkout to commits pushed after Claude read the PR. Start a new session (part A).
- Claude removing or rewording its own comments.
- Running the PR's tests or build in a review session.
- Severity labels (blocking, nit), and sharing the review to Slack.
- Reviewing requests without a press, on a schedule or as they arrive.
- A Settings permission for posting reviews.

## Open questions

The work is not done until every question has an answer. Write the date with each answer.

| #   | Who decides | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Answer                                                                                                                                                                                                                            |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | You         | **How does Claude review?** **Recommended:** a read-only session on a detached checkout of the PR's head (part B), with comments through `review_comment` (part C), and you watch it on the Session screen. Claude reads the code around each change, not only the diff. This reverses spec 031 Q4 for reviews, and it fetches the PR into your saved folder's git. **The other choice:** one Claude call with no tools on the diff alone, in a dialog on Home, as spec 049 drafts replies. It's faster to build (no checkout, no tool, no DiffView change), but Claude sees only the diff (cut at 2,000 lines), and you wait in a dialog for a minute or two. | A read-only session on a detached checkout of the PR's head, with comments through `review_comment`. The user, 2 Nov 2026 ("use recommendations").                                                                                |
| Q2  | You         | **Where does it start?** **Recommended:** Review with Claude replaces + on Review requested rows, as Fix did in spec 047, and the PR still reaches the composer through + Add context or a paste. **The other choice:** keep + and add Review with Claude as a second action on those rows. Today `AttentionRow` shows one action.                                                                                                                                                                                                                                                                                                                             | Review with Claude replaces + on Review requested rows. The user, 2 Nov 2026.                                                                                                                                                     |
| Q3  | You         | **Which verdict does the dialog start on?** **Recommended:** always Comment, with Claude's recommendation on a line under the choices, so Approve and Request changes are always your pick. **The other choice:** start on Claude's recommendation.                                                                                                                                                                                                                                                                                                                                                                                                            | Always Comment, with Claude's recommendation on a line under the choices. The user, 2 Nov 2026.                                                                                                                                   |
| Q4  | You         | **Does the posted review say Claude drafted it?** **Recommended:** no. Nothing is added, as with spec 049's replies, because it's your review once you post it. **The other choice:** a last line, "Drafted with Claude in Orynx."                                                                                                                                                                                                                                                                                                                                                                                                                             | No, nothing is added. The user, 2 Nov 2026.                                                                                                                                                                                       |
| Q5  | You         | **Are the words and limits right?** The button and dialog names, the diff-only line, the tool's two refusals, "Claude left 6 comments", "Claude found nothing to comment on.", the pushed-since line, the summary error, the error lines, "Review posted", "Posted", and the limit of 20 comments.                                                                                                                                                                                                                                                                                                                                                             | Yes, as written in the Assumptions, with at most 20 comments. The user, 2 Nov 2026.                                                                                                                                               |
| Q6  | Design      | **No screen draws Claude's draft comment, its Keep and Edit, the file list's count, or the dialog.** **Recommended:** the reviewer's note in `session-review.html` (a raised, bordered box under the line), with `AgentChip`'s Claude mark in place of the avatar, a `Checkbox` for Keep and a ghost `Button` for Edit. `DiffView` gets a slot for a note under a line and `FileList` gets an optional count, each a change to `@devhub/ui` with a story and a test. The dialog reuses `Dialog`, `Textarea`, `ChoiceGroup` and `Callout`. No new component, token or dependency.                                                                               | The reviewer's note from `session-review.html` with the Claude mark, Keep and Edit; a note slot in `DiffView` and a count in `FileList`, each with a story and a test; the dialog from existing components. The user, 2 Nov 2026. |

## Design

`docs/design/screens/session-review.html`, two parts of it: the Changes tab (file list and diff), and the reviewer's note under a diff line (Priya Shah's, with "Fixed by Claude"). Claude's draft comment takes that note's look (Q6). `docs/design/screens/home.html` covers the Review requested row. No screen draws the Post review dialog, Keep and Edit, the file list's count, or the "Posted" note (Q6).
