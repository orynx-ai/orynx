# Session lifecycle: another session, Fix on Home, turns and cost, after the merge, and cleanup

Status: draft
Roadmap: folds in `021-after-the-merge` (Phase 3) and four of the user's asks from 27 Oct 2026 that aren't on the roadmap: "lets add all 3" (021, Fix review comments, time and cost); "let say a pr or ticket already in a session I can't start a new session … let us give user option to start in new"; "give user a option in setting to schedule delete of session to free up storage". Then: "can we do all in one spec and one branch and one pr" and "I think these are small features only". So this is one short spec, on `feat/047-session-lifecycle` from `origin/main` at `6bad4c6`. The branch also carries the notifications panel's height fix (`2ee3246`), which has its own e2e test and no row here.

## Assumptions

Correct these now, or the work goes ahead on them.

**A. Another session on the same ticket or PR**

- The block is the server's, not git's. `composeNow` answers `existing` while the ticket's (or your own PR's) session is anything but Stopped (`session-service.ts:1431`, `:1444`), and the app shows "PROJ-1423 already has a session." (`composer-words.ts:104`). Worktrees are named by session id, and branches already take the next free name (`worktrees.ts:131`), so a second session needs no git change.
- In place of that red line, an `info` `Callout` under the composer: **PROJ-1423 already has a session** · "Open it to carry on, or start a new session on its own branch." · **Start a new session** and **Open session**. For a PR the body ends "…on the same branch, from what's on GitHub."
- Start a new session sends the same draft again with `another: true` on `ComposerStartSchema`. Only the live-session check is skipped.
- A PR's second session works on the PR's branch in its own worktree, detached at what's on GitHub now. Nothing is ever force-pushed: if the other session pushed first, git refuses the push, as it does today.
- Both sessions keep their follow-up box, so the `newer_session` block goes (`session-service.ts:1261`).
- Where Orynx shows one session for a ticket (the Tickets card's chip, Home's row, the ticket dialog, search), it shows the newest one that isn't Stopped.
- PR merged and PR closed sessions (part C) don't count, so they never bring up the choice.

**B. Fix on Home**

- Home's row for your PR with unresolved review comments gets **Fix review comments**; one with failing checks gets **Fix failing checks**. Fix replaces + on those rows: an `IconButton` with `Wrench01Icon`, the icon of the design's "Fix failing checks" quick start. A PR from a fork keeps +.
- One press starts a Build on the PR's own branch (spec 031) with "Fix the unresolved review comments on web-app #2836." or "Fix the failing checks on web-app #2836.", the composer's model and effort, and opens the session. The composer's draft stays as it was. The brief already carries the unresolved threads (`brief.ts:147`).
- If it can't start (no folder for that repository), the PR goes into the composer as Build, and Send's own line says why.
- If the PR already has a live session, part A's choice shows instead.
- Nothing is written to GitHub. Push stays your click.

**C. After the merge (roadmap 021)**

- At each sync (hub start, every 2 minutes while a page is open, and Sync), Orynx asks GitHub for the state of each session's pull request, for sessions in PR open or PR closed whose worktree still exists. If GitHub can't be reached, nothing changes and nothing shows.
- Two new states: **PR merged** (the merge icon, in Done's green) and **PR closed** (the closed-PR icon, in PR open's grey). They show in the sidebar, the state pill, the Tickets chip and the Sessions page's Status filter.
- **Nothing would be lost** means: nothing uncommitted (git's ignore rules apply), and the worktree's last commit is the PR's last commit or an older one on that branch, which holds after a merge, squash or rebase, even once GitHub deletes the branch. If git can't tell, the worktree stays. Part D uses the same check.
- On a merge where nothing would be lost, Orynx removes the worktree the way Delete does and keeps the branch. It decides once; Delete still works by hand.
- A closed PR keeps its worktree; reopened, it goes back to PR open.
- A merged session takes no more follow-ups: its box becomes "This pull request is merged. Start a new session from the ticket to carry on."
- While Claude is working, the check waits for the next sync.

**D. Cleanup schedule**

- Settings › Coding agent gets a last section, **Storage**, with **Delete old sessions**: Never (the default), After 7 days, 14 days, 30 days or 90 days, a `Select` saved with the other preferences in `settings.json`.
- Age counts from the session's last update (`updatedAt`). Opening, renaming or pinning it doesn't reset it.
- Done, Stopped, PR merged and PR closed sessions can go. Working, waiting, pinned and PR open sessions never do.
- It uses part C's "nothing would be lost". A session with no PR whose commits were never pushed counts as safe, because its branch keeps them (Q4). A missing worktree counts as safe.
- An automatic delete is today's Delete with the branch kept: the session's servers and terminals stop and its worktree goes.
- It runs when the setting changes, at hub start and every hour, one session at a time. A failed delete leaves that session, and the next run tries again.
- Storage shows the worktrees' total size, and under the choice what it would delete now: "3 sessions now, 4.1 GB". The hub measures by walking the files: no `du`, no new dependency.
- A run that deleted anything leaves one bell notification, "Orynx deleted 3 old sessions and freed 4.1 GB.", with no pop-up.

**E. Turns and cost**

- Time already shows beside "Claude's progress" (spec 013). Turns and cost join it on the same muted line: "4 min 12 s · 38 turns · ≈ $1.42", with "1 turn" and "< $0.01". Its tooltip: "Claude's working time, its turns with the model, and what they'd cost at API prices. Your company's Claude plan may bill differently."
- Both come from the SDK's `result` message, which Orynx already reads and ignores (`sdk-messages.ts:67`). Turns add up over every run; cost is the latest run's running total, since the SDK carries it across a resume. `/plan` checks that with one real follow-up.
- They're saved in `session.json` (`turns`, default 0; `costUsd`, default null), so older sessions show the time only. They change when a turn ends, not while Claude works. A stopped turn's numbers count too.
- Orynx's own calls to the model (reading the ask first, drafting a pull request) aren't counted.

## Goal

Start another session on work that already has one, fix a pull request's review comments or failing checks in one press, and see what a session cost. Old sessions stop filling the disk: Orynx tidies up after a merge, and deletes old sessions on a schedule you pick in Settings.

## Acceptance criteria

| ID    | Given                                                                             | When                                       | Then                                                                                                                                 |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| AC-1  | PROJ-1423 has a Done session                                                      | I send a Build with PROJ-1423              | The "PROJ-1423 already has a session" callout shows under the composer with Start a new session and Open session, and nothing starts |
| AC-2  | That callout                                                                      | I press Start a new session                | A second session starts in its own worktree on its own branch, and both are in the sidebar                                           |
| AC-3  | That callout                                                                      | I press Open session                       | The existing session opens and my draft is still in the composer                                                                     |
| AC-4  | My PR #2836 has a session                                                         | I start another on it                      | The new one works on the PR's branch in its own worktree; neither session's edits show in the other's Changes                        |
| AC-5  | Two sessions on PROJ-1423                                                         | I look at Tickets, Home, the dialog, ⌘K    | Each shows the newer session; both sessions keep their follow-up box                                                                 |
| AC-6  | Home lists my PR with unresolved comments                                         | I press Fix review comments                | A Build starts on the PR's branch with the threads in its brief and opens; the composer's draft is unchanged                         |
| AC-7  | Home lists my PR with failing checks                                              | I press Fix failing checks                 | The same, with the failing-checks message                                                                                            |
| AC-8  | No folder's `origin` is the PR's repository                                       | I press Fix                                | The PR is in the composer as Build and Send's line says why                                                                          |
| AC-9  | That PR has a live session                                                        | I press Fix                                | Part A's callout shows                                                                                                               |
| AC-10 | Home's rows                                                                       | I use only the keyboard                    | Tab reaches Fix, its tooltip and name say what it fixes, and Enter presses it                                                        |
| AC-11 | A session in PR open                                                              | Its PR is merged and Orynx syncs           | It's PR merged in the sidebar, the pill, the Tickets chip and the Sessions Status filter                                             |
| AC-12 | That merge, with nothing uncommitted or unpushed                                  | The sync sees it                           | The worktree is gone, the branch is still there, and the follow-up box is replaced by the merged line                                |
| AC-13 | That merge, with an uncommitted file in the worktree                              | The sync sees it                           | The worktree stays and the session is PR merged                                                                                      |
| AC-14 | A session's PR                                                                    | It's closed unmerged, then reopened        | PR closed with its worktree kept, then PR open again                                                                                 |
| AC-15 | GitHub can't be reached                                                           | Orynx syncs                                | No session's state changes and no error shows                                                                                        |
| AC-16 | Settings › Coding agent                                                           | It opens                                   | Storage shows a skeleton line, then the worktrees' total size; Delete old sessions says Never                                        |
| AC-17 | Four sessions older than 30 days, three safe to delete                            | I choose After 30 days                     | It saves, says "3 sessions now, …", and those three are gone within a minute, branches kept                                          |
| AC-18 | Old sessions that are working, waiting, pinned, PR open, or hold uncommitted work | A run happens                              | None of them is deleted                                                                                                              |
| AC-19 | A run deleted sessions                                                            | I open the bell                            | One notification says how many and how much space; no pop-up showed                                                                  |
| AC-20 | A delete fails (git errors)                                                       | The run ends                               | That session is still there, and the next run tries again                                                                            |
| AC-21 | Delete old sessions is Never                                                      | The hub starts, and an hour passes         | Nothing is deleted                                                                                                                   |
| AC-22 | A session finished a turn                                                         | I look at Claude's progress                | It reads "… · 38 turns · ≈ $1.42" and the tooltip explains the estimate                                                              |
| AC-23 | I send a follow-up after Done                                                     | That turn ends                             | Turns add up and the cost shows the new total                                                                                        |
| AC-24 | A session from before this change, or one still in its first turn                 | I open it                                  | Only the time shows                                                                                                                  |
| AC-25 | The callout, Fix, the two new states, Storage and the cost line                   | Checked at 360 and 1280 px, light and dark | No axe violations, nothing scrolls sideways, and nothing shifts while it loads                                                       |

## Out of scope

- Replying to or resolving review threads on GitHub.
- Cost on the Sessions page or per step, and warnings near the plan's limit.
- A typed number of days, or asking before the first cleanup.
- Merging or stacking the branches of two sessions on one PR.
- Cleaning anything outside `~/.devhub/worktrees`.

## Open questions

The work is not done until every question has an answer. Write the date with each answer.

| #   | Who decides | Question                                                                                                                                                                         | Answer |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Q1  | Design      | PR merged has no purple token. Recommended: the merge icon in Done's green, and PR closed in PR open's grey. The product spec's Session states table gains both rows.            |        |
| Q2  | You         | After a merge, remove the worktree by itself (recommended), or wait for a Remove button you press?                                                                               |        |
| Q3  | You         | Your Claude login is a subscription, so the dollar figure is what the session would cost at API prices. Show it as "≈ $1.42" with the tooltip (recommended), or show turns only? |        |
| Q4  | You         | Can the schedule delete a session whose commits were never pushed, since its branch keeps them (recommended), or must origin have them first?                                    |        |
| Q5  | You         | Is the wording in the Assumptions right: the callout, Fix's names and messages, the merged line, the new states, Storage's lines, the bell's line and the cost tooltip?          |        |
| Q6  | Design      | No screen draws any of this. Recommended: reuse `Callout`, `IconButton`, `Select`, the state pill and the progress line (`session.html:990`), with no new drawing or component.  |        |

## Design

None: no file in `docs/design/screens/` draws these. They reuse `session.html`'s progress line and state pill, `home.html`'s rows, and `settings.html` for Settings' frame (Q6).
