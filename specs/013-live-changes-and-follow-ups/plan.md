# Plan: Live changes and follow-ups

Spec: `specs/013-live-changes-and-follow-ups/spec.md`

## Before the first task

012 merged on 18 Oct 2026 (PR #20), and this branch is rebased onto that `main`. The plan was first written against `feat/012-approvals` at `2c7c2a0`. 012's review changed only the order Always allow is saved in, when it's offered, and the callout's focus, none of which this plan touches.

The spec's answers fit what 011 and 012 built, at these hand-over points:

- `sendMessage()` rejects.
- The prompt stream stays open until `finished`, then closes, and Claude Code exits.
- `claudeSessionId` is saved and never used.
- `session-screen.tsx` puts Claude's progress at full width, with Discard under it.
- `DiffView` takes `DiffLine`s and says "spec 013 turns git's output into them".
- The worktree records only the base's name (`origin/main`), not the commit it started from.

## Order of work

Today a session runs once. Claude's input closes when it finishes, and the screen shows only its steps. This spec adds three things: a way to talk to Claude again (into the open stream while it works, or by resuming Claude Code's own session afterwards), a read-only view of what changed in the worktree, and the ticket Claude started from.

1. **Check the one outside unknown first** (task 1, done). The `vscode://file/<folder>` and `cursor://file/<folder>` links each opened a folder on 18 Oct 2026.
2. **Contracts and the editor setting** (tasks 2 to 6).
   - Sessions gain:
     - the `message` step and the `resume` problem;
     - `ticket` (type, description, and the status and due date from the cache);
     - `followUp` (open, or why not, with the newer session's id);
     - `worktreePath`;
     - `workedMs` and `runStartedAt` for Q3's working time.
   - `POST /api/sessions/:id/messages` takes `{ text }` (trimmed, 1 to 10,000 characters). It answers `sent` or `cannot_send` with a reason, the way `POST /api/sessions` answers `cannot_start`.
   - Changes get their own schemas.
     - `SessionChanges`: why there are none, the files (path, counts, binary, renamed from), how many more there are, and the totals.
     - `FileDiff`: the path, `DiffLine`s including the `hunk` kind, binary, renamed from, and whether it was cut short.
   - The new event is `session.files.changed`, which carries only the id.
   - The preferences gain `editor` (`vscode` by default, or `cursor`), saved as `agent.editor` by the preferences service like the mode (Q9, as the user answered it).
3. **Reading the changes in core** (tasks 7 to 10). These are pure pieces first, then git on a real temporary repository.
   - The worktree records its starting commit when it's made. For older sessions, Orynx uses `git merge-base HEAD <base>`.
   - A unified-diff parser turns git's output into `DiffLine`s. It's pure and tested as a table: hunks, numbers on both sides, "No newline at end of file", renames, binary, and the 2,000-line cut.
   - `changes.ts` lists the files.
     - It runs `git -c diff.autoRefreshIndex=false --no-optional-locks diff --numstat -z -M <start>`, plus `git ls-files --others --exclude-standard -z`. The setting is what keeps the index unwritten: `--no-optional-locks` alone doesn't stop a diff's refresh (found in task 9).
     - New files are read straight from disk, because git would need one process for each: their lines counted, binary by git's own test (a NUL in the first 8,000 bytes). A new file that isn't a regular file inside the worktree, or has another hard link, is listed as binary and never read.
     - Files come in the order of Claude's edit steps, then by path, capped at 300.
     - Hooks are off, it uses `gitEnvironment()`, and every call has a 10-second limit.
   - `fileDiff()` reads one file. It answers only for a path that's in the current list.
4. **Talking to Claude** (tasks 11 to 13).
   - The adapter's prompt becomes a queue. `sendMessage()` pushes a user message with its own uuid and `priority: 'next'`. It answers false once the input is over.
   - A success `result` counts as finished only when `queued_turn_count` is 0 and every uuid Orynx sent is in `user_message_uuids` (spec 013 Q1, AC-12). Otherwise Claude still has a message to answer and stays Working.
   - Once Stop is pressed, `canUseTool` refuses every call. If a sent message is still unconsumed after the interrupt, the process is closed at once rather than after the 5-second grace period, so Claude never acts on it (AC-17).
   - `startSession` takes `{ resume }`. A resumed run counts as the `resume` problem (AC-16) in two cases: it ends before Claude Code's `init`, or its `init` names a different session id (so Claude Code started afresh).
   - The message reader says when an edit's or a command's result arrives, which becomes the `files_changed` event.
5. **The session service** (tasks 14 to 16).
   - Progress gains the `message` step. Resuming moves the stepper from Review back to Build (Q3a), and `workedMs` adds up each run.
   - `send()` routes the message:
     - into a live run, which adds the step;
     - or to a resume of the session, which first checks whether it was discarded, Claude never started, the ticket has a newer live session, or three sessions are already working.
   - `session.files.changed` goes out at most once a second for each session.
   - A follow-up is logged by session id only.
   - The note gains Q2a's sentence.
   - The session detail gains the ticket. It's saved at the start from 013 on; older sessions read it back from `brief.md`. The status and due date come from `describeTicket()`, which grows to carry them.
   - The detail also gains `followUp` and `worktreePath`.
6. **Routes and the e2e fake** (tasks 17 and 18).
   - The three routes, with the leak test at `LOG_LEVEL=trace` covering messages and diffs.
   - The fake Claude Code learns three things:
     - `--resume`: an unknown id exits before `init`;
     - folding a message that arrives mid-run, reporting it as consumed;
     - a follow-up script that edits a second file.
7. **api-client** (task 19): `sendMessage`, `sessionChanges` and `sessionDiff` with their query options.
   - The changes keys sit under `queryKeys.sessions`, so `sessions.changed` refreshes them too.
   - `live-updates.tsx` maps `session.files.changed` to the changes keys of that session only.
   - The changes queries have `staleTime: 0`, so returning to the window refetches them.
8. **`@devhub/ui`** (tasks 20 and 21).
   - `FileList` gains `maxRows`: it scrolls inside its box after that many rows (Q6c).
   - A new `Markdown` component lays out exactly what `adf-markdown.ts` writes (Q8). Its parser is pure and tested as a table. Links are `http` or `https` only and go through an `onOpenLink` callback. Raw HTML stays text. A wide code block or table scrolls inside its box. It's styled to the five sizes and two weights; `session.html`'s 600-weight heading becomes 500, as clean-ui says.
9. **The app** (tasks 22 to 27).
   - The words.
     - `dueText` moves to `words/`, now that two screens use it.
     - New step and problem words.
     - The changes, follow-up and ticket lines from Q10.
   - The route's search becomes `?tab=changes|ticket&file=`.
   - The two-pane layout: `full` width, each pane its own height, the box sticky at the window's bottom, and progress first on narrow windows.
   - `ChangesPanel`:
     - the summary line, `FileList` with 8 rows, and `DiffView`;
     - the selection from `?file`, the first file by default, and the selection kept while the list changes;
     - the empty states, the error with Try again, Open in VS Code, and Discard moved here.
   - `TicketPanel`.
   - `FollowUpBox`:
     - react-hook-form with the contract's schema, inside 006's `Composer` (`look="follow-up"`);
     - Enter sends, Shift+Enter adds a line, and Enter while composing doesn't send;
     - a per-session draft in `features/sessions/store.ts`, not persisted (the client-state skill);
     - busy, refused and error states, and the off line with its link.
   - Settings › Coding agent's "Editor": a `ChoiceGroup` of two `ChoiceCard`s, as Appearance draws it. The Changes tab's link follows it: `vscode://file/<worktree>` or `cursor://file/<worktree>`.
10. **e2e, docs, the browser and the real run** (tasks 28 to 33), then `/review`.

## Risks

| Risk                                                                                                                                                                                               | How we will notice early                                                                                                                    | What we do                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code takes a mid-turn message differently from the SDK's types: it doesn't fold it in, or runs it as a next turn after a `result` Orynx already read as finished                            | Task 11 tests both shapes with the fake SDK. The real run (task 32, Q11) sends a message while Claude works                                 | Finished means `queued_turn_count` is 0 and every sent uuid is consumed. Both fields are in the pinned SDK's types, and its own Claude Code ships with it. If the real run shows otherwise, stop and ask before `/review` |
| A message sent just as Claude finishes, after the input closed, gets lost                                                                                                                          | Task 14's test sends right after `finished`                                                                                                 | `sendMessage()` answers false once the input is over, and the service then resumes instead                                                                                                                                |
| Stop comes while a sent message waits in Claude Code's queue, and Claude acts on it before the process ends (AC-17)                                                                                | Task 11's test stops with an unconsumed message and expects no allowed call afterwards                                                      | `canUseTool` refuses everything once Stop is pressed. The process is closed at once when a message is unconsumed. Reads that Claude Code allows by itself change nothing                                                  |
| A resume finds no transcript and Claude Code quietly starts a new conversation with only the follow-up text                                                                                        | Task 12's test: `init` with a different session id                                                                                          | That's the `resume` problem (AC-16): the run stops and the callout says so. The real run checks what the pinned Claude Code does (task 32)                                                                                |
| Reading the diff writes the worktree's index (git refreshes its stat cache), which breaks "never changes the index"                                                                                | Task 9 hashes the worktree's index around a read, after touching a cached file more than a second later; the test fails without the setting | `diff.autoRefreshIndex=false` and `--no-optional-locks` on every call, no `git status`, no `git add`. New files are read from disk, never through git                                                                     |
| An untracked symlink, hard link or path parameter reaches outside the worktree (AC-24)                                                                                                             | Tasks 9 and 10: `../../runtime.json`, an absolute path, a symbolic and a hard link to a file outside, a path not in the list                | The diff answers only for a listed path. A new file must be a regular file with one link whose real path is inside the worktree, or it's listed as binary and never read                                                  |
| `git diff` is slow on a big repository, or on a folder full of untracked files (`node_modules` not ignored), and a live session refetches it every second                                          | Task 9's 350-file test is timed. The real run uses a throwaway repository, so there's no early signal from a big one                        | 10 seconds per git call, a 300-file cap (new files beyond it are counted, not read), refetches at most once a second and only while the Changes tab is on screen. A timeout shows "Couldn't read the changes."            |
| Old sessions on your disk (from 011 and 012 builds) lack the new fields                                                                                                                            | Task 16 reads a saved 012 `session.json`                                                                                                    | Schema defaults: no `ticket`, so read `brief.md`; `workedMs` from `startedAt` to `endedAt`; no start commit, so use `merge-base`                                                                                          |
| The sticky box, the sticky page bar and a list growing live shift the layout                                                                                                                       | Task 27's tests at 360 and 1280. Task 31 measures CLS with `page.route`                                                                     | The list is capped at 8 rows; skeletons are the real sizes; the diff keeps its scroll position when it refetches                                                                                                          |
| The Markdown renderer misreads the converter's output                                                                                                                                              | Task 21 runs the parser on `adf-markdown.ts`'s own test outputs, as a table                                                                 | Anything it doesn't know shows as plain text                                                                                                                                                                              |
| An editor's link opens only a file, or nothing, on another computer                                                                                                                                | Task 1 found both open a folder here; the real run (task 32) tries both again                                                               | The button is a link, so nothing breaks in Orynx; the install guide (018) says which editors it opens                                                                                                                     |
| e2e ports collide with other worktrees' runs (fixed 4393–4399), and the home-inbox AC-18 flake                                                                                                     | `lsof` before `pnpm test:e2e`                                                                                                               | Never kill another run. Read the first failure of a retried spec                                                                                                                                                          |
| Spec 020 (`feat/020-first-use-feedback`, not merged) adds `IconButton`, `Tooltip`, `pnpm gate icon-buttons` and a rule that every icon-only control has a visible tooltip; 013's round Send is one | `git log origin/main` before task 25                                                                                                        | If 020 has merged, Send and any other icon-only control use its pieces; if not, use `ComposerSend` as 012 does and say so in the review                                                                                   |
| 012 changes in its review after this branch has built on it                                                                                                                                        | 012's PR diff when it merges                                                                                                                | Move this branch onto `main` before the next task. Re-run `pnpm verify`                                                                                                                                                   |
| The learn-freshness gate fails once sources change                                                                                                                                                 | `pnpm gate learn-freshness` in task 30                                                                                                      | Update `learn/sessions-and-worktrees.md` and `learn/live-updates.md` in the same change                                                                                                                                   |

## Touches

- Packages: contracts, core, api-client, ui, app, e2e. Nothing in `apps/server`: no new setting.
- New dependency: none (Q8a).
- People-owned files not edited: `docs/design/**`, `tokens.css`, `docs/product/spec.md`.
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, test-policy, learn-freshness, specs, handbook-size, secrets, and Storybook a11y.
- Skills to follow: `.claude/skills/agent-runtime/SKILL.md`, `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/server-state/SKILL.md`, `.claude/skills/client-state/SKILL.md`, `.claude/skills/forms/SKILL.md`, `.claude/skills/add-ui-component/SKILL.md`, `.claude/skills/build-a-screen/SKILL.md`, `.claude/skills/clean-ui/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`.
