# Tasks: Codex, a second coding agent beside Claude

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Contracts: `AgentIdSchema`, `CodexLoginSchema`, both agents in `/api/status`, and the Codex login routes (AC-1, AC-2)
      Check: pnpm test packages/contracts/src/codex.test.ts packages/contracts/src/status.test.ts; pnpm typecheck
      Files: packages/contracts/src/codex.ts, codex.test.ts, status.ts, status.test.ts, agent-models.ts, routes.ts, index.ts, testing.ts; every use of `status.agent` (core status service, app queries and picker)
- [x] Task 2: Contracts: the agent on `AgentChoice`, on a session's summary and record (defaulting to claude), and models by agent (AC-5, AC-23)
      Check: pnpm test packages/contracts/src/agent-models.test.ts packages/contracts/src/session.test.ts packages/core/src/sessions/file-session-store.test.ts; pnpm typecheck
      Files: packages/contracts/src/agent-models.ts, session.ts; packages/core/src/sessions/session-store.ts, file-session-store.test.ts, session-service.ts
- [x] Task 3: The app-server connection: spawn, newline JSON-RPC, requests with ids, notifications, server requests, close (AC-17, AC-20)
      Check: pnpm test packages/core/src/agents/codex/app-server.test.ts
      Files: packages/core/src/agents/codex/app-server.ts, app-server.test.ts, protocol.ts, packages/core/src/test/fake-codex.ts
- [x] Task 4: Finding Codex (`DEVHUB_CODEX` or `PATH`, version 0.166 or later) and its login through `account/read`, cached as Claude's is (AC-1, AC-2)
      Check: pnpm test packages/core/src/agents/codex/codex-program.test.ts packages/core/src/agents/codex/codex-login.test.ts
      Files: packages/core/src/agents/codex/codex-program.ts, codex-program.test.ts, codex-login.ts, codex-login.test.ts
- [x] Task 5: The launch: `-c` overrides (the sandbox profile with `DEVHUB_HOME` denied, no network, no MCP servers, no hooks, analytics off) and `untrusted`. Codex's own environment allow list (AC-15, AC-16, AC-25)
      Check: pnpm test packages/core/src/agents/codex/launch.test.ts packages/core/src/agents/agent-environment.test.ts
      Files: packages/core/src/agents/codex/launch.ts, launch.test.ts, packages/core/src/agents/agent-environment.ts, agent-environment.test.ts
- [x] Task 6: Items to steps: reads and searches, the plan, edits, commands with output, the last message, usage (pure) (AC-7)
      Check: pnpm test packages/core/src/agents/codex/items.test.ts
      Files: packages/core/src/agents/codex/items.ts, items.test.ts
- [x] Task 7: The Codex adapter (a): start a thread in the worktree with the brief, model and effort, give events, list models, Stop with interrupt then kill (AC-5, AC-7, AC-20)
      Check: pnpm test packages/core/src/agents/codex/codex-adapter.test.ts
      Files: packages/core/src/agents/codex/codex-adapter.ts, codex-adapter.test.ts, packages/core/src/agents/agent-adapter.ts (`id: AgentId`)
- [x] Task 8: The Codex adapter (b): command approvals through `decideToolUse('Bash')`, including the allow list, Always allow, push refused, escalation on the unsandboxed row, and plain reads inside the worktree decided as Claude's Read (AC-7 to AC-12)
      Check: pnpm test packages/core/src/agents/codex/codex-adapter.test.ts packages/core/src/agents/codex/plain-read.test.ts
      Files: packages/core/src/agents/codex/codex-adapter.ts, codex-adapter.test.ts, plain-read.ts, plain-read.test.ts
- [x] Task 9: The Codex adapter (c): edit approvals, with each changed path through the edit decision and the ask's lines from `parseUnifiedDiff`, and outside the worktree refused (AC-13, AC-14)
      Check: pnpm test packages/core/src/agents/codex/codex-adapter.test.ts
      Files: packages/core/src/agents/codex/codex-adapter.ts, codex-adapter.test.ts
- [x] Task 10: The Codex adapter (d): Orynx's ticket and session tools as `dynamicTools`, answered on `item/tool/call` with their asks (AC-17)
      Check: pnpm test packages/core/src/agents/codex/codex-adapter.test.ts
      Files: packages/core/src/agents/codex/codex-adapter.ts, codex-adapter.test.ts, packages/core/src/orynx-tickets/tools.ts (`ticketTitle`, shared with Claude's adapter)
- [x] Task 11: The Codex adapter (e): follow-ups through `turn/steer`, resume through `thread/resume`, problems (login, limit, resume), and `write()` in an empty folder with a read-only sandbox and no tools (AC-18, AC-19, AC-21, AC-22)
      Check: pnpm test packages/core/src/agents/codex/codex-adapter.test.ts
      Files: packages/core/src/agents/codex/codex-adapter.ts, codex-adapter.test.ts
- [x] Task 12: The session service runs each session on its own agent's adapter, with a sign-in gate per agent. Follow-ups, the quick read, the PR draft and review replies use it, and older sessions read as Claude (AC-5, AC-6, AC-22, AC-23)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/pull-requests.test.ts
      Files: packages/core/src/sessions/session-service.ts, session-service.test.ts, pull-requests.ts, pull-requests.test.ts
- [x] Task 13: The note for Codex (`AGENTS.md` and `CLAUDE.md`, commands that stay in its sandbox, no push), and no `Co-Authored-By` line on a Codex session's commits (AC-22, Q8)
      Check: pnpm test packages/core/src/sessions/brief.test.ts packages/core/src/sessions/pull-request-text.test.ts
      Files: packages/core/src/sessions/brief.ts, brief.test.ts, pull-request-text.ts, pull-request-text.test.ts
- [x] Task 14: Routes and wiring: `GET /api/codex/login`, `POST /api/codex/login/check`, models by agent, `createServer` building the Codex adapter, and `DEVHUB_CODEX` in the server config (AC-1, AC-2, AC-4)
      Check: pnpm test packages/core/src/routes/codex.test.ts packages/core/src/routes/agent.test.ts apps/server/src/config.test.ts; pnpm gate env-policy
      Files: packages/core/src/routes/codex.ts, codex.test.ts, agent.ts, agent.test.ts, create-server.ts, packages/core/src/status/status-service.ts, apps/server/src/config.ts, config.test.ts, main.ts, .env.example, packages/core/src/index.ts, packages/core/src/test/fake-codex/relay (the fake's body, out of the env gate's .ts scope)
- [x] Task 15: api-client: Codex login and check, and models by agent, with query keys beneath the one status.changed refreshes (AC-1, AC-4)
      Check: pnpm test packages/api-client/src/codex.test.ts packages/api-client/src/claude.test.ts
      Files: packages/api-client/src/endpoints/codex.ts, codex.test.ts, endpoints/claude.ts, client.ts, queries.ts, index.ts, claude.test.ts
- [x] Task 16: Settings › Coding agent: the Codex card in place of "More agents", with its four states, Check again, no shift while checking, and keyboard use (AC-1, AC-2, AC-3, AC-26, AC-27)
      Check: pnpm test packages/app/src/features/settings/components/codex-card.test.tsx packages/app/src/features/settings/components/coding-agent-panel.test.tsx
      Files: packages/app/src/features/settings/components/codex-card.tsx, codex-card.test.tsx, agent-login-card.tsx (the card both agents share), agent-login-card.test.tsx, claude-card.tsx, coding-agent-panel.tsx, packages/app/src/features/settings/queries.ts, packages/app/src/live-updates.tsx, packages/app/src/test/msw.ts
- [ ] Task 17: The picker: a group per signed-in agent, the agent kept with the model and effort, falling back when an agent signs out, and the agent sent on start and follow-up (AC-4, AC-5, AC-6, AC-26)
      Check: pnpm test packages/app/src/features/home/components/agent-picker.test.tsx packages/app/src/features/home/store.test.ts
      Files: packages/app/src/features/home/components/agent-picker.tsx, agent-picker.test.tsx, store.ts, queries.ts, composer-words.ts, home-composer.tsx, packages/app/src/features/sessions/components/follow-up-box.tsx
- [ ] Task 18: Words (a): the composer and Home name the picked agent ("Send to Codex", "Review with Codex") (AC-24)
      Check: pnpm test packages/app/src/features/home
      Files: packages/app/src/features/home/composer-words.ts, inbox-words.ts, components that read them
- [ ] Task 19: Words (b): a session's screens, notifications and terminal tab name its agent (AC-7, AC-21)
      Check: pnpm test packages/app/src/features/sessions packages/app/src/features/notifications
      Files: packages/app/src/features/sessions/approval-words.ts, step-words.ts, follow-up-words.ts, review-words.ts, pull-request-words.ts, ticket-tab-words.ts, port-words.ts, components/terminal/terminal-words.ts, packages/app/src/features/notifications/words.ts
- [ ] Task 20: Words (c): Settings words that cover both agents say "the agent" (Q4)
      Check: pnpm test packages/app/src/features/settings
      Files: packages/app/src/features/settings/permission-levels.ts, components/coding-agent-panel.tsx, jira-changes.tsx, settings-screen.tsx
- [ ] Task 21: e2e: a fake `codex` app-server. Connect it, pick a Codex model, Build, Allow a command, see Done (AC-1, AC-4, AC-5, AC-8, AC-27)
      Check: pnpm test:e2e e2e/codex.spec.ts
      Files: e2e/fake-codex/codex, e2e/fake-codex/config.ts, e2e/codex.spec.ts, playwright.config.ts
- [ ] Task 22: Docs: the architecture's Coding agent and sandbox rows, `learn/checking-codex.md`, the agent-runtime skill, and the manual real-Codex check list for `/review` (needs the user's OK: it uses their ChatGPT login)
      Check: pnpm gate handbook-size; pnpm gate specs
      Files: docs/architecture.md, learn/checking-codex.md, .claude/skills/agent-runtime/SKILL.md
- [ ] Task 23: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
