# Tasks: Live changes and follow-ups

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Check that a `vscode://file/<folder>` link opens the folder in VS Code (Q9), and, at the user's answer to Q9, a `cursor://file/<folder>` link in Cursor too: ask the user first (it opens windows), then `open` each once on a temporary folder, and write down what opened (AC-20)
      Check: the outcome recorded under this task
      Files: specs/013-live-changes-and-follow-ups/tasks.md
      Done 18 Oct 2026: VS Code 1.107.1 (registered for `vscode:`) and Cursor each opened the scratchpad folder `orynx-editor-link-check` as a folder, with its README.md in the explorer, as the user saw. The user also asked for both editors, picked in Settings (Q9's answer), which adds tasks 5, 6 and 26
- [x] Task 2: Add the session contracts: the `message` step, the `resume` problem, `ticket` (type, description, status, due), `followUp` (open, or why not with the newer session's id), `worktreePath`, `workedMs` and `runStartedAt`, each with a default so a 012 session still parses, and the builders (AC-9, AC-11, AC-14, AC-16, AC-20, Q3)
      Check: pnpm test packages/contracts/src/session.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/contracts/src/testing.ts
- [x] Task 3: Add the follow-up contracts: `SendMessageRequestSchema` (trimmed, 1 to 10,000 characters), the `sent` or `cannot_send` answer with its reasons (`too_many`, `discarded`, `never_started`, `newer_session`), and the path (AC-11, AC-14, AC-15)
      Check: pnpm test packages/contracts/src/session.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/testing.ts
- [ ] Task 4: Add the changes contracts: `SessionChangesSchema` (why there are none, files with counts, binary and renamed-from, how many more, totals), `DiffLineSchema` with the `hunk` kind, `FileDiffSchema` (lines, binary, renamed-from, cut short), both paths, the `session.files.changed` event with only the id, and the builders (AC-2, AC-3, AC-5, AC-6, AC-23)
      Check: pnpm test packages/contracts; pnpm typecheck
      Files: packages/contracts/src/changes.ts, packages/contracts/src/changes.test.ts, packages/contracts/src/events.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [ ] Task 5: Add `editor` (`vscode` or `cursor`, `vscode` by default, so saved settings without it still read) to the preferences and an `editor` change, with the builders (AC-20, AC-26, Q9)
      Check: pnpm test packages/contracts/src/preferences.test.ts; pnpm typecheck
      Files: packages/contracts/src/preferences.ts, packages/contracts/src/preferences.test.ts, packages/contracts/src/testing.ts
- [ ] Task 6: Read and save `agent.editor` in the preferences service: keep every other setting, say `settings.changed`, and read a `settings.json` without it as VS Code (AC-26)
      Check: pnpm test packages/core/src/preferences; pnpm test packages/core/src/routes/preferences.test.ts
      Files: packages/core/src/preferences/preferences-service.ts, packages/core/src/preferences/preferences-service.test.ts, packages/core/src/routes/preferences.test.ts
- [ ] Task 7: Record the commit a worktree starts from (`git rev-parse HEAD` in the new worktree) and keep it with the session as `startCommit` (null for older sessions) (AC-4)
      Check: pnpm test packages/core/src/sessions/worktrees.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/worktrees.ts, packages/core/src/sessions/worktrees.test.ts, packages/core/src/sessions/session-store.ts, packages/core/src/sessions/session-service.ts
- [ ] Task 8: Parse git's unified diff into `DiffLine`s, as a table: hunk headers, numbers on both sides, "No newline at end of file", a new and a deleted file, a rename's first line, binary, and the cut after 2,000 lines (AC-3, AC-5, Q5)
      Check: pnpm test packages/core/src/sessions/unified-diff.test.ts
      Files: packages/core/src/sessions/unified-diff.ts, packages/core/src/sessions/unified-diff.test.ts
- [ ] Task 9: List a worktree's changes against its start commit with read-only git (`--no-optional-locks`, hooks off, `gitEnvironment()`, 10 s per call): committed, uncommitted, new (counted with `--no-index`), deleted, renamed, binary, ignored left out, Claude's edit order then by path, 300 then how many more; the worktree's index and `git status` unchanged; `merge-base` for a session without a start commit (AC-4, AC-5, Q4, Q5)
      Check: pnpm test packages/core/src/sessions/changes.test.ts
      Files: packages/core/src/sessions/changes.ts, packages/core/src/sessions/changes.test.ts
- [ ] Task 10: Read one file's diff: only a path in the current list, 3 lines of context, `--no-index` for a new file, a new file that isn't a regular file inside the worktree never read; refuse `../../runtime.json`, an absolute path, a symlink to a file outside and a path not listed (AC-3, AC-5, AC-24)
      Check: pnpm test packages/core/src/sessions/changes.test.ts
      Files: packages/core/src/sessions/changes.ts, packages/core/src/sessions/changes.test.ts
- [ ] Task 11: Let the adapter take a message while Claude works: the prompt becomes a queue, `sendMessage()` pushes a user message with its uuid and `priority: 'next'` and answers false once the input is over, a success `result` is finished only when `queued_turn_count` is 0 and every sent uuid is consumed, and once Stop is pressed `canUseTool` refuses every call and an unconsumed message closes the process at once; the fake SDK plays a folded message and a next turn (AC-12, AC-17)
      Check: pnpm test packages/core/src/agents/claude/claude-adapter.test.ts packages/core/src/agents/claude/sdk-messages.test.ts
      Files: packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/agents/claude/claude-adapter.test.ts, packages/core/src/agents/claude/sdk-messages.ts, packages/core/src/agents/claude/sdk-messages.test.ts, packages/core/src/test/fake-claude-sdk.ts
- [ ] Task 12: Let the adapter resume: `startSession` takes `{ resume }` and passes the SDK's `resume` with every other option unchanged, and a resumed run that ends before `init`, or whose `init` names another session id, is the `resume` problem (AC-11, AC-13, AC-16)
      Check: pnpm test packages/core/src/agents/claude/claude-adapter.test.ts
      Files: packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/agents/claude/claude-adapter.test.ts, packages/core/src/agents/claude/sdk-messages.ts, packages/core/src/test/fake-claude-sdk.ts
- [ ] Task 13: Say when files may have changed: the reader marks the result of an edit or a command, and the adapter emits `files_changed` (AC-2)
      Check: pnpm test packages/core/src/agents/claude/sdk-messages.test.ts packages/core/src/agents/claude/claude-adapter.test.ts
      Files: packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/sdk-messages.ts, packages/core/src/agents/claude/sdk-messages.test.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/agents/claude/claude-adapter.test.ts
- [ ] Task 14: Send a follow-up into a live run in the session service: the `message` step, the state and stepper left as they are, a message that arrives after the input closed falling through to a resume, `session.files.changed` at most once a second, Q2a's sentence in the note, and the log naming only the session (AC-2, AC-12, AC-17, AC-23, Q2)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/progress.test.ts packages/core/src/sessions/brief.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts, packages/core/src/sessions/progress.ts, packages/core/src/sessions/progress.test.ts, packages/core/src/sessions/brief.ts, packages/core/src/sessions/brief.test.ts
- [ ] Task 15: Resume a session with a follow-up: refuse when discarded, never started, the ticket has a newer live session, or three are working; otherwise Working again with the problem cleared, the stepper back to Build from Review, `runStartedAt` set, `workedMs` added up when each run ends, and the `resume` problem shown as a failure (AC-11, AC-13, AC-14, AC-15, AC-16, Q1, Q3)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/progress.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts, packages/core/src/sessions/progress.ts, packages/core/src/sessions/progress.test.ts
- [ ] Task 16: Fill the session detail: keep the ticket (key, type, title, description) at the start and read it back from `brief.md` for older sessions, the status and due date from `describeTicket()`, `followUp` with its reason, `worktreePath`, and a saved 012 `session.json` still read (AC-9, AC-14, AC-20)
      Check: pnpm test packages/core/src/sessions packages/core/src/create-server.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts, packages/core/src/sessions/session-store.ts, packages/core/src/sessions/file-session-store.ts, packages/core/src/sessions/file-session-store.test.ts, packages/core/src/sessions/brief.ts, packages/core/src/create-server.ts
- [ ] Task 17: Add the routes `POST /api/sessions/:id/messages`, `GET /api/sessions/:id/changes` and `GET /api/sessions/:id/changes/diff?path=` (404 for an unknown session or an unlisted path), wire the changes reader into `createServer()`, and extend the leak test at `LOG_LEVEL=trace` to messages and diffs (AC-15, AC-23, AC-24)
      Check: pnpm test packages/core/src/routes/sessions.test.ts packages/core/src/create-server.test.ts packages/core/src/sessions/no-leaks.test.ts
      Files: packages/core/src/routes/sessions.ts, packages/core/src/routes/sessions.test.ts, packages/core/src/create-server.ts, packages/core/src/create-server.test.ts, packages/core/src/sessions/no-leaks.test.ts
- [ ] Task 18: Teach the e2e fake Claude Code: `--resume` plays a follow-up script that edits a second file and finishes, an unknown id exits before `init`, a message that arrives mid-run is folded in and reported consumed, and a "(slow)" ticket keeps working long enough to send one (AC-25)
      Check: pnpm test:e2e e2e/sessions.spec.ts e2e/approvals.spec.ts (still pass)
      Files: e2e/fake-claude/session.ts, learn/sessions-and-worktrees.md
- [ ] Task 19: Add `sendMessage`, `sessionChanges` and `sessionDiff` to the api-client with their query options (keys under the sessions key, `staleTime: 0`), and map `session.files.changed` to that session's changes keys only (AC-2, AC-18)
      Check: pnpm test packages/api-client; pnpm test packages/app/src/live-updates.test.tsx
      Files: packages/api-client/src/endpoints/sessions.ts, packages/api-client/src/sessions.test.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/index.ts, packages/app/src/live-updates.tsx, packages/app/src/live-updates.test.tsx
- [ ] Task 20: Give `FileList` a `maxRows` option that scrolls inside its box past that many rows, with a story and a test (Q6c)
      Check: pnpm test packages/ui/src/components/file-list.test.tsx; pnpm storybook (no axe violations)
      Files: packages/ui/src/components/file-list.tsx, packages/ui/src/components/file-list.stories.tsx, packages/ui/src/components/file-list.test.tsx, docs/design-map.md
- [ ] Task 21: Add the `Markdown` component and its parser for what `adf-markdown.ts` writes (headings, paragraphs, bold, italic, inline code, links, lists, task lists, code blocks, quotes, rules): only `http` and `https` links through `onOpenLink`, raw HTML as text, wide blocks scrolling in their box, the five sizes and two weights; a story per block and a test (AC-9, AC-10, Q8)
      Check: pnpm test packages/ui/src/components/markdown.test.tsx; pnpm gate component-coverage; pnpm storybook (no axe violations)
      Files: packages/ui/src/components/markdown.tsx, packages/ui/src/components/markdown-blocks.ts, packages/ui/src/components/markdown.stories.tsx, packages/ui/src/components/markdown.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 22: Add the words: move `dueText` to `words/`, the `message` step and the `resume` problem, the summary line, the Changes tab's empty states and lines, the follow-up box's off lines and errors, and the Ticket tab's note and lines (Q10)
      Check: pnpm test packages/app/src/words packages/app/src/features/sessions packages/app/src/features/tickets
      Files: packages/app/src/words/due.ts, packages/app/src/words/due.test.ts, packages/app/src/features/tickets/ticket-words.ts, packages/app/src/features/sessions/step-words.ts, packages/app/src/features/sessions/step-words.test.ts, packages/app/src/features/sessions/change-words.ts, packages/app/src/features/sessions/change-words.test.ts, packages/app/src/features/sessions/follow-up-words.ts, packages/app/src/features/sessions/follow-up-words.test.ts
- [ ] Task 23: Build `ChangesPanel`: the summary line, `FileList` with 8 rows, `DiffView`, the file from `?file` or the first one, kept while the list changes and the diff's scroll kept on refetch, the empty states, the error with Try again, the skeletons, Open in VS Code or Open in Cursor as Settings' editor picks (a link from the preferences query), and Discard changes moved here (AC-2, AC-3, AC-5, AC-6, AC-7, AC-8, AC-20)
      Check: pnpm test packages/app/src/features/sessions/components/changes-panel.test.tsx
      Files: packages/app/src/features/sessions/components/changes-panel.tsx, packages/app/src/features/sessions/components/changes-panel.test.tsx, packages/app/src/features/sessions/queries.ts
- [ ] Task 24: Build `TicketPanel`: the Jira mark and key, the type and title, the description in `Markdown` with links opened through the platform, the status and due pills when the cache has them, Open in Jira, the "Claude's brief" note, and no description (AC-9, AC-10)
      Check: pnpm test packages/app/src/features/sessions/components/ticket-panel.test.tsx
      Files: packages/app/src/features/sessions/components/ticket-panel.tsx, packages/app/src/features/sessions/components/ticket-panel.test.tsx
- [ ] Task 25: Build `FollowUpBox`: react-hook-form with the contract's schema inside `Composer` (`look="follow-up"`), Enter sends, Shift+Enter adds a line, Enter while composing doesn't send, empty sends nothing, the draft per session in `store.ts` (not persisted), the box clearing and keeping focus, Send busy, the refusal and error lines with the text kept, and the off line with its link to the newer session (AC-11, AC-14, AC-15, AC-18, AC-19, AC-21)
      Check: pnpm test packages/app/src/features/sessions/components/follow-up-box.test.tsx
      Files: packages/app/src/features/sessions/components/follow-up-box.tsx, packages/app/src/features/sessions/components/follow-up-box.test.tsx, packages/app/src/features/sessions/store.ts, packages/app/src/features/sessions/queries.ts, packages/app/src/features/sessions/schemas.ts
- [ ] Task 26: Add "Editor" to Settings › Coding agent: a `ChoiceGroup` with the `ChoiceCard`s "VS Code" and "Cursor" like Appearance's, saved as you change it and shown at once, the save error with the choice taken back, and arrow keys between the choices (AC-26, Q9, Q10)
      Check: pnpm test packages/app/src/features/settings
      Files: packages/app/src/features/settings/components/editor-choice.tsx, packages/app/src/features/settings/components/editor-choice.test.tsx, packages/app/src/features/settings/components/coding-agent-panel.tsx, packages/app/src/features/settings/components/coding-agent-panel.test.tsx, packages/app/src/features/settings/queries.ts
- [ ] Task 27: Lay out the Session screen: `?tab=changes|ticket&file=` on the route, the two panes at `full` width with their own heights, the box after the last step and sticky at the window's bottom, progress first on narrow windows, the `message` step and the working time in the progress pane, and the `Design:` note updated (AC-1, AC-8, AC-11, AC-22, Q3, Q6)
      Check: pnpm test packages/app/src/features/sessions; pnpm gate design-source; pnpm gate style-policy
      Files: packages/app/src/router.tsx, packages/app/src/features/sessions/session-screen.tsx, packages/app/src/features/sessions/session-screen.test.tsx, packages/app/src/features/sessions/components/session-progress.tsx, packages/app/src/features/sessions/components/session-progress.test.tsx
- [ ] Task 28: e2e changes: the list grows while Claude works in a second tab too, picking a file shows its diff and a reload keeps it, the Ticket tab, Discard's empty state, and the button following Settings' editor (AC-1, AC-2, AC-3, AC-6, AC-9, AC-18, AC-20, AC-26)
      Check: pnpm test:e2e e2e/changes.spec.ts
      Files: e2e/changes.spec.ts, e2e/fake-tools/config.ts
- [ ] Task 29: e2e follow-ups: after Done (Working, Build, a new Finished), while Claude works (folded in), after Stop, the box off after Discard, the keyboard path, and axe at 360 and 1280 px in light and dark (AC-11, AC-12, AC-13, AC-14, AC-21, AC-22)
      Check: pnpm test:e2e e2e/changes.spec.ts
      Files: e2e/changes.spec.ts
- [ ] Task 30: Docs: `learn/sessions-and-worktrees.md` (changes, follow-ups, resume, the queued-message rule), `learn/live-updates.md` (the new event), `learn/settings-and-folders.md` (the editor), agent-runtime's adapter section (`sendMessage`, resume, Stop refusing every call), the roadmap's 013 line, `docs/architecture.md` (the routes and the event)
      Check: pnpm gate learn-freshness; pnpm gate handbook-size; pnpm gate specs
      Files: learn/sessions-and-worktrees.md, learn/live-updates.md, learn/settings-and-folders.md, .claude/skills/agent-runtime/SKILL.md, docs/product/roadmap.md, docs/architecture.md
- [ ] Task 31: Open the Session screen in a real browser (`pnpm dev`, own `DEVHUB_HOME`) at 360 and 1280 px, light and dark, in each state through `page.route`: loading, the list and a diff, a long and a binary diff, each empty state, the error, the Ticket tab with and without a description, the box sending, refused and off, and Settings' Editor with each choice and its save error. Measure CLS, and tick each check here (AC-8, AC-22)
      Check: the screenshots and CLS values recorded in this task
      Files: specs/013-live-changes-and-follow-ups/tasks.md
- [ ] Task 32: Ask the user to run one real session on a throwaway repository (Q11): watch the Changes tab grow and compare it with `git diff` in the worktree, send a follow-up while Claude works and one after Done, Stop and send another, restart Orynx and send one more, press Open in VS Code, then pick Cursor in Settings and press Open in Cursor. Write down what happened
      Check: the user's notes recorded here; AC-2, AC-4, AC-11 to AC-13, AC-17, AC-20 and AC-26 as seen
      Files: specs/013-live-changes-and-follow-ups/tasks.md, learn/sessions-and-worktrees.md
- [ ] Task 33: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
