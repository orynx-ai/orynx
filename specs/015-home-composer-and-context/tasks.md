# Tasks: Home composer and context

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Add the composer's start to the contracts: `ComposerStartSchema` (the message at most 10,000 characters, `repositoryId?`, at most 1 `jira`, 3 `pull_request` and 5 `file` chips, each file at most 100 KB in UTF-8, and an empty message only with a ticket), `StartSessionRequestSchema` as the union of Ship's body and it, and the `context_failed` answer with the chip's place and its problem (AC-4, AC-11, AC-12, AC-20, AC-21)
      Check: pnpm test packages/contracts/src/session.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/contracts/src/testing.ts
- [x] Task 2: Widen the `brief` step to `{ key | null, message, pullRequests, files }` with defaults, so a `session.json` saved with `{ kind: 'brief', key }` still reads (AC-24)
      Check: pnpm test packages/contracts/src/session.test.ts packages/core/src/sessions/file-session-store.test.ts
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/core/src/sessions/file-session-store.test.ts
- [x] Task 3: Name a session with no ticket, as tables: the title from the message's first line (80 characters, cut on a word, "…"), and the branch slug (five words, ASCII letters, digits and hyphens, at most 40 characters, `task` when nothing is left, accents dropped) (AC-4, Q8a, Q8b)
      Check: pnpm test packages/core/src/sessions/composer-names.test.ts
      Files: packages/core/src/sessions/composer-names.ts, packages/core/src/sessions/composer-names.test.ts
- [x] Task 4: Write the composer's brief: `composerBrief()` with the message, then the ticket (summary, type, description, the last 20 comments, linked issues), each pull request (title, branches, description, failing checks, unresolved comments, the diff to 2,000 lines then counts, or "too large" with counts) and each file under its name. `sessionNote()` without a ticket says "Do what the user asks in the brief." (AC-20, Q3, Q4, Q8c)
      Check: pnpm test packages/core/src/sessions/brief.test.ts
      Files: packages/core/src/sessions/brief.ts, packages/core/src/sessions/brief.test.ts, packages/core/src/agents/agent-adapter.ts
- [x] Task 5: Let the Jira client read a ticket's context: `issueContext()` with `comment` and `issuelinks`, the last 20 comments through `adfToMarkdown`, and each link's own relation words, key, summary and status. Not found, refused and timeout are told apart, and a refused token never shows in the answer. The MSW fake in `fake-jira.ts` learns comments and links. The server's leak test covers it in task 11 (AC-20, AC-21, Q3)
      Check: pnpm test packages/core/src/integrations/jira
      Files: packages/core/src/integrations/jira/client.ts, packages/core/src/integrations/jira/client.test.ts, packages/core/src/test/fake-jira.ts
- [x] Task 6: Let the GitHub client read a pull request's context: `pullContext()`, one GraphQL query for the title, body, base and head refs, failed check contexts (name, conclusion) and unresolved review threads (author, path, line, body). It also reads the first 100 changed files with their counts. Missing or hidden (single sign-on included) is `not_found`, and refused, rate limit and timeout are told apart, never with the token. An MSW handler in `fake-github.ts` answers only this query (AC-20, AC-21, Q4)
      Check: pnpm test packages/core/src/integrations/github
      Files: packages/core/src/integrations/github/client.ts, packages/core/src/integrations/github/client.test.ts, packages/core/src/test/fake-github.ts
- [x] Task 7: Let the GitHub client read a pull request's diff: `pullDiff()` through REST with the diff media type, and a 406 answered as `too_large` with GraphQL's file counts (AC-20, Q4)
      Check: pnpm test packages/core/src/integrations/github/client.test.ts
      Files: packages/core/src/integrations/github/client.ts, packages/core/src/integrations/github/client.test.ts, packages/core/src/test/fake-github.ts
- [x] Task 8: Read every chip at once: `context-reader.ts` takes the Jira and GitHub credentials, reads each chip, and gives the brief's chips in the order they came, or the first chip that failed with `not_connected`, `not_found`, `unreachable` or `other`. Files pass through unread (AC-20, AC-21)
      Check: pnpm test packages/core/src/sessions/context-reader.test.ts
      Files: packages/core/src/sessions/context-reader.ts, packages/core/src/sessions/context-reader.test.ts
- [x] Task 9: Answer a composer start that can't happen, making nothing: a live session on the ticket (`existing`), signed out, three working, Q7's folder (`choose_folder`, `no_folder`), then a chip that failed (`context_failed`). No record, branch, worktree or event comes of any of them (AC-21, AC-22, AC-23)
      Check: pnpm test packages/core/src/sessions/compose.test.ts
      Files: packages/core/src/sessions/compose.ts, packages/core/src/sessions/compose.test.ts, packages/core/src/sessions/session-service.ts
- [x] Task 10: Start from the composer: the record with the ticket's summary or the message's title, the source or null, the Jira link and sprint for a ticket, and `ticket` from what was read. `run()` takes the start plan: the branch `feat/<KEY>` or `feat/<slug>`, `brief.md` exactly as the brief, the `brief` step with its chips, and the note. Ship still starts as before, and both queue behind one key (AC-4, AC-20, Q8)
      Check: pnpm test packages/core/src/sessions/compose.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/compose.ts, packages/core/src/sessions/compose.test.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts
- [x] Task 11: Serve it: `POST /api/sessions` parses the union, with a 4 MiB `bodyLimit` on that route (five full files of control characters, which JSON writes six times over, go through), and Fastify's own 4xx refusals answered with their status. Wire the context reader into `createServer()`, and extend the leak test at `LOG_LEVEL=trace`: no message, file text, description, comment, diff line or token in a log line or an event (AC-4, AC-21, AC-35)
      Check: pnpm test packages/core/src/routes/sessions.test.ts packages/core/src/sessions/no-leaks.test.ts
      Files: packages/core/src/routes/sessions.ts, packages/core/src/routes/sessions.test.ts, packages/core/src/sessions/no-leaks.test.ts, packages/core/src/create-server.ts
- [x] Task 12: Let the api-client send the composer's start: `postSession()` takes the union and parses `context_failed` (AC-4, AC-21)
      Check: pnpm test packages/api-client/src/sessions.test.ts
      Files: packages/api-client/src/endpoints/sessions.ts, packages/api-client/src/sessions.test.ts
- [x] Task 13: Give a session with no ticket Orynx's mark: SourceMark's `orynx` source with `BrandMark` in the logo's square, in the text colour, which AttentionRow takes. The sidebar's SessionItem draws no marks, so it needs none. A story and tests (AC-24, Q15b)
      Check: pnpm test packages/ui/src/components/source-mark.test.tsx packages/ui/src/components/attention-row.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/source-mark.tsx, packages/ui/src/components/source-mark.stories.tsx, packages/ui/src/components/source-mark.test.tsx, packages/ui/src/components/attention-row.test.tsx
- [x] Task 14: Add `ContextPicker` to `@devhub/ui`, the kinds view: the + button ("Add context") and a Radix Popover whose first view is a `role="menu"` list with arrow keys, rows that lead on, the label and the foot. Esc closes it and returns focus to +. At most the window's width less 32 px. Stories and a test (AC-6, AC-30, Q15c)
      Check: pnpm test packages/ui/src/components/context-picker.test.tsx; pnpm gate component-coverage; pnpm gate style-policy
      Files: packages/ui/src/components/context-picker.tsx, packages/ui/src/components/context-picker.stories.tsx, packages/ui/src/components/context-picker.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 15: Add the list view to `ContextPicker`: a `role="dialog"` with Back ("Back to all context types"), the title and count, the search box as the ARIA combobox over a listbox, options with a check and `aria-selected`, an extra row, the empty line, three Skeleton rows while loading, and the note. ↓ and ↑ move, Enter picks, and Back returns focus to the kind it came from. A story for each state (AC-7, AC-9, AC-10, AC-32)
      Check: pnpm test packages/ui/src/components/context-picker.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/context-picker.tsx, packages/ui/src/components/context-picker.stories.tsx, packages/ui/src/components/context-picker.test.tsx
- [x] Task 16: Add the composer's words (Q13): the placeholders, the + menu's descriptions, foot, search boxes and notes, the limits, the "Add PROJ-9999" row, the empty and not-connected lines, each `cannot_start` and `context_failed` line, the pickers' words, the busy Send, and the banner's lines with "· 2 more waiting" and an edit's path (AC-3, AC-8, AC-10 to AC-12, AC-18, AC-21 to AC-23, AC-25, AC-26)
      Check: pnpm test packages/app/src/features/home/composer-words.test.ts
      Files: packages/app/src/features/home/composer-words.ts, packages/app/src/features/home/composer-words.test.ts
- [x] Task 17: Add the composer's rules, as tables: a paste that is exactly one key or one github.com PR link (Q6), a file that is text (UTF-8, no NUL byte, at most 100 KB) and the count limits (Q5), and Q7's folder: picked, the ticket's only folder, the last used, the only one, or none (AC-12, AC-14, AC-17)
      Check: pnpm test packages/app/src/features/home/composer-rules.test.ts
      Files: packages/app/src/features/home/composer-rules.ts, packages/app/src/features/home/composer-rules.test.ts
- [x] Task 18: Keep the draft: `store.ts` holds the text, the chips in order (one ticket, which a second replaces), the folder and whether you picked it. `persist` keeps only the last used folder as `devhub.home` (AC-9, AC-33, Q14)
      Check: pnpm test packages/app/src/features/home/store.test.ts
      Files: packages/app/src/features/home/store.ts, packages/app/src/features/home/store.test.ts
- [ ] Task 19: Build `HomeComposer`: react-hook-form with the contract's message rule, the text mirrored into the store, the chips (ContextList), the placeholder for a ticket, Send on only with text or a ticket, Enter and Shift+Enter, busy Send with the box read-only, `started` opening the session and clearing the draft, and a line (`role="alert"`) for every other answer with the draft kept and "Open session" for `existing` (AC-3 to AC-5, AC-8, AC-21 to AC-23)
      Check: pnpm test packages/app/src/features/home/components/home-composer.test.tsx
      Files: packages/app/src/features/home/components/home-composer.tsx, packages/app/src/features/home/components/home-composer.test.tsx, packages/app/src/features/home/queries.ts, packages/app/src/features/home/schemas.ts
- [ ] Task 20: Build the folder picker: "Repository" with the folders under "On this computer" (name and path), the picked one checked, Add local folder (020's dialog, then the new folder picked) and Manage folders. It follows the ticket until you pick, and reads "Add a folder" or "Choose folder" when it must (AC-16 to AC-18)
      Check: pnpm test packages/app/src/features/home/components/folder-picker.test.tsx
      Files: packages/app/src/features/home/components/folder-picker.tsx, packages/app/src/features/home/components/folder-picker.test.tsx
- [ ] Task 21: Build the agent picker: Claude checked, with "Connected · runs locally" or "Signed out" and the link to Settings › Coding agent, and a dot that isn't the only sign (AC-19, Q10)
      Check: pnpm test packages/app/src/features/home/components/agent-picker.test.tsx
      Files: packages/app/src/features/home/components/agent-picker.tsx, packages/app/src/features/home/components/agent-picker.test.tsx
- [ ] Task 22: Build + Add context: the kinds (no Slack, Q12), the Jira and Pull request lists from the search index with their checks, the typed-key row, the loading, empty and not-connected states, Git repository setting the folder, and File through the computer's dialog with its limits. A pick returns focus to the text box (AC-6 to AC-13, AC-32)
      Check: pnpm test packages/app/src/features/home/components/add-context.test.tsx
      Files: packages/app/src/features/home/components/add-context.tsx, packages/app/src/features/home/components/add-context.test.tsx
- [ ] Task 23: Turn a pasted key or PR link into its chip, and remove a chip with the keyboard so that focus moves on and the removal is announced (AC-14, AC-15)
      Check: pnpm test packages/app/src/features/home/components/home-composer.test.tsx
      Files: packages/app/src/features/home/components/home-composer.tsx, packages/app/src/features/home/components/home-composer.test.tsx
- [ ] Task 24: Build the waiting banner: the session waiting longest, its key and title, what it wants to run or edit, "· 2 more waiting", Review opening it, shown only once the list has loaded, and gone within 2 seconds of the last answer (AC-25 to AC-27, Q11)
      Check: pnpm test packages/app/src/features/home/components/waiting-banner.test.tsx
      Files: packages/app/src/features/home/components/waiting-banner.tsx, packages/app/src/features/home/components/waiting-banner.test.tsx
- [ ] Task 25: Lay out Home: the banner, greeting, composer, quick starts (Pick up a ticket, Review a pull request with focus on its tab) and the attention list, with the `Design:` note updated. ⌘N focuses the composer (AC-1, AC-2, AC-28, AC-29, AC-33)
      Check: pnpm test packages/app/src/features/home packages/app/src/shell; pnpm gate design-source
      Files: packages/app/src/features/home/home-screen.tsx, packages/app/src/features/home/home-screen.test.tsx, packages/app/src/features/home/components/quick-starts.tsx, packages/app/src/features/home/components/quick-starts.test.tsx, packages/app/src/shell/use-shortcuts.ts
- [ ] Task 26: Show a session with no ticket: breadcrumb Sessions / its title, no Ticket tab, the brief step naming your message, pull requests and files, and Orynx's mark in the sidebar and the inbox row (AC-24)
      Check: pnpm test packages/app/src/features/sessions packages/app/src/features/home/components/attention-panel.test.tsx
      Files: packages/app/src/features/sessions/step-words.ts, packages/app/src/features/sessions/step-words.test.ts, packages/app/src/features/sessions/components/session-details.tsx, packages/app/src/features/sessions/session-screen.test.tsx, packages/app/src/features/home/components/attention-panel.tsx, packages/app/src/shell/sidebar.tsx
- [ ] Task 27: e2e: a seventh hub (4388, control 4387) whose fakes learn the ticket context and the pull request's context and diff. Send a message alone, then with a ticket, a pull request and a file, and read `brief.md`. Then a ticket Jira can't find, a paste, ⌘N, the keyboard path, the banner, and axe at 360 and 1280 px in light and dark (AC-1, AC-2, AC-4, AC-6, AC-8, AC-14, AC-20, AC-21, AC-25, AC-30, AC-31, AC-35)
      Check: pnpm test:e2e e2e/composer.spec.ts
      Files: e2e/composer.spec.ts, e2e/fake-tools/config.ts, e2e/fake-tools/preload.ts, playwright.config.ts
- [ ] Task 28: Docs: a `learn/` page on the composer and what Claude gets; `docs/architecture.md` gets the composer start, the new Jira and GitHub reads and the body limit; agent-runtime's brief section; `docs/design-map.md` rows; and the roadmap's 015 line
      Check: pnpm gate learn-freshness; pnpm gate handbook-size; pnpm gate specs
      Files: learn/composer-and-context.md, docs/architecture.md, .claude/skills/agent-runtime/SKILL.md, docs/design-map.md, docs/product/roadmap.md
- [ ] Task 29: Open Home in a real browser (`pnpm dev` on 4337/4338 with its own `DEVHUB_HOME`) at 360 and 1280 px, light and dark, in each state through `page.route`: empty, typed, with each chip, each list (loading, empty, not connected), both pickers, each failure line, the banner (one and several), and a session with no ticket. Measure CLS and tick each check here (AC-1, AC-30, AC-31)
      Check: each state checked and written down in this task; no layout shift while Home loads
      Files: specs/015-home-composer-and-context/tasks.md
- [ ] Task 30: Once 014 has merged, move the branch onto `main` and give a session with no ticket its pull request: no key in the title, no Jira line, and the fallback from the session's title and Claude's last summary (AC-34)
      Check: pnpm test packages/core/src/sessions/pull-request-text.test.ts packages/core/src/sessions/pull-requests.test.ts; pnpm verify
      Files: packages/core/src/sessions/pull-request-text.ts, packages/core/src/sessions/pull-request-text.test.ts, packages/core/src/sessions/pull-requests.ts, packages/core/src/sessions/pull-requests.test.ts
- [ ] Task 31: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
