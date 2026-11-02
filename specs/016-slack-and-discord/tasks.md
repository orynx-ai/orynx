# Tasks: Slack and Discord

One task is one commit. Test first, then code. Tick a task only when its Check passes.

**ui** (first: `SourceMark` must know Discord before the tool enum grows)

- [x] Task 1: Discord's tokens (`--source-discord`, `--source-discord-subtle`, `--brand-discord`, light, dark and auto) and their theme names; `docs/design-map.md` rows (AC-45)
      Check: pnpm gate style-policy; pnpm test packages/ui/src/components/source-mark.test.tsx
      Files: packages/ui/src/styles/tokens.css, packages/ui/src/styles/theme.css, docs/design-map.md
- [x] Task 2: `SourceMark` draws Discord's logo (Simple Icons, CC0) with its name; a story per size in both themes, with no axe violations (AC-16, AC-45)
      Check: pnpm test packages/ui/src/components/source-mark.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/source-mark.tsx, source-mark.stories.tsx, source-mark.test.tsx

**Contracts**

- [x] Task 3: `discord` joins `IntegrationIdSchema` and `StatusSchema.integrations`; every record keyed by a tool is filled (token keys, keychain account, `makeStatus`, the app's `toolNames`, `howToConnect`, `reads`, `items`), and Discord reads `not_connected` (AC-5, AC-9)
      Check: pnpm test packages/contracts/src/status.test.ts; pnpm typecheck
      Files: packages/contracts/src/status.ts, packages/contracts/src/testing.ts, packages/core/src/secrets/keychain.ts, packages/core/src/status/status-service.ts, apps/server/src/config.ts, .env.example, packages/app/src/features/settings/components/connection-words.ts
- [x] Task 4: Slack's and Discord's connection shapes (request with token, Discord's optional user ID; saved connection; answer) and their paths in `routes.ts` (AC-2, AC-3, AC-6, AC-7, AC-8)
      Check: pnpm test packages/contracts/src/slack.test.ts packages/contracts/src/discord.test.ts; pnpm typecheck
      Files: packages/contracts/src/slack.ts, packages/contracts/src/discord.ts, their tests, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [x] Task 5: The inbox grows: `slack` and `discord` sources, tabs and tool states; the `message` subject, the `no_reply` reason, `SlackLinkSchema` and `DiscordLinkSchema` in targets and sync changes; every record and switch filled (AC-10, AC-11, AC-16, AC-19)
      Check: pnpm test packages/contracts/src/inbox.test.ts packages/contracts/src/sync-activity.test.ts; pnpm typecheck
      Files: packages/contracts/src/inbox.ts, packages/contracts/src/slack.ts, packages/contracts/src/discord.ts, packages/contracts/src/sync-activity.ts, packages/contracts/src/testing.ts, their tests, the app's and core's records that typecheck names
- [x] Task 6: Preferences: `slack_waiting` and `discord_waiting` rules, on by default, and `replyWaitMinutes` (30, 60, 120, 240, 1440; 120 by default); the `reply_waiting` notification event, on by default (AC-13, AC-18, AC-25)
      Check: pnpm test packages/contracts/src/preferences.test.ts packages/contracts/src/notifications.test.ts; pnpm typecheck
      Files: packages/contracts/src/preferences.ts, packages/contracts/src/notifications.ts, packages/contracts/src/testing.ts, their tests
- [x] Task 7: Thread chips `slack_thread` and `discord_thread` with an optional `label`; the preview's query and answer (`found` with names, `not_connected`, `not_found`); a link parser for both tools (AC-26, AC-27, AC-32)
      Check: pnpm test packages/contracts/src/session.test.ts packages/contracts/src/threads.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/threads.ts, packages/contracts/src/threads.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [x] Task 8: The session's `threadReply` and its pull request's optional `title`; the reply request (text up to 2,000 characters) and answers (`posted`, `failed` with the tool's words) and the dismiss path (AC-40 to AC-44)
      Check: pnpm test packages/contracts/src/session.test.ts packages/contracts/src/threads.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/threads.ts, packages/contracts/src/routes.ts, packages/contracts/src/testing.ts, their tests

**Core: Slack**

- [x] Task 9: Add `@slack/web-api`; Slack's `client.ts` checks a token (`auth.test` with its scopes) and maps refused, missing scopes, rate limited and no answer to problems; `problems.ts` words them; MSW `fake-slack.ts` (AC-2, AC-3, AC-4)
      Check: pnpm test packages/core/src/integrations/slack/client.test.ts packages/core/src/integrations/slack/problems.test.ts
      Files: packages/core/package.json, packages/core/src/integrations/slack/client.ts, problems.ts, their tests, packages/core/src/test/fake-slack.ts
- [x] Task 10: Slack's `connection.ts` (check, keychain, settings, status line "<name> in <workspace>"), its routes, `status-service` and `create-server` wiring; a trace-level leak test (AC-2, AC-3, AC-4, AC-9, AC-33)
      Check: pnpm test packages/core/src/integrations/slack/connection.test.ts packages/core/src/routes/slack.test.ts packages/core/src/integrations/slack/no-token-leaks.test.ts
      Files: packages/core/src/integrations/slack/connection.ts, packages/core/src/routes/slack.ts, packages/core/src/settings/settings-store.ts, packages/core/src/status/status-service.ts, packages/core/src/create-server.ts, their tests
- [x] Task 11: Slack's client reads waiting messages (mentions by search, DMs and group DMs from the last 7 days, whether you replied after, names, permalinks; at most 100 checked); `map.ts` and `rules.ts` make the rows, leaving out @here, @channel, groups, bots and you (AC-10 to AC-15)
      Check: pnpm test packages/core/src/integrations/slack/client.test.ts packages/core/src/integrations/slack/map.test.ts packages/core/src/integrations/slack/rules.test.ts
      Files: packages/core/src/integrations/slack/client.ts, map.ts, rules.ts, their tests, packages/core/src/test/fake-slack.ts

**Core: Discord**

- [x] Task 12: Discord's `client.ts` over `fetch` (REST v10, 10 s limit): the bot, the application's owner or team, Message Content from its flags, the servers; problems for refused, intent off, rate limited and no answer; MSW `fake-discord.ts` (AC-6, AC-7, AC-8)
      Check: pnpm test packages/core/src/integrations/discord/client.test.ts packages/core/src/integrations/discord/problems.test.ts
      Files: packages/core/src/integrations/discord/client.ts, problems.ts, their tests, packages/core/src/test/fake-discord.ts
- [x] Task 13: Discord's `connection.ts`, routes, status ("<bot> · 2 servers"), env `DEVHUB_DISCORD_BOT_TOKEN`; a trace-level leak test (AC-6 to AC-9, AC-33)
      Check: pnpm test packages/core/src/integrations/discord/connection.test.ts packages/core/src/routes/discord.test.ts packages/core/src/integrations/discord/no-token-leaks.test.ts; pnpm gate env-policy
      Files: packages/core/src/integrations/discord/connection.ts, packages/core/src/routes/discord.ts, packages/core/src/settings/settings-store.ts, packages/core/src/status/status-service.ts, packages/core/src/create-server.ts, apps/server/src/config.ts, their tests
- [x] Task 14: Discord's client reads mentions by guild search per server (202 index not ready, 403 skipped), whether you replied after in that channel or thread, and names; `map.ts` and `rules.ts` make the rows (AC-14 to AC-17)
      Check: pnpm test packages/core/src/integrations/discord/client.test.ts packages/core/src/integrations/discord/map.test.ts packages/core/src/integrations/discord/rules.test.ts
      Files: packages/core/src/integrations/discord/client.ts, map.ts, rules.ts, their tests, packages/core/src/test/fake-discord.ts

**Core: inbox, notifications, threads, reply**

- [ ] Task 15: The inbox service, schedule, cache, sync changes and sync activity sync a map of tools; `read()` applies the two rules and the wait; "index not ready" reads `syncing`; one tool failing keeps the others; the cache holds only row fields (AC-10, AC-13, AC-17, AC-18, AC-23, AC-24)
      Check: pnpm test packages/core/src/inbox/
      Files: packages/core/src/inbox/inbox-service.ts, inbox-cache.ts, inbox-schedule.ts, tool-state.ts, sync-changes.ts, sync-activity-service.ts, no-leaks.test.ts, their tests, packages/core/src/create-server.ts
- [ ] Task 16: (saving `replyWaitMinutes` landed in task 6) `reply_waiting` fires once per new Slack or Discord row (AC-18, AC-25)
      Check: pnpm test packages/core/src/preferences/preferences-service.test.ts packages/core/src/notifications/
      Files: packages/core/src/preferences/preferences-service.ts, packages/core/src/notifications/inbox-notifications.ts, notification-service.ts, their tests
- [ ] Task 17: Reading a thread: Slack's whole thread, Discord's thread channel or a message and its Replies; names, files by name; `context-reader` maps not found, no access and not connected to `context_failed` (AC-30, AC-32)
      Check: pnpm test packages/core/src/integrations/slack/client.test.ts packages/core/src/integrations/discord/client.test.ts packages/core/src/sessions/context-reader.test.ts
      Files: packages/core/src/integrations/slack/client.ts, packages/core/src/integrations/discord/client.ts, packages/core/src/sessions/context-reader.ts, their tests
- [ ] Task 18: The brief's thread section (header, "Neha K., 14:05: …", oldest first, 200 messages and 40,000 characters, "N earlier messages left out."); the stored chip's label comes from what was read; a session's no-leaks test covers thread text (AC-30, AC-31, AC-33)
      Check: pnpm test packages/core/src/sessions/brief.test.ts packages/core/src/sessions/compose.test.ts packages/core/src/sessions/no-leaks.test.ts
      Files: packages/core/src/sessions/brief.ts, packages/core/src/sessions/compose.ts, packages/core/src/sessions/no-leaks.test.ts, their tests
- [ ] Task 19: `GET /api/threads/preview?link=` answers the sender and place, `not_connected` or `not_found` (AC-26, AC-27)
      Check: pnpm test packages/core/src/routes/threads.test.ts
      Files: packages/core/src/routes/threads.ts, packages/core/src/routes/threads.test.ts, packages/core/src/create-server.ts
- [ ] Task 20: Create pull request saves the PR's title; `thread-reply.ts` posts to the first thread chip (Slack `chat.postMessage` in the thread as you; Discord a Reply from the bot, no pings) and saves `posted`, or answers `failed` with the tool's words; dismiss saves `dismissed`; the two routes (AC-40 to AC-44)
      Check: pnpm test packages/core/src/sessions/thread-reply.test.ts packages/core/src/routes/sessions.test.ts packages/core/src/sessions/pull-requests.test.ts
      Files: packages/core/src/sessions/thread-reply.ts, packages/core/src/sessions/pull-requests.ts, packages/core/src/routes/sessions.ts, packages/core/src/integrations/slack/client.ts, packages/core/src/integrations/discord/client.ts, their tests

**api-client**

- [ ] Task 21: Slack's and Discord's connection calls and query options; the preview; the reply and dismiss calls (AC-2, AC-6, AC-26, AC-41, AC-43)
      Check: pnpm test packages/api-client/src/endpoints/slack.test.ts packages/api-client/src/endpoints/discord.test.ts packages/api-client/src/endpoints/threads.test.ts
      Files: packages/api-client/src/endpoints/slack.ts, discord.ts, threads.ts, their tests, packages/api-client/src/client.ts, packages/api-client/src/queries.ts

**app: Settings**

- [ ] Task 22: Slack's dialog: the request names all ten scopes; step 2 is a token form (react-hook-form, zod) that connects, shows refused and missing-scope words, and Disconnect; the "talks only to" line names Discord (AC-1 to AC-4, AC-9)
      Check: pnpm test packages/app/src/features/settings/components/connection-dialog.test.tsx packages/app/src/features/settings/components/connections-panel.test.tsx
      Files: packages/app/src/features/settings/components/connection-dialog.tsx, slack-connection-form.tsx, connection-words.ts, connections-panel.tsx, settings-screen.tsx, packages/app/src/features/settings/schemas.ts, packages/app/src/features/settings/queries.ts, their tests
- [ ] Task 23: Discord's row and dialog: step 1 with the Developer Portal link, step 2's token form, the user ID field when a team owns the bot, intent-off words, Disconnect (AC-5 to AC-9)
      Check: pnpm test packages/app/src/features/settings/components/connection-dialog.test.tsx packages/app/src/features/settings/components/connections-panel.test.tsx
      Files: packages/app/src/features/settings/components/connection-dialog.tsx, discord-connection-form.tsx, connections-panel.tsx, connection-words.ts, packages/app/src/features/settings/schemas.ts, packages/app/src/features/settings/queries.ts, their tests
- [ ] Task 24: Inbox rules: Slack's and Discord's rows and "Wait before a message counts"; Notifications: "Someone is waiting on your reply" (AC-18, AC-25)
      Check: pnpm test packages/app/src/features/settings/components/inbox-rules-panel.test.tsx packages/app/src/features/settings/components/notifications-panel.test.tsx packages/app/src/features/notifications/
      Files: packages/app/src/features/settings/components/inbox-rules-panel.tsx, notifications-panel.tsx, packages/app/src/features/notifications/words.ts, packages/app/src/features/notifications/components/notification-centre.tsx, their tests

**app: Home**

- [ ] Task 25: The Slack and Discord tabs, shown once connected, in the address (`/?inbox=slack`), with counts and arrow keys; `/?inbox=slack` without Slack opens on All (AC-19, AC-20)
      Check: pnpm test packages/app/src/features/home/inbox-tabs.test.ts packages/app/src/features/home/components/attention-panel.test.tsx
      Files: packages/app/src/features/home/inbox-tabs.ts, packages/app/src/features/home/components/attention-panel.tsx, their tests
- [ ] Task 26: Message rows: (the pill, sub line, counts and Reason filter landed in task 5) logo, title, "Neha K. in #web-platform" / "· direct message" / "· Acme", "No reply · 3 h", Reply; skeletons, the empty line, the not-connected and failed lines; Sync activity names both tools (AC-10, AC-11, AC-16, AC-21, AC-22, AC-23)
      Check: pnpm test packages/app/src/features/home/inbox-words.test.ts packages/app/src/features/home/components/attention-panel.test.tsx packages/app/src/words/tool-line.test.ts packages/app/src/features/sync-activity/
      Files: packages/app/src/features/home/inbox-words.ts, packages/app/src/features/home/components/attention-panel.tsx, packages/app/src/words/tool-line.ts, packages/app/src/features/sync-activity/sync-words.ts, their tests

**app: Composer and session context**

- [ ] Task 27: Pasting a Slack or Discord link makes a thread chip through the preview, labelled "Neha K. in #web-platform"; not connected and not found say so; the follow-up box does the same; `context_failed` names the thread (AC-26, AC-27, AC-32)
      Check: pnpm test packages/app/src/features/home/composer-rules.test.ts packages/app/src/features/home/components/home-composer.test.tsx packages/app/src/features/sessions/components/follow-up-box.test.tsx
      Files: packages/app/src/features/home/composer-rules.ts, composer-words.ts, packages/app/src/features/home/components/home-composer.tsx, packages/app/src/features/sessions/components/follow-up-box.tsx, packages/app/src/features/home/queries.ts, their tests
- [ ] Task 28: + Add context › "Slack or Discord thread" lists the inbox's messages with a search and keyboard; a message row's Add to composer adds and removes its thread; the session's Context tab lists thread chips (AC-28, AC-29, AC-30)
      Check: pnpm test packages/app/src/features/home/components/add-context.test.tsx packages/app/src/features/home/components/attention-panel.test.tsx packages/app/src/features/sessions/components/context-panel.test.tsx
      Files: packages/app/src/features/home/components/add-context.tsx, attention-panel.tsx, packages/app/src/features/home/inbox-words.ts, packages/app/src/features/sessions/components/context-panel.tsx, their tests

**app: Fix this and the reply**

- [ ] Task 29: `NewTicketDialog` takes `prefill` (title, description, type name) and `onMade(key)`, and opens without the Tickets store; Tickets' use is unchanged (AC-34)
      Check: pnpm test packages/app/src/features/tickets/components/new-ticket.test.tsx packages/app/src/features/tickets/tickets-screen.test.tsx
      Files: packages/app/src/features/tickets/components/new-ticket.tsx, ticket-form.tsx, their tests
- [ ] Task 30: Fix this on message rows: the dialog on the folder's Jira project and its one active sprint, or Orynx; Save makes the ticket and starts a Build with the ticket and thread chips; Jira's refusal and a session that can't start; keyboard and focus (AC-34 to AC-39)
      Check: pnpm test packages/app/src/features/home/components/fix-this.test.tsx packages/app/src/features/home/components/attention-panel.test.tsx; pnpm gate icon-buttons
      Files: packages/app/src/features/home/components/fix-this.tsx, fix-this.test.tsx, attention-panel.tsx, packages/app/src/features/home/inbox-words.ts
- [ ] Task 31: "Tell the thread" on the Session screen once the PR is open and the context holds a thread: an editable reply, Post reply (posting, posted with Open thread, failed with the tool's words), Not now; none without a thread (AC-40 to AC-44)
      Check: pnpm test packages/app/src/features/sessions/components/tell-the-thread.test.tsx packages/app/src/features/sessions/session-screen.test.tsx
      Files: packages/app/src/features/sessions/components/tell-the-thread.tsx, tell-the-thread.test.tsx, packages/app/src/features/sessions/session-screen.tsx, packages/app/src/features/sessions/schemas.ts, packages/app/src/features/sessions/queries.ts

**e2e and docs**

- [ ] Task 32: The e2e fake tools serve Slack and Discord; connect both in Settings, in light and dark at 360 and 1280 px, with axe (AC-1, AC-2, AC-5, AC-6, AC-45)
      Check: pnpm exec playwright test e2e/connect-slack-and-discord.spec.ts
      Files: e2e/fake-tools/preload.ts, e2e/fake-tools/slack.ts, e2e/fake-tools/discord.ts, e2e/connect-slack-and-discord.spec.ts
- [ ] Task 33: From a Slack row: the tab, a thread chip, Fix this, the session, the pull request, and Tell the thread posted, with axe in both themes at 360 and 1280 px (AC-10, AC-19, AC-26, AC-35, AC-41, AC-45)
      Check: pnpm exec playwright test e2e/slack-fix-this.spec.ts
      Files: e2e/slack-fix-this.spec.ts, e2e/fake-tools/slack.ts
- [ ] Task 34: Docs: `learn/connecting-slack-and-discord.md`; `docs/architecture.md` (Slack's library, Discord over fetch, the thread routes); the integration-adapter skill's writes table; the roadmap's 016 row; a script for the people-owned edits to `docs/product/spec.md` and `docs/design/design-system.md`
      Check: pnpm gate learn-freshness; pnpm gate specs; pnpm gate handbook-size
      Files: learn/connecting-slack-and-discord.md, docs/architecture.md, .claude/skills/integration-adapter/SKILL.md, docs/product/roadmap.md, specs/016-slack-and-discord/people-edits.sh
- [ ] Task 35: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
