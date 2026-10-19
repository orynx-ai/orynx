# Tasks: Composer quick add and skills

One task is one commit. Test first, then code. Tick a task only when its Check passes.

**A. Several chips**

- [x] Task 1: Let a session take several tickets. `composerLimits` becomes 10 tickets, 10 pull requests, 20 files and 5 skills; `ComposerStartSchema` refuses the same ticket twice and more than the limits. The server's first ticket is the session's (branch, title, source, live-session check, folder), the others go in the brief in their place, and the `brief` step gains `tickets` (the others' keys) with a default (AC-4, AC-5, AC-6, Q2, Q5)
      Check: pnpm test packages/contracts/src/session.test.ts packages/core/src/sessions/compose.test.ts packages/core/src/sessions/brief.test.ts
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/core/src/sessions/compose.ts, packages/core/src/sessions/compose.test.ts, packages/core/src/sessions/brief.test.ts
- [x] Task 2: The composer takes several tickets: adding one never replaces another, the same chip twice changes nothing, the new limits say why with Q12's lines, the placeholder for several tickets, the folder follows the first ticket, and the brief step on the Session screen names the other tickets (AC-1, AC-2, AC-3, AC-7)
      Check: pnpm test packages/app/src/features/home packages/app/src/features/sessions/components/session-progress.test.tsx
      Files: packages/app/src/features/home/composer-rules.ts, packages/app/src/features/home/composer-rules.test.ts, packages/app/src/features/home/composer-words.ts, packages/app/src/features/home/components/add-context.tsx, packages/app/src/features/home/components/add-context.test.tsx, packages/app/src/features/home/components/home-composer.tsx, packages/app/src/features/home/components/home-composer.test.tsx, packages/app/src/features/sessions/step-words.ts

**C. Two chips, then +N, and the context dialog**

- [x] Task 3: Add `ContextMore` to `@devhub/ui`: a chip-shaped button "+3" with its tooltip and name, the height of a chip, with stories for 1, 2 and 5 chips and a test with axe (AC-19, Q6, Q14)
      Check: pnpm test packages/ui/src/components/context-chip.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/context-chip.tsx, packages/ui/src/components/context-chip.stories.tsx, packages/ui/src/components/context-chip.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 4: Show two chips, then +N, in the composer: the first two in the order added; removing one brings the next into view; the box doesn't move (AC-18, AC-19, AC-25)
      Check: pnpm test packages/app/src/features/home/components/home-composer.test.tsx
      Files: packages/app/src/features/home/components/home-composer.tsx, packages/app/src/features/home/components/home-composer.test.tsx, packages/app/src/features/home/composer-words.ts
- [x] Task 5: The context dialog: "Context for Claude" with the tabs Tickets, Pull requests and Files and their counts, opening on the first that holds something; each row's mark, label, sub line (from the search index for tickets and pull requests) and Remove; the empty tab's line; focus after a removal; closes when empty; Done; Esc returns focus to +N or the box (AC-20 to AC-24)
      Check: pnpm test packages/app/src/features/home/components/context-dialog.test.tsx
      Files: packages/app/src/features/home/components/context-dialog.tsx, packages/app/src/features/home/components/context-dialog.test.tsx, packages/app/src/features/home/components/home-composer.tsx, packages/app/src/features/home/composer-words.ts

**F. The ticket dialog**

- [x] Task 6: Let the Jira client read a ticket in full: `issueContext()` also reads status (name and category), priority, assignee, reporter, due date, labels, created and updated; the MSW fake learns them (AC-40, Q8)
      Check: pnpm test packages/core/src/integrations/jira
      Files: packages/core/src/integrations/jira/client.ts, packages/core/src/integrations/jira/client.test.ts, packages/core/src/test/fake-jira.ts
- [x] Task 7: Serve one ticket: `TicketDetailSchema` and `GET /api/tickets/:key` in the contracts, a ticket service that answers it through the Jira client with the board's column and priority level, 404 when Jira can't find it, 502 when Jira doesn't answer, 409 when Jira isn't connected; route tests with `app.inject()`, the 401 case, and the leak test (AC-40, AC-44)
      Check: pnpm test packages/contracts/src/tickets.test.ts packages/core/src/routes/tickets.test.ts packages/core/src/tickets
      Files: packages/contracts/src/tickets.ts, packages/contracts/src/tickets.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/testing.ts, packages/core/src/tickets/*, packages/core/src/routes/tickets.ts, packages/core/src/routes/tickets.test.ts
- [x] Task 8: Let the api-client read one ticket: `getTicket()` parses with the contract, `ticketQueryOptions(key)` under `queryKeys.ticket(key)`; MSW tests for a ticket, a 404 and a bad shape (AC-40, AC-44)
      Check: pnpm test packages/api-client
      Files: packages/api-client/src/endpoints/tickets.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/tickets.test.ts
- [x] Task 9: The ticket dialog, drawn once in the shell and opened through a small store with what the page already knows (key, type, title): the fields, description, linked issues and comments, skeleton lines while Jira answers, the error line with Try again, the empty words, and at its end Open in Jira, Add to composer (or In the composer) and Open session; focus returns to what opened it. Open it from Tickets' cards and list and from ⌘K's ticket results (AC-40, AC-41, AC-42, AC-43, AC-44, AC-45, AC-46, AC-47, AC-48)
      Check: pnpm test packages/app/src/features/tickets packages/app/src/features/search
      Files: packages/app/src/features/tickets/components/ticket-dialog.tsx, packages/app/src/features/tickets/components/ticket-dialog.test.tsx, packages/app/src/features/tickets/ticket-dialog-store.ts, packages/app/src/features/tickets/queries.ts, packages/app/src/features/tickets/ticket-words.ts, packages/app/src/features/tickets/components/ticket-card.tsx, packages/app/src/features/tickets/components/tickets-list.tsx, packages/app/src/features/search/components/search-dialog.tsx, packages/app/src/shell/*

**D. One action on Home's rows**

- [x] Task 10: `@devhub/ui`: `AttentionActions` one action wide and its skeleton to match, and `AttentionTitle` as a button (asChild) with the title's look and no arrow; stories and tests (AC-26, AC-34)
      Check: pnpm test packages/ui/src/components/attention-row.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/attention-row.tsx, packages/ui/src/components/attention-row.stories.tsx, packages/ui/src/components/attention-row.test.tsx
- [x] Task 11: Home's rows: one + toggle (Add to composer, then the check with Remove from composer) on Jira and pull request rows, said to a screen reader; no Ship and no Open arrow; a Jira title opens the ticket dialog, a pull request title opens GitHub with no arrow; a waiting session's row unchanged (AC-26 to AC-33)
      Check: pnpm test packages/app/src/features/home
      Files: packages/app/src/features/home/components/attention-panel.tsx, packages/app/src/features/home/components/attention-panel.test.tsx, packages/app/src/features/home/inbox-words.ts, packages/app/src/features/home/composer-words.ts

**E. Ship adds to the composer**

- [x] Task 12: Ship on Tickets' cards and list adds the ticket's chip and opens Home with focus in the box, and the ticket dialog's Add to composer does the same from Tickets and ⌘K; Ship's folder menu, Add local folder and start go, with their tests (AC-35 to AC-39, AC-42)
      Check: pnpm test packages/app/src/features/tickets packages/app/src/features/sessions packages/app/src/features/home
      Files: packages/app/src/features/tickets/components/ship-button.tsx, packages/app/src/features/tickets/components/ship-button.test.tsx, packages/app/src/features/sessions/components/ship-with-claude.tsx (removed), packages/app/src/features/sessions/components/ship-with-claude.test.tsx (removed), packages/app/src/features/tickets/components/ticket-card.tsx, packages/app/src/features/tickets/components/tickets-list.tsx
- [x] Task 13: e2e: start sessions through the composer where they pressed Ship (sessions, approvals, changes), and add composer e2e for several tickets, a row's + and the +N dialog (AC-1, AC-4, AC-20, AC-28, AC-35)
      Check: pnpm test:e2e e2e/sessions.spec.ts e2e/approvals.spec.ts e2e/changes.spec.ts e2e/composer.spec.ts e2e/home-inbox.spec.ts e2e/tickets.spec.ts
      Files: e2e/sessions.spec.ts, e2e/approvals.spec.ts, e2e/changes.spec.ts, e2e/composer.spec.ts, e2e/home-inbox.spec.ts, e2e/tickets.spec.ts

**B. Files by path**

- [x] Task 14: The computer's file picker: 020's picker learns to pick several files (`osascript` `choose file with multiple selections allowed`, `zenity --file-selection --multiple`, `kdialog --getopenfilename --multiple --separate-output`), and `POST /api/file-picker` answers the paths with `~`, or null on Cancel, or 503; `POST /api/files/check` answers a typed path when it's a file, else 422. Fake programs in tests (AC-9, AC-11, AC-12)
      Check: pnpm test packages/core/src/folder-picker packages/core/src/routes/folder-picker.test.ts packages/core/src/routes/files.test.ts
      Files: packages/contracts/src/repositories.ts, packages/contracts/src/routes.ts, packages/core/src/folder-picker/folder-picker.ts, packages/core/src/folder-picker/folder-picker.test.ts, packages/core/src/routes/folder-picker.ts, packages/core/src/routes/files.ts, packages/core/src/routes/files.test.ts, packages/core/src/create-server.ts, e2e/fake-gh/*
- [x] Task 15: A file chip by path: `{ kind: 'file', path }` (absolute or `~/`, no control characters, at most 4,096 characters), the secret-name rule moved to contracts and refused there, the same path twice refused; the brief step's `files` hold paths (AC-10, AC-13, AC-14, AC-17)
      Check: pnpm test packages/contracts packages/core/src/sessions/secret-files.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts, packages/contracts/src/secret-names.ts, packages/core/src/sessions/secret-files.ts
- [x] Task 16: Claude reads exactly the picked files: the context reader checks each path is a readable file at Send (`not_found` otherwise), the brief gives "File ~/notes/plan.pdf" with its full path, the stored session keeps the readable paths, and the tool decision allows read tools on exactly those real paths (symlinks followed), never edits, across a follow-up's resume (AC-4, AC-15, AC-16)
      Check: pnpm test packages/core/src/agents/claude/tool-decision.test.ts packages/core/src/sessions packages/core/src/agents/claude/claude-adapter.test.ts
      Files: packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/tool-decision.ts, packages/core/src/agents/claude/tool-decision.test.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/sessions/context-reader.ts, packages/core/src/sessions/context-reader.test.ts, packages/core/src/sessions/brief.ts, packages/core/src/sessions/brief.test.ts, packages/core/src/sessions/compose.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-store.ts, packages/core/src/sessions/session-service.test.ts
- [x] Task 17: Let the api-client pick and check files: `pickFiles()` and `checkFile()` parse with the contract; MSW tests (AC-9, AC-12)
      Check: pnpm test packages/api-client
      Files: packages/api-client/src/endpoints/files.ts, packages/api-client/src/client.ts, packages/api-client/src/files.test.ts
- [x] Task 18: The composer's File from this computer opens the server's picker, adds a chip per file with its name cut in the middle and the path in its tooltip, refuses a secret-looking name with its line, falls back to "Add a file" with a Path field (react-hook-form) when no picker opens, and the brief step's file tooltip shows the path; the e2e fake picker answers a file (AC-8 to AC-14, AC-16, AC-17)
      Check: pnpm test packages/app/src/features/home packages/app/src/features/sessions; pnpm test:e2e e2e/composer.spec.ts
      Files: packages/app/src/features/home/components/add-context.tsx, packages/app/src/features/home/components/add-context.test.tsx, packages/app/src/features/home/components/add-file-dialog.tsx, packages/app/src/features/home/components/add-file-dialog.test.tsx, packages/app/src/features/home/composer-rules.ts, packages/app/src/features/home/composer-words.ts, packages/app/src/features/home/queries.ts, packages/app/src/features/home/schemas.ts, packages/app/src/features/sessions/components/session-progress.tsx, e2e/composer.spec.ts, e2e/fake-gh/osascript

**G. Skills**

- [x] Task 19: Read the skills: add `yaml` to `@devhub/core` and `docs/architecture.md`; a skills reader for a folder's `.claude/skills/*/SKILL.md` and `.claude/commands/**/*.md` and the same under `~/.claude`, with `name` and `description` from the frontmatter (first 64 KB), the folder's name when there's no `name`, unreadable files skipped, and the folder's winning over yours (AC-57, AC-58)
      Check: pnpm test packages/core/src/skills
      Files: packages/core/package.json, pnpm-lock.yaml (through pnpm add), docs/architecture.md, packages/core/src/skills/skills-reader.ts, packages/core/src/skills/skills-reader.test.ts
- [x] Task 20: Serve the skills: `SkillListSchema` and `GET /api/skills?repositoryId=` in the contracts, the route over the reader with the folder from Settings › Repositories (yours only without one), 404 for an unknown folder; route tests with temporary folders as the repository and `~` (AC-49, AC-55, AC-59)
      Check: pnpm test packages/contracts packages/core/src/routes/skills.test.ts
      Files: packages/contracts/src/skills.ts, packages/contracts/src/skills.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts, packages/core/src/routes/skills.ts, packages/core/src/routes/skills.test.ts, packages/core/src/create-server.ts
- [x] Task 21: Skills in the brief: at Send, each `/name` in the message that is a listed skill for the session's folder (at most 5) adds "Skill /name" with its file's text after the chips, the brief step lists them, and Claude may read inside each skill's folder (read tools only); no settings, hooks or MCP from the skill (AC-53, AC-54)
      Check: pnpm test packages/core/src/sessions packages/core/src/agents/claude/tool-decision.test.ts
      Files: packages/contracts/src/session.ts, packages/core/src/sessions/brief.ts, packages/core/src/sessions/brief.test.ts, packages/core/src/sessions/compose.ts, packages/core/src/sessions/compose.test.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/no-leaks.test.ts
- [x] Task 22: Let the api-client read the skills: `getSkills(repositoryId?)` and `skillsQueryOptions` under `queryKeys.skills(repositoryId)`; MSW tests (AC-49, AC-56)
      Check: pnpm test packages/api-client
      Files: packages/api-client/src/endpoints/skills.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/skills.test.ts
- [x] Task 23: Add `SuggestionList` to `@devhub/ui`: a listbox under the composer's box with an active row, each row's name, description and source, three skeleton rows while loading, one line when empty or failed; the box's `aria-autocomplete`, `aria-controls` and `aria-activedescendant`; stories for each state and a test with axe (AC-49, AC-55, AC-56, AC-60, Q14)
      Check: pnpm test packages/ui/src/components/suggestion-list.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/suggestion-list.tsx, packages/ui/src/components/suggestion-list.stories.tsx, packages/ui/src/components/suggestion-list.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 24: The composer's `/` list: `/` at the start or after a space or a new line opens it with the shown folder's skills and yours, typing filters, arrows move, Enter or Tab or a click puts `/name ` in the box, Esc or a space closes it, Enter never sends while it's open or while composing, and more than 5 named skills say Q12's line (AC-49 to AC-52, AC-55, AC-56, AC-59, AC-60)
      Check: pnpm test packages/app/src/features/home
      Files: packages/app/src/features/home/components/skill-suggestions.tsx, packages/app/src/features/home/components/skill-suggestions.test.tsx, packages/app/src/features/home/components/home-composer.tsx, packages/app/src/features/home/skill-words.ts, packages/app/src/features/home/queries.ts, packages/app/src/features/home/composer-words.ts

**Docs, browser and review**

- [ ] Task 25: Docs: `learn/composer-and-context.md` (several chips, files by path, skills, what Claude may read), `learn/the-inbox.md` and `learn/the-tickets-board.md` (one action, Ship, the ticket dialog), the roadmap's 022 line, and a script for the user's `docs/product/spec.md` changes in `specs/022-composer-quick-add-and-skills/product-spec-edits.md`
      Check: pnpm gate learn-freshness specs handbook-size
      Files: learn/composer-and-context.md, learn/the-inbox.md, learn/the-tickets-board.md, docs/product/roadmap.md, specs/022-composer-quick-add-and-skills/product-spec-edits.md
- [ ] Task 26: Open every changed screen in a real browser (Home with 5 chips, the context dialog, Home's rows, Tickets, the ticket dialog, the skills list) at 360 and 1280 px in light and dark, with `/api` faked by `page.route`; measure CLS on load; fix what it finds; note it in the spec (AC-25, AC-34, AC-47, AC-60, AC-61)
      Check: the browser check's notes in spec.md; pnpm verify
      Files: whatever the check finds; specs/022-composer-quick-add-and-skills/spec.md
- [ ] Task 27: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
