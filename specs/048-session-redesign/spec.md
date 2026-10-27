# Session page redesign: the title row, the next-move bar, What Claude did by step, and a roomier Changes tab

Status: approved
Roadmap: not on the roadmap. This is the user's ask from 27 Oct 2026: "improve the session details page", with their mockup "3b · Session, redesigned (PR review fixes)" (an exported HTML artboard, 1440 × 1000, light only). 046 (`feat/046-trace-steps`) and 047 (`feat/047-session-lifecycle`) are taken, so this is 048, on `feat/048-session-redesign` from `origin/main` at `a954f47`, in its own worktree (`../orynx-048`).

## Assumptions

Correct these now, or the work goes ahead on them.

**A. What the mockup is**

- It's the reference for the layout, the parts and their order, not for values. It was drawn on an older DevHub design system: an indigo accent (ours is near-black), text at 13 and 14 px (ours is 14 and 16), weight 600 (ours stops at 500), text at 11, 11.5 and 12.5 px (ours starts at 12), and "DevHub" in the sidebar. Each value maps to our nearest token: its 20/600 title is `title-lg`, its 14 px text `body`, its 13 px `small`, its 11–12.5 px `label`, its mono 12 `code`, and its 10, 14 and 18 px gaps the 4 px scale.
- Only the main pane changes. The mockup's sidebar (Needs you, Open PRs, Done groups) and the bell in the sidebar's head aren't part of this.
- It shows one session at one moment: a Build on your PR, done, ready to push. Every other state (working, waiting for you, ready for a pull request, stopped, an Ask, loading, an error) keeps today's look inside the new layout, and the narrow layout is today's (Q4).
- Spec 047 lands first. Its "Fix review comments" is how a session like the mockup's starts, and its turns and cost join the time beside the left pane's heading. `/plan` rebases this branch on `main` once 047 is merged.

**B. The page bar and the title row**

- The page bar keeps its breadcrumb and More actions. "Started 4 min ago" moves to the title row's meta line as "started 4 min ago".
- **Terminal** comes out of More actions into the bar, as a ghost button with its shortcut in a `Kbd`, when the session has a terminal (spec 038). Under 768 px it goes back into More actions, as today.
- Open PR #2974 stays in the bar. Stop stays in the bar while Claude works. **Create pull request** and **Push changes** leave the bar for the next-move bar (part C).
- The title row: the title, then one meta line: the state pill (as today), the skills your message named (`/fix-review-changes`, mono, from the brief step), the folder's name, the branch in mono, cut with the full name on hover, with a `CopyButton` labelled "Copy branch name", then "own worktree" and "started 5 days ago". An Ask keeps its own words ("Ask session · changes nothing").
- The stepper moves beside the title, on the right, where there's room, and wraps under the title where there isn't (Q3).

**C. The next-move bar**

- A `Callout` under the title row, the width of the page, that shows only when the next move is yours and isn't an approval (approvals stay where they are, under the last step):
  - **Ready to push** (`warning`): the pull request is open, Claude isn't working, the worktree is there and something is unpushed (today's `canPush`). "5 files, +217 −7. Nothing leaves your machine until you push." with **Push to PR #2974** (primary), which opens today's Push dialog.
  - **Ready for a pull request** (`warning`): today's `canCreatePullRequest`, with changes. "5 files, +217 −7. Nothing leaves your machine until you create it." with **Create pull request** (primary), which opens today's dialog.
  - **Pushed to PR #2974** (`success`): the pull request is open and nothing is unpushed. "GitHub has everything from this worktree." No button.
- The mockup's "128 tests pass" isn't shown: Orynx doesn't count test results. Its "Pushing to PR #2974…" stays inside today's Push dialog.
- These buttons are the page's one primary button, so the page bar has none.

**D. What Claude did**

- "Claude's progress" is renamed **What Claude did**. Its time (and 047's turns and cost) stay beside the heading, with **Expand all** / **Collapse all** after them.
- The steps are grouped under the session's own steps, the stepper's words (spec 042): one row for each step that has started, with its dot (done: the green tick; current: amber while it waits for you, plain otherwise), its words, one summary line (the latest row in it, in today's words), how long it took ("18 min", Q8) and a chevron.
- To group them, the server records with each activity the step it happened in and when it started. Both are optional, so a session saved before this shows today's flat list, with no groups, times or Expand all.
- Pressing a group's row opens it in place (`aria-expanded`). Inside are today's rows for that step, as label and detail. A command shows on one line, cut, in a mono box. Pressing the box shows it in full, pressing it again cuts it.
- The current step's group starts open and the others closed. Several can be open. A group stays open while the session updates. Orynx forgets which were open when you leave the page.
- The approval callout and Claude's last summary stay where they are today: the approval under the last row, inside the open current group, and the summary after the groups, always shown.
- The follow-up box stays at the pane's foot.

**E. The right pane**

- The tabs keep today's rules and counts, in the mockup's order: Changes, Ports, Context. The tab Orynx opens first doesn't change (spec 042). Full screen stays at the row's end.
- On the Changes tab, the tab row also holds the totals ("+217 −7", with the spoken words today's summary has) and **Wrap lines**, a toggle button (`aria-pressed`), on by default. Orynx remembers it in this browser for every session (Q5). "Updates live as Claude edits" goes.
- Where there's room, the changed files are a column on the left (240 px) and the diff fills the rest. Each file is two lines: its name in mono, then its folder (cut, full path on hover) and its counts. The selected one has today's look.
- The diff's header: the folder muted and the name, a **New file** pill for a file git calls added, and a **Viewed** checkbox. Viewed is remembered in this browser for that session and file, and clears when the file's +/− counts change. The server adds whether a file is new to `ChangedFile` (optional, so an old answer reads as not new).
- Wrap lines on: long lines wrap under their own code, beside the line number. Off: they scroll inside the diff, as today. The page never scrolls sideways.
- The diff keeps one number column, as today. The mockup's two (old and new) aren't part of this.

**F. The layout**

- From 1024 px, the page is the window's height. The title row and the bar sit at the top. Under them the two panes sit side by side: What Claude did 400 px wide, the tabs the rest. Each pane scrolls on its own, and the follow-up box stays at the left pane's foot (Q4).
- Under 1024 px, the panes stack as they do today, the window scrolls, and the files sit above the diff.

**G. Review comments: not in this spec (Q1)**

- The mockup's Review comments tab, the review notes inside the diff, the note marks in the file list, "See the 3 fixes", "Reply to reviewers" and **Post 3 replies on GitHub** need Orynx to keep each review thread (today it reads them only to write Claude's brief), Claude to report what it changed and a reply for each, and a new write to GitHub. That's its own spec, next after this one.

## Goal

When I open a session I see straight away where it is and what I need to do next, with the one button for it. I can scan what Claude did step by step, open only the step I care about, and read the diff in a roomy view where long lines wrap and I can tick off the files I've looked at.

## Acceptance criteria

| ID    | Given                                                                    | When                                                       | Then                                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | A Build on my PR #2974, done, with 5 changed files unpushed              | I open it                                                  | The bar under the title says "Ready to push" and "5 files, +217 −7. Nothing leaves your machine until you push.", with Push to PR #2974 as the page's only primary button               |
| AC-2  | That bar                                                                 | I press Push to PR #2974                                   | Today's Push dialog opens. Nothing is pushed until I confirm in it                                                                                                                      |
| AC-3  | The push finished                                                        | I look at the bar                                          | It says "Pushed to PR #2974" and "GitHub has everything from this worktree.", in green, with no button                                                                                  |
| AC-4  | A done Build with changes and no pull request                            | I open it                                                  | The bar says "Ready for a pull request" with Create pull request, which opens today's dialog                                                                                            |
| AC-5  | Claude is working, is waiting for my approval, or has stopped; or an Ask | I open the session                                         | There's no bar. A waiting session's approval is under its last row, as today                                                                                                            |
| AC-6  | Any Build                                                                | I look at the title row                                    | The meta line shows the state pill, the skills I named, the folder, the branch with Copy branch name, "own worktree" and "started …"                                                    |
| AC-7  | That row                                                                 | I press Copy branch name                                   | The full branch name is on the clipboard, and the button says Copied for 2 s, as every `CopyButton` does                                                                                |
| AC-8  | A session with a terminal, at 1280 px                                    | I look at the page bar                                     | Terminal shows with its shortcut. At 360 px it's in More actions                                                                                                                        |
| AC-9  | The window is 1280 px wide                                               | I look at the stepper                                      | It sits on the right of the title. At 360 px it wraps under the title                                                                                                                   |
| AC-10 | A session saved after this change, Claude in its third step              | I look at What Claude did                                  | Each started step is one row with its dot, words, summary, time and chevron. The third is open, the first two closed                                                                    |
| AC-11 | A closed group                                                           | I press its row, or Enter or Space on it                   | It opens in place, the chevron turns and a screen reader hears it expanded. Pressing again closes it. Focus stays on the row                                                            |
| AC-12 | Some groups are closed                                                   | I press Expand all                                         | All open, and the button says Collapse all                                                                                                                                              |
| AC-13 | An open group with a long command                                        | I press the command                                        | It shows in full, wrapped. Pressing again cuts it to one line                                                                                                                           |
| AC-14 | A group is open while Claude works in it                                 | Claude adds a row                                          | The new row shows in the open group, and the group stays open                                                                                                                           |
| AC-15 | A session saved before this change                                       | I open it                                                  | What Claude did is today's flat list, with no groups, times or Expand all                                                                                                               |
| AC-16 | Claude finished with a summary                                           | I look at What Claude did                                  | The summary shows after the groups, in full                                                                                                                                             |
| AC-17 | The window is 1280 px wide and the session is long                       | I scroll What Claude did                                   | Only that pane scrolls. The follow-up box stays at its foot, and the tabs stay where they are                                                                                           |
| AC-18 | The Changes tab at 1280 px                                               | I look at it                                               | The files are a column on the left, each with its name, folder and counts, and the diff fills the rest. The tab row shows "+217 −7" and Wrap lines, pressed                             |
| AC-19 | A diff with a line longer than the pane                                  | Wrap lines is on, then off                                 | On, the line wraps beside its number. Off, it scrolls inside the diff. The page never scrolls sideways                                                                                  |
| AC-20 | I turned Wrap lines off                                                  | I open another session                                     | It's still off                                                                                                                                                                          |
| AC-21 | A file git calls added                                                   | I select it                                                | Its header has a New file pill                                                                                                                                                          |
| AC-22 | A file I ticked Viewed                                                   | I leave and come back                                      | It's still ticked. Once Claude changes that file again, it's not                                                                                                                        |
| AC-23 | The Changes tab at 360 px                                                | I look at it                                               | The files are above the diff, as today, and nothing scrolls sideways                                                                                                                    |
| AC-24 | The session is loading                                                   | It arrives                                                 | The skeleton has the new layout's shape, and nothing moves when the session replaces it                                                                                                 |
| AC-25 | The session can't load, or the changes can't                             | I look                                                     | Today's error lines and Try again show, in the new layout                                                                                                                               |
| AC-26 | The whole page                                                           | I use only the keyboard                                    | Tab reaches every control in reading order: the page bar, the title row, the bar's button, the left pane, then the tabs and the Changes tab. One focus ring, and focus is never trapped |
| AC-27 | Light and then dark, at 360, 768, 1280 and 1440 px                       | I look at a ready-to-push, a working and a stopped session | Every part reads clearly, with tokens only, and nothing scrolls sideways. Axe reports no violations                                                                                     |

## Out of scope

- Review comments: the tab, notes in the diff, marks in the file list, replies and posting them to GitHub (part G, its own spec).
- The mockup's sidebar groups and the bell's place.
- Test counts in the bar, and "Pushing…" outside the Push dialog.
- Two line-number columns in the diff.
- 046's shimmer, failed and to-come steps (Q2).
- Any new dependency.

## Open questions

The work is not done until every question has an answer. Write the date with each answer.

| #   | Who decides | Question                                                                                                                                                                                                                                                                                                                                                                             | Answer                                                                                                                                                                               |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | The user    | The Review comments parts need the server to keep each review thread, Claude to report a change and a reply for each, and Orynx to post replies to GitHub on your click. **(a) Recommended:** this spec does the layout and everything else; Review comments is the next spec. **(b)** All of it in this spec, one branch and one PR.                                                | (a): the layout and everything else here; Review comments is the next spec. The user, 27 Oct 2026 ("use recommendations").                                                           |
| Q2  | The user    | Spec 046 (a draft, unanswered) also opens steps in place. **(a) Recommended:** this spec's groups take that over; 046 keeps the shimmer, failed and to-come steps, and is rewritten on top of this after it merges. **(b)** Fold 046 into this spec. **(c)** Drop 046.                                                                                                               | (a): this spec's groups take over opening in place; 046 keeps the shimmer, failed and to-come steps and is rewritten on top of this. The user, 27 Oct 2026.                          |
| Q3  | The user    | The design system says the stepper "sits under the page title"; the mockup puts it beside the title. **Recommended:** beside it where there's room, under it where there isn't, and the agent updates design-system.md's Stepper section on this branch for you to approve.                                                                                                          | Beside the title where there's room, under it where there isn't; the agent updates design-system.md's Stepper section on this branch for the user to approve. The user, 27 Oct 2026. |
| Q4  | The user    | clean-ui says "only the window scrolls; never add a scroll box around the page body". The mockup makes both panes scroll on their own (today only the right one does, your call of 19 Oct 2026). **Recommended:** both panes scroll on their own from 1024 px, the follow-up box stays at the left foot, and under 1024 px it's today's stacked page. The mockup draws 1440 px only. | Both panes scroll on their own from 1024 px, the follow-up box at the left foot; under 1024 px, today's stacked page. The user, 27 Oct 2026.                                         |
| Q5  | The user    | DiffView's design says wide lines scroll inside the diff; the mockup adds Wrap lines, on by default. **Recommended:** on by default, remembered in this browser, and DiffView gets a `wrap` option with a story for each.                                                                                                                                                            | On by default, remembered in this browser; DiffView gets a `wrap` option with a story for each. The user, 27 Oct 2026.                                                               |
| Q6  | The user    | `docs/design/**` comes from people. **Recommended:** add your mockup as `docs/design/screens/session-review.html` with a light screenshot, and the screen's `Design:` note points to it; dark is checked by the design reviewer. **(b)** You add it yourself.                                                                                                                        | (a): the agent adds the mockup as `docs/design/screens/session-review.html` with a light screenshot. The user, 27 Oct 2026.                                                          |
| Q7  | The user    | Is the wording in the Assumptions right: "What Claude did", "Expand all" / "Collapse all", "Ready to push", "Ready for a pull request", "Pushed to PR #2974", their lines, "Push to PR #2974", "Copy branch name", "own worktree", "started …", "Wrap lines", "New file" and "Viewed"?                                                                                               | Yes, as written in the Assumptions. The user, 27 Oct 2026.                                                                                                                           |
| Q8  | The user    | The design shows no time for a step under a minute, or for one still going. **Recommended:** "< 1 min" under a minute, whole minutes up to an hour ("18 min"), then "1 h 5 min"; a running step shows no time until it ends.                                                                                                                                                         | "< 1 min", whole minutes to an hour, then "1 h 5 min"; no time while a step runs. The user, 27 Oct 2026.                                                                             |

## Design

The user's mockup "3b · Session, redesigned (PR review fixes)" (1440 × 1000, light), to be added as `docs/design/screens/session-review.html` (Q6): its title row, stepper, next-move bar, "What Claude did" and the Changes tab. It replaces `docs/design/screens/session.html`'s title row, Claude's progress and Changes tab. Its sidebar and its Review comments tab aren't built here (part G). States it doesn't draw keep `session.html`'s look (part A).
