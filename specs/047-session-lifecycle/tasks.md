# Tasks: Session lifecycle

One task is one commit. Test first, then code. Tick a task only when its Check passes.

## A. Another session on the same ticket or PR

- [x] Task 1: `another` on the composer's start (AC-2)
      Check: pnpm test packages/contracts/src/session.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/session.test.ts
- [x] Task 2: `composeNow` starts beside a live session when `another` is set, for a ticket and for your own PR in its own detached worktree (AC-2, AC-4)
      Check: pnpm test packages/core/src/sessions/compose.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/compose.test.ts
- [x] Task 3: Both sessions keep their follow-up box (`newer_session` goes), and `sessionsByTicket` shows the newest session that isn't Stopped (AC-5)
      Check: pnpm test packages/core/src/sessions/ticket-sessions.test.ts packages/core/src/sessions/session-service.test.ts packages/contracts/src/session.test.ts packages/app/src/features/sessions/follow-up-words.test.ts packages/app/src/features/sessions/components/follow-up-box.test.tsx; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/ticket-sessions.ts, packages/app/src/features/sessions/follow-up-words.ts, and their tests
- [x] Task 4: The composer's `existing` answer is an `info` Callout with Start a new session (resends with `another: true`) and Open session (AC-1, AC-2, AC-3). Moving the answer into the composer store waits for Task 9, the first that needs it.
      Check: pnpm test packages/app/src/features/home/components/home-composer.test.tsx packages/app/src/features/home/composer-words.test.ts; pnpm gate style-policy
      Files: packages/app/src/features/home/components/home-composer.tsx, packages/app/src/features/home/composer-words.ts, and their tests
- [x] Task 5: e2e: a second session on a ticket from the callout, Open session, and the callout's axe at 360 and 1280 px in light and dark (AC-1, AC-2, AC-3, AC-25)
      Check: pnpm exec playwright test e2e/composer.spec.ts
      Files: e2e/composer.spec.ts

## B. Fix on Home

- [x] Task 6: The inbox reads `isCrossRepository`, so a pull request from a fork is known on its row (AC-6, AC-7)
      Check: pnpm test packages/core/src/integrations/github/client.test.ts packages/core/src/integrations/github/map.test.ts packages/contracts/src/inbox.test.ts packages/core/src/inbox/rules.test.ts
      Files: packages/core/src/integrations/github/client.ts, packages/core/src/integrations/github/map.ts, packages/core/src/inbox/rules.ts, packages/contracts/src/inbox.ts, packages/core/src/test/fake-github.ts, and their tests
- [x] Task 7: A Build that names no folder, with no ticket and a pull request chip, works in the folder whose origin is that pull request's repository; none or several answer `choose_folder` (AC-6, AC-8)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/compose.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/compose.ts, and their tests
- [x] Task 8: `rowAction` gives Fix review comments and Fix failing checks for your own open, non-fork pull request's rows, with their messages (AC-6, AC-7)
      Check: pnpm test packages/app/src/features/home/inbox-words.test.ts packages/app/src/features/home/composer-words.test.ts
      Files: packages/app/src/features/home/inbox-words.ts, packages/app/src/features/home/composer-words.ts, and their tests (the row keeps + until Task 9's button, in attention-panel.tsx)
- [x] Task 9: The composer's last answer moves into the composer store, so Send and Fix both write it. The row's Fix `IconButton` (`Wrench01Icon`) starts the session with the composer's model and effort and opens it. An `existing` answer shows A's callout under the composer; a `cannot_start` or `context_failed` answer puts the PR in the composer as Build with Send's line. The draft is untouched when it starts (AC-6, AC-7, AC-8, AC-9, AC-10)
      Check: pnpm test packages/app/src/features/home/components/attention-panel.test.tsx packages/app/src/features/home/home-screen.test.tsx; pnpm gate style-policy; pnpm gate icon-buttons
      Files: packages/app/src/features/home/components/attention-panel.tsx, packages/app/src/features/home/components/home-composer.tsx, packages/app/src/features/home/store.ts, and their tests
- [x] Task 10: e2e: Fix review comments starts a Build on the PR's branch and opens it; by keyboard; axe at 360 and 1280 px in light and dark (AC-6, AC-10, AC-25)
      Check: pnpm exec playwright test e2e/composer.spec.ts
      Files: e2e/composer.spec.ts (the fakes needed no new field)

## C. After the merge

- [x] Task 11: PR merged and PR closed states: contracts, `SessionItem` and `AgentChip` (merge icon in Done's green, closed-PR icon in PR open's grey) with stories, the Session header's pill and the Sessions Status filter (AC-11, AC-14)
      Check: pnpm test packages/contracts/src/session.test.ts packages/ui/src/components/session-item.test.tsx packages/ui/src/components/agent-chip.test.tsx packages/app/src/features/sessions/session-filters.test.ts packages/app/src/features/sessions/components/session-header.test.tsx; pnpm typecheck; pnpm gate style-policy; pnpm gate component-coverage
      Files: packages/contracts/src/session.ts, packages/ui/src/components/session-item.tsx, packages/ui/src/components/session-item.stories.tsx, packages/ui/src/components/agent-chip.tsx, packages/ui/src/components/agent-chip.stories.tsx, packages/app/src/features/sessions/components/session-header.tsx, packages/app/src/features/sessions/session-filters.ts, and their tests
- [x] Task 12: The GitHub client's `pullState`: a pull request's state (open, closed, merged) and head commit, one REST call; any failure is a problem, not a throw (AC-11, AC-14, AC-15)
      Check: pnpm test packages/core/src/integrations/github/client.test.ts
      Files: packages/core/src/integrations/github/client.ts, packages/core/src/integrations/github/client.test.ts, packages/core/src/test/fake-github.ts
- [x] Task 13: "Nothing would be lost": nothing uncommitted, and HEAD is the given commit or an ancestor of it (`merge-base --is-ancestor`), or with no PR on origin's branch; fails closed (AC-12, AC-13, AC-18)
      Check: pnpm test packages/core/src/sessions/branch-git.test.ts
      Files: packages/core/src/sessions/branch-git.ts, packages/core/src/sessions/branch-git.test.ts
- [ ] Task 14: The watch: with each inbox sync, PR open and PR closed sessions with a worktree get their state from GitHub; a merge where nothing would be lost removes the worktree as Delete does, branch kept, once; working sessions wait; GitHub unreachable changes nothing (AC-11, AC-12, AC-13, AC-14, AC-15)
      Check: pnpm test packages/core/src/sessions/pull-watch.test.ts packages/core/src/inbox/inbox-schedule.test.ts
      Files: packages/core/src/sessions/pull-watch.ts, packages/core/src/sessions/pull-watch.test.ts, packages/core/src/inbox/inbox-schedule.ts, packages/core/src/create-server.ts, packages/core/src/sessions/session-service.ts
- [ ] Task 15: Merged and closed sessions don't hold their ticket or PR (`isLive`, `sessionsByTicket`); a merged session's follow-up box says "This pull request is merged. Start a new session from the ticket to carry on." (AC-12, AC-16)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/ticket-sessions.test.ts packages/app/src/features/sessions/follow-up-words.test.ts packages/app/src/features/sessions/components/follow-up-box.test.tsx; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/core/src/sessions/session-service.ts, packages/core/src/sessions/ticket-sessions.ts, packages/app/src/features/sessions/follow-up-words.ts, and their tests
- [ ] Task 16: e2e: the fake GitHub merges a session's PR; after Sync the session is PR merged in the sidebar and on Tickets, its worktree is gone and its branch stays; axe for the new states at 360 and 1280 px in light and dark (AC-11, AC-12, AC-25)
      Check: pnpm exec playwright test e2e/pull-requests.spec.ts
      Files: e2e/pull-requests.spec.ts, e2e/fake-tools/preload.ts, packages/core/src/test/fake-github.ts

## D. Cleanup schedule

- [ ] Task 17: Contracts: `deleteSessionsAfterDays` (null, 7, 14, 30, 90; default null) in preferences and its change; the `sessions_cleaned` notification (count, bytes, days); `GET /api/storage` (worktrees' bytes, and each choice's count and bytes) (AC-16, AC-17, AC-19)
      Check: pnpm test packages/contracts/src/preferences.test.ts packages/contracts/src/notifications.test.ts packages/contracts/src/storage.test.ts; pnpm typecheck
      Files: packages/contracts/src/preferences.ts, packages/contracts/src/notifications.ts, packages/contracts/src/storage.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, and their tests
- [ ] Task 18: Which sessions would go: Done, Stopped, PR merged or PR closed; older than the choice by `updatedAt`; not pinned; nothing would be lost (Task 13). The worktrees' sizes, walked without following links (AC-17, AC-18)
      Check: pnpm test packages/core/src/sessions/session-cleanup.test.ts
      Files: packages/core/src/sessions/session-cleanup.ts, packages/core/src/sessions/session-cleanup.test.ts
- [ ] Task 19: The schedule and `GET /api/storage`: runs when the setting changes, at hub start and hourly, one delete at a time through `removeNow` with the branch kept; a failure leaves the session for the next run; one bell notification per run that deleted anything; Never deletes nothing (AC-17, AC-19, AC-20, AC-21)
      Check: pnpm test packages/core/src/sessions/session-cleanup.test.ts packages/core/src/routes/storage.test.ts packages/core/src/notifications/session-notifications.test.ts
      Files: packages/core/src/sessions/session-cleanup.ts, packages/core/src/routes/storage.ts, packages/core/src/routes/storage.test.ts, packages/core/src/create-server.ts, packages/core/src/notifications/session-notifications.ts, packages/core/src/preferences/preferences-service.ts
- [ ] Task 20: api-client: `getStorage` and its query options; `sessions.changed` refetches it (AC-16, AC-17)
      Check: pnpm test packages/api-client/src/storage.test.ts packages/app/src/live-updates.test.tsx
      Files: packages/api-client/src/endpoints/storage.ts, packages/api-client/src/storage.test.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/index.ts, packages/app/src/live-updates.tsx
- [ ] Task 21: Settings › Coding agent's Storage section: the size line (skeleton while measured, an error line when it fails), Delete old sessions saved as you pick, each choice's "3 sessions now, 4.1 GB"; the bell's "Orynx deleted 3 old sessions and freed 4.1 GB." (AC-16, AC-17, AC-19)
      Check: pnpm test packages/app/src/features/settings/components/storage-section.test.tsx packages/app/src/features/settings/components/coding-agent-panel.test.tsx packages/app/src/features/notifications/words.test.ts; pnpm gate style-policy
      Files: packages/app/src/features/settings/components/storage-section.tsx, packages/app/src/features/settings/components/coding-agent-panel.tsx, packages/app/src/features/notifications/words.ts, and their tests
- [ ] Task 22: e2e: Storage shows the size, saves After 30 days and keeps it after a reload; axe at 360 and 1280 px in light and dark (AC-16, AC-17, AC-25)
      Check: pnpm exec playwright test e2e/coding-agent.spec.ts
      Files: e2e/coding-agent.spec.ts

## E. Turns and cost

- [ ] Task 23: The SDK's `result` gives a `usage` agent event (`num_turns`, `total_cost_usd`); the session adds up turns, keeps the latest cost, and keeps them after Stop; `turns` (default 0) and `costUsd` (default null) on the session (AC-22, AC-23, AC-24)
      Check: pnpm test packages/core/src/agents/claude/sdk-messages.test.ts packages/core/src/agents/claude/claude-adapter.test.ts packages/core/src/sessions/session-service.test.ts packages/contracts/src/session.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/core/src/agents/agent-adapter.ts, packages/core/src/agents/claude/sdk-messages.ts, packages/core/src/agents/claude/claude-adapter.ts, packages/core/src/sessions/session-service.ts, packages/core/src/test/fake-claude-sdk.ts, and their tests
- [ ] Task 24: The progress line: "4 min 12 s · 38 turns · ≈ $1.42" ("1 turn", "< $0.01") with its tooltip; time only before the first turn ends or for an older session (AC-22, AC-24)
      Check: pnpm test packages/app/src/features/sessions/components/session-progress.test.tsx; pnpm gate style-policy
      Files: packages/app/src/features/sessions/components/session-progress.tsx, packages/app/src/features/sessions/step-words.ts, and their tests
- [ ] Task 25: e2e: the line after Done, a follow-up adds the turns, and its tooltip; axe at 360 and 1280 px in light and dark (AC-22, AC-23, AC-25)
      Check: pnpm exec playwright test e2e/changes.spec.ts
      Files: e2e/changes.spec.ts, e2e/fake-claude/session.ts

- [ ] Task 26: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
