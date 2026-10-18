# Tasks: Sessions and worktrees

One task is one commit. Test first, then code. Tick a task only when its Check passes. Before task 1, move the branch onto `main` with 010 merged (plan, "Before the first task").

- [x] Task 1: Add the session contracts: `SessionSchema` with its structured steps, problem and `discardedAt`, `recent` on the list query, the start request and its three answers, the stop, discard and detail paths, the `session.changed` event, and test builders (AC-1, AC-11, AC-12, AC-17)
      Check: pnpm test packages/contracts; pnpm typecheck
      Files: packages/contracts/src/session.ts, session.test.ts, events.ts, routes.ts, testing.ts, jira.ts (`JiraLinkSchema` moves here, so `session.ts` can use it without a cycle through `inbox.ts`), inbox.ts, tickets.ts, search.ts, packages/app/src/live-updates.tsx
- [x] Task 2: Pass `AWS_*` only when `CLAUDE_CODE_USE_BEDROCK` is set and `GOOGLE_*` only when `CLAUDE_CODE_USE_VERTEX` is, and add `gitEnvironment()`: the short list plus `SSH_AUTH_SOCK` and `GIT_TERMINAL_PROMPT=0` (AC-20, Q8b, Q8d)
      Check: pnpm test packages/core/src/agents/agent-environment.test.ts
      Files: packages/core/src/agents/agent-environment.ts, agent-environment.test.ts
- [x] Task 3: Read one Jira issue (summary, type, description) and turn its description from Jira's document format into Markdown: paragraphs, headings, lists, code, links, mentions, and the text of anything else (AC-3, AC-13)
      Check: pnpm test packages/core/src/integrations/jira
      Files: packages/core/src/integrations/jira/client.ts, client.test.ts, adf-markdown.ts, adf-markdown.test.ts, packages/core/src/test/fake-jira.ts
- [x] Task 4: Build the brief and the note Q5 gives, word for word, with "No description." when there is none (AC-3, Q5)
      Check: pnpm test packages/core/src/sessions/brief.test.ts
      Files: packages/core/src/sessions/brief.ts, brief.test.ts
- [x] Task 5: Decide each tool call as a table: Q6's tools only, every path inside the worktree after resolving symlinks, nothing under the worktree's `.git`, and every edit refused in Ask before everything, each with the reason Claude is told (AC-5, AC-6, Q6)
      Check: pnpm test packages/core/src/agents/claude/tool-decision.test.ts
      Files: packages/core/src/agents/claude/tool-decision.ts, tool-decision.test.ts
- [x] Task 6: Fold Claude's activity into steps: explore, plan, edit and refused groups, with the latest one running until another kind starts, and the stepper rule (Plan until the first edit, Build after it, Review when finished, never backwards) (AC-4, AC-7, AC-8, Q9b)
      Check: pnpm test packages/core/src/sessions/progress.test.ts
      Files: packages/core/src/sessions/progress.ts, progress.test.ts
- [x] Task 7: Read the SDK's messages into activity: tool uses by kind with paths relative to the worktree, `TodoWrite` items, the result's summary, and errors sorted into login, limit and other, from fixtures typed with the SDK's own types (AC-4, AC-8, AC-13)
      Check: pnpm test packages/core/src/agents/claude/sdk-messages.test.ts
      Files: packages/core/src/agents/claude/sdk-messages.ts, sdk-messages.test.ts
- [x] Task 8: Add `simple-git` and make a worktree: find the default branch, fetch it (20 s, no prompts, the last fetched one when that fails), take the first free `feat/<KEY>`, `-2`, `-3`…, and add the worktree. Tests use temporary repositories with a bare `origin`. Mark `simple-git` decided in `docs/architecture.md` (AC-2, Q1, Q2)
      Check: pnpm test packages/core/src/sessions/worktrees.test.ts; pnpm gate boundaries
      Files: packages/core/package.json, apps/server/package.json, pnpm-lock.yaml, packages/core/src/sessions/worktrees.ts, worktrees.test.ts, packages/core/src/test/git-repository.ts, docs/architecture.md
- [x] Task 9: Remove a worktree and its branch, prune one that's already gone, and abort git when Stop comes during setup (AC-9, AC-10)
      Check: pnpm test packages/core/src/sessions/worktrees.test.ts
      Files: packages/core/src/sessions/worktrees.ts, worktrees.test.ts
- [ ] Task 10: Keep sessions on disk: `session.json` and `brief.md` under `<DEVHUB_HOME>/sessions/<id>/` (folders 0700, files 0600), writes renamed into place and one session's writes in order, Working turned into Stopped with an `interrupted` step when the store opens, and the `recent` filter (AC-14)
      Check: pnpm test packages/core/src/sessions/file-session-store.test.ts
      Files: packages/core/src/sessions/session-store.ts, file-session-store.ts, file-session-store.test.ts
- [ ] Task 11: Add the Claude adapter: `startSession` with the worktree as `cwd`, the allow-listed `env`, `permissionMode: 'default'`, Q6's `tools`, `settingSources: []`, hooks off, `strictMcpConfig`, the `claude_code` preset with Q5's note, and `canUseTool` from the tool decision; `onEvent`; `stop` (interrupt, then close after 5 s). `respond` and `sendMessage` reject until 012 and 013. Tests fake `query()` at the SDK's boundary (AC-3, AC-5, AC-6, AC-9, AC-20)
      Check: pnpm test packages/core/src/agents/claude/claude-adapter.test.ts
      Files: packages/core/src/agents/claude/claude-adapter.ts, claude-adapter.test.ts, packages/core/src/agents/agent-adapter.ts, packages/core/src/test/fake-claude-sdk.ts
- [ ] Task 12: Start a session's record: the folders for the key's project (one, chosen, or none), the login from 010's check, at most three working, and a live session on the ticket reused, including two starts at once (AC-1, AC-11, AC-12, Q3, Q4, Q11)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/session-service.ts, session-service.test.ts
- [ ] Task 13: Run the session: read the issue, make the worktree, write the brief, start Claude and fold its activity into steps. Publish `sessions.changed` on state changes and `session.changed` at most every 250 ms. Failures (Jira, folder, git, login, limit, crash) become the session's problem, and the log names only their kind and exit code (AC-2, AC-3, AC-4, AC-8, AC-13)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/session-service.ts, session-service.test.ts
- [ ] Task 14: Stop a session at any point (Stopping while git works keeps what was made), discard one (stopping it first, then the worktree and branch), and stop every running session when the server closes (AC-9, AC-10, AC-14)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/session-service.ts, session-service.test.ts
- [ ] Task 15: Add `GET /api/sessions/:id`, `POST /api/sessions`, `/stop` and `/discard`, `recent` on the list, and `createServer({ claude, sessions })` with the file store under `dataDir`. Home's issue rows point at a live session. With no `query`, no session starts and nothing runs (AC-1, AC-15, AC-17, AC-22)
      Check: pnpm test packages/core/src/routes/sessions.test.ts packages/core/src/create-server.test.ts packages/core/src/inbox; pnpm typecheck
      Files: packages/core/src/routes/sessions.ts, sessions.test.ts, packages/core/src/create-server.ts, create-server.test.ts, packages/core/src/inbox/rules.ts, rules.test.ts, packages/core/src/index.ts
- [ ] Task 16: Prove that `query()` gets only the allow-listed environment, no settings sources, hooks off and Q6's tools, and that no description, brief, Claude message, file content or account reaches the log at `LOG_LEVEL=trace` or the event stream, finished, stopped and failing. `settings.json` and the keychain don't change (AC-20, AC-21)
      Check: pnpm test packages/core/src/sessions/no-leaks.test.ts
      Files: packages/core/src/sessions/no-leaks.test.ts
- [ ] Task 17: Pass the SDK's `query` and the file store from `apps/server`. Write down the pinned SDK's stream protocol with a probe program that never reaches Claude, then add an e2e fake Claude Code that plays one scripted run. Give the e2e hubs a temporary repository with a bare `origin`, a folder for its project, and the fake Jira's single issue (AC-22)
      Check: pnpm test apps/server; pnpm test:e2e e2e/smoke.spec.ts
      Files: apps/server/src/main.ts, apps/server/package.json, e2e/fake-claude/claude, e2e/fake-claude/session.ts, e2e/fake-tools/preload.ts, playwright.config.ts
- [ ] Task 18: Add `getSession`, `startSession`, `stopSession`, `discardSession` and `sessionQueryOptions` to the api-client, and `recent` on the list (AC-1, AC-9, AC-10)
      Check: pnpm test packages/api-client
      Files: packages/api-client/src/endpoints/sessions.ts, sessions.test.ts, client.ts, queries.ts, index.ts, packages/app/src/test/msw.ts
- [ ] Task 19: Add Button's quiet danger look (ghost, danger text, as `session.html` draws Discard changes) and Callout's `danger` tone (Q9f, existing tokens only), each with stories, tests and design-map rows (AC-10, AC-13, AC-19)
      Check: pnpm test packages/ui/src/components/button.test.tsx packages/ui/src/components/callout.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/button.tsx, button.stories.tsx, button.test.tsx, callout.tsx, callout.stories.tsx, callout.test.tsx, docs/design-map.md
- [ ] Task 20: Add the words: "4 min 12 s", "Started 4 min ago" (Home's `agoText` moves to `words/`), a clock that ticks each second, and each step's title and detail from Q10a (AC-4, AC-8, Q10a, Q10g)
      Check: pnpm test packages/app/src/words packages/app/src/features/sessions/step-words.test.ts packages/app/src/features/home
      Files: packages/app/src/words/duration.ts, duration.test.ts, ago.ts, ago.test.ts, use-now.ts, packages/app/src/features/sessions/step-words.ts, step-words.test.ts, packages/app/src/features/home/inbox-words.ts
- [ ] Task 21: Read a session from `GET /api/sessions/:id`, refresh it on `session.changed`, and show the sidebar's `recent` sessions (AC-4, AC-17)
      Check: pnpm test packages/app/src/live-updates.test.tsx packages/app/src/features/sessions
      Files: packages/app/src/features/sessions/queries.ts, components/sidebar-sessions.tsx, sidebar-sessions.test.tsx, packages/app/src/live-updates.tsx, live-updates.test.tsx
- [ ] Task 22: Add `BuildWithClaude`: start at once with one folder, open the "Start in" menu with several, show Q10d's reasons with their links, keep the button pending (spinner, focus kept) while it starts, and open the session (also an existing one) (AC-1, AC-11, AC-12, AC-18, Q10c, Q10d)
      Check: pnpm test packages/app/src/features/sessions/components/build-with-claude.test.tsx
      Files: packages/app/src/features/sessions/components/build-with-claude.tsx, build-with-claude.test.tsx, packages/app/src/features/sessions/queries.ts
- [ ] Task 23: Put Build with Claude on Tickets' cards (the sparkle) and in the list's last column, for tickets without a live session (AC-1, AC-18)
      Check: pnpm test packages/app/src/features/tickets
      Files: packages/app/src/features/tickets/components/ticket-card.tsx, ticket-card.test.tsx, tickets-list.tsx, tickets-list.test.tsx
- [ ] Task 24: Home's assigned-issue rows say "Build" and start a session, or "Open" for a live session (AC-15)
      Check: pnpm test packages/app/src/features/home
      Files: packages/app/src/features/home/inbox-words.ts, inbox-words.test.ts, components/attention-panel.tsx, attention-panel.test.tsx
- [ ] Task 25: Build the Session screen's frame: the breadcrumb (Q9e), "Started 4 min ago", Open in Jira, the title with its pill, branch and line, and Stop Claude ("Stopping…", then focus on the title). Add the loading skeleton, Not found and the load error (AC-9, AC-16, AC-17, AC-19, Q9e, Q10b)
      Check: pnpm test packages/app/src/features/sessions/session-screen.test.tsx
      Files: packages/app/src/features/sessions/session-screen.tsx, session-screen.test.tsx, components/session-header.tsx, session-header.test.tsx
- [ ] Task 26: Add the stepper and Claude's progress: the heading, the time counting each second while working, the steps (running plain, done ticked) and the danger callout when it couldn't start, full width until 013 (AC-4, AC-7, AC-8, AC-13, AC-14, Q9a, Q9f, Q9g, Q10f)
      Check: pnpm test packages/app/src/features/sessions/components/session-progress.test.tsx
      Files: packages/app/src/features/sessions/components/session-progress.tsx, session-progress.test.tsx, packages/app/src/features/sessions/session-screen.tsx
- [ ] Task 27: Add Discard changes under the progress and its confirm step in a `Dialog`, with focus on Cancel, Esc back to the button, and the discarded step afterwards (AC-10, AC-18, Q9c, Q10e)
      Check: pnpm test packages/app/src/features/sessions/components/discard-session.test.tsx
      Files: packages/app/src/features/sessions/components/discard-session.tsx, discard-session.test.tsx, packages/app/src/features/sessions/session-screen.tsx
- [ ] Task 28: e2e: Build on a card, watch the fake run's steps arrive in this tab and a second one, finish at Review, then start another, stop it and discard it. The repository's own checkout stays as it was (AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, AC-9, AC-10, AC-22)
      Check: pnpm test:e2e e2e/sessions.spec.ts
      Files: e2e/sessions.spec.ts
- [ ] Task 29: e2e: the folder menu and each reason Build can't start, a Jira failure after start, Home's Build and Open, the keyboard path, and axe at 360 and 1280 px in light and dark (AC-11, AC-12, AC-13, AC-15, AC-18, AC-19)
      Check: pnpm test:e2e e2e/sessions.spec.ts
      Files: e2e/sessions.spec.ts
- [ ] Task 30: Docs: a `learn/` page on sessions and worktrees, agent-runtime rules 1, 6 and the adapter as 011 built them (Q7, Q8), the roadmap's 011 and 012 lines, and the pages whose sources changed
      Check: pnpm gate learn-freshness handbook-size specs
      Files: learn/sessions-and-worktrees.md, .claude/skills/agent-runtime/SKILL.md, docs/product/roadmap.md, learn/live-updates.md, learn/local-security.md, learn/tokens-and-keychain.md, learn/checking-claude.md, learn/how-a-request-flows.md, learn/the-inbox.md
- [ ] Task 31: Open the Session screen in a real browser (`pnpm dev`, own `DEVHUB_HOME`) at 360 and 1280 px, light and dark, in each state through `page.route`: loading, Working, Done, Stopped, couldn't start, discarded. Measure CLS while it loads, and tick each check here (AC-16, AC-19)
      Check: screenshots in the scratchpad, CLS 0, no axe violations
      Files: specs/011-sessions-and-worktrees/tasks.md
- [ ] Task 32: Ask the user to run one real session on a throwaway repository (Q13): Build, watch it finish, ask Claude to read through a symlink and outside the worktree, check the `init` message's counts, then Stop and Discard. Write down what happened
      Check: the user's word, and the notes in this file
      Files: specs/011-sessions-and-worktrees/tasks.md
- [ ] Task 33: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
