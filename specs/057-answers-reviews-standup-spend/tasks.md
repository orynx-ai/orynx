# Tasks: Answer from anywhere, review comments, standup, read ahead and spend

One task is one commit. Test first, then code. Tick a task only when its Check passes.

## A. Answer Claude's questions without opening Orynx

- [x] Task 1: Contracts for chat answers: `chatAnswers` in Notifications settings (off by default) and its change; `from` on the `answered` step; `unsent` on the `waiting` step; `bot` on Slack's connection, with its route path (AC-11, AC-12)
      Check: pnpm test packages/contracts/src/notifications.test.ts packages/contracts/src/session.test.ts packages/contracts/src/slack.test.ts; pnpm typecheck
      Files: packages/contracts/src/notifications.ts, packages/contracts/src/session.ts, packages/contracts/src/slack.ts, packages/contracts/src/routes.ts, packages/contracts/src/testing.ts
- [x] Task 2: Read a chat reply against the waiting question (number, numbers, skip, Other, out of range, several on a one-pick), and write every message Orynx sends (AC-1, AC-3, AC-4, AC-5, AC-9, AC-10)
      Check: pnpm test packages/core/src/chat-answers/reply.test.ts packages/core/src/chat-answers/words.test.ts
      Files: packages/core/src/chat-answers/reply.ts, packages/core/src/chat-answers/words.ts, and their tests
- [x] Task 3: Discord's DM: open it, send, and read your messages after Orynx's, including Discord's Reply, with 429 and refused DMs as problems (AC-1, AC-8, AC-13)
      Check: pnpm test packages/core/src/integrations/discord/client.test.ts packages/core/src/integrations/discord/no-token-leaks.test.ts
      Files: packages/core/src/integrations/discord/client.ts, packages/core/src/test/fake-discord.ts, the tests
- [x] Task 4: Slack's bot: check a bot token, open the DM, send, and read the thread's replies; the bot token as its own keychain item (AC-14)
      Check: pnpm test packages/core/src/integrations/slack/client.test.ts packages/core/src/secrets/token-store.test.ts packages/core/src/integrations/slack/no-token-leaks.test.ts
      Files: packages/core/src/integrations/slack/client.ts, packages/core/src/secrets/token-store.ts, packages/core/src/test/fake-slack.ts, the tests
- [x] Task 5: Save and remove Slack's bot token, checked first, and say `bot` in Slack's connection (AC-14)
      Check: pnpm test packages/core/src/routes/slack.test.ts
      Files: packages/core/src/integrations/slack/connection.ts, packages/core/src/routes/slack.ts, the test
- [x] Task 6: `respond()` takes where the answer came from, and the `answered` step keeps it; the `waiting` step can be marked unsent (AC-2, AC-13)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts -t "answered from"
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts
- [x] Task 7: The chat-answers service: send on `asked` as the row says, check each thread every 15 s, answer with the first good reply, say "Sent to Claude.", ignore pings and other people (AC-1, AC-2, AC-3, AC-5, AC-9, AC-10, AC-11, AC-16)
      Check: pnpm test packages/core/src/chat-answers/chat-answers.test.ts
      Files: packages/core/src/chat-answers/chat-answers.ts, packages/core/src/create-server.ts, the test
- [x] Task 8: Answered in Orynx, stopped, two waiting on Discord, and a failed send, each with its reply or line (AC-6, AC-7, AC-8, AC-13)
      Check: pnpm test packages/core/src/chat-answers/chat-answers.test.ts
      Files: packages/core/src/chat-answers/chat-answers.ts, the test
- [x] Task 9: The hub's desktop channel: send a question to the desktop app over its port, take its reply, say `desktopReplies` in status, and share the page's "should this alert" rule through contracts (AC-15)
      Check: pnpm test apps/server/src/desktop-questions.test.ts packages/contracts/src/notifications.test.ts packages/app/src/features/notifications/alerts.test.ts
      Files: apps/server/src/desktop-questions.ts, apps/server/src/main.ts, packages/contracts/src/notification-delivery.ts, packages/contracts/src/desktop-questions.ts, packages/contracts/src/status.ts, packages/core/src/chat-answers/chat-answers.ts, packages/app/src/features/notifications/quiet.ts, the tests
- [x] Task 10: The desktop app shows the question with a reply box on macOS and posts the reply back (AC-15)
      Check: pnpm test apps/desktop/src/questions.test.ts
      Files: apps/desktop/src/questions.ts, apps/desktop/src/main.ts, the test
- [x] Task 11: api-client: Slack's bot token, and `chatAnswers` in the notification settings (AC-12, AC-14)
      Check: pnpm test packages/api-client/src/chat.test.ts packages/api-client/src/notifications.test.ts
      Files: packages/api-client/src/endpoints/slack.ts, packages/api-client/src/client.ts, the tests
- [x] Task 12: Settings › Notifications: "Answer Claude's questions from chat" with its picker, disabled until Slack's bot or Discord is connected (AC-12, AC-17)
      Check: pnpm test packages/app/src/features/settings/components/notifications-panel.test.tsx
      Files: packages/app/src/features/settings/components/notifications-panel.tsx, the test
- [x] Task 13: Settings › Connections › Slack: the bot token field, checked, saved and removed (AC-14)
      Check: pnpm test packages/app/src/features/settings/components/slack-bot-form.test.tsx
      Files: packages/app/src/features/settings/components/slack-bot-form.tsx, packages/app/src/features/settings/components/connection-dialog.tsx, packages/app/src/features/settings/queries.ts, the test
- [x] Task 14: The steps say where you answered from, and a waiting step says it couldn't be sent; the page skips a question's desktop notification when status says `desktopReplies` (AC-2, AC-13, AC-15)
      Check: pnpm test packages/app/src/features/sessions/step-words.test.ts packages/app/src/features/sessions/components/session-progress.test.tsx packages/app/src/features/notifications/alerts.test.ts
      Files: packages/app/src/features/sessions/step-words.ts, packages/app/src/features/notifications/alerts.ts, the tests
- [ ] Task 15: e2e: a question answered from the fake Discord, then one answered in Orynx first (AC-1, AC-2, AC-6)
      Check: pnpm test:e2e e2e/chat-answers.spec.ts
      Files: e2e/chat-answers.spec.ts, e2e/fake-tools/preload.ts, e2e/fake-tools/config.ts

## B. Review comments in the diff

- [ ] Task 16: Contracts: a pull request's threads with side, outdated, link, every comment and `placeable`, and the route path (AC-18, AC-21)
      Check: pnpm test packages/contracts/src/pull-requests.test.ts; pnpm typecheck
      Files: packages/contracts/src/pull-requests.ts, packages/contracts/src/routes.ts, packages/contracts/src/testing.ts
- [ ] Task 17: GitHub's thread read gains side, outdated, link and every comment's time; spec 049's draft still reads the last comment (AC-19, AC-21)
      Check: pnpm test packages/core/src/integrations/github/client.test.ts packages/core/src/sessions/pull-requests.test.ts
      Files: packages/core/src/integrations/github/client.ts, packages/core/src/test/fake-github.ts, the tests
- [ ] Task 18: `GET /api/sessions/:id/review-threads`: the threads read live, `placeable` from the files changed since the last push, 404 with no PR, and a failure as its own answer (AC-18, AC-21, AC-23, AC-25)
      Check: pnpm test packages/core/src/routes/review-threads.test.ts
      Files: packages/core/src/sessions/review-threads.ts, packages/core/src/routes/sessions.ts, the test
- [ ] Task 19: An inbox sync that sees a session's pull request change says `session.changed` for it (AC-24)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts -t "review comments"
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/create-server.ts, the test
- [ ] Task 20: api-client: the review threads and their query options (AC-18)
      Check: pnpm test packages/api-client/src/endpoints/sessions.test.ts
      Files: packages/api-client/src/endpoints/sessions.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts
- [ ] Task 21: The Review comments tab: count, skeleton, empty, error with Try again, threads by file with their labels, and Reply to reviewers (AC-18, AC-19, AC-21, AC-22, AC-23, AC-25, AC-26)
      Check: pnpm test packages/app/src/features/sessions/components/review-comments-panel.test.tsx packages/app/src/features/sessions/session-screen.test.tsx
      Files: packages/app/src/features/sessions/components/review-comments-panel.tsx, packages/app/src/features/sessions/session-screen.tsx, packages/app/src/features/sessions/review-words.ts, the tests
- [ ] Task 22: Reviewers' notes in the Changes diff and their count in the file list (AC-20, AC-21, AC-26)
      Check: pnpm test packages/app/src/features/sessions/components/changes-panel.test.tsx
      Files: packages/app/src/features/sessions/components/changes-panel.tsx, the test
- [ ] Task 23: e2e: the tab and a note in the diff on a session's own pull request, with no axe violations in either theme (AC-18, AC-20, AC-26)
      Check: pnpm test:e2e e2e/pull-requests.spec.ts
      Files: e2e/pull-requests.spec.ts, e2e/fake-tools/preload.ts

## C. Standup draft

- [ ] Task 24: Contracts: the standup and its route path (AC-27, AC-31)
      Check: pnpm test packages/contracts/src/standup.test.ts; pnpm typecheck
      Files: packages/contracts/src/standup.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [ ] Task 25: GitHub's search for your pull requests merged on a day, and Jira's for the issues you moved that day (AC-28, AC-31)
      Check: pnpm test packages/core/src/integrations/github/client.test.ts packages/core/src/integrations/jira/client.test.ts
      Files: packages/core/src/integrations/github/client.ts, packages/core/src/integrations/jira/client.ts, packages/core/src/test/fake-github.ts, packages/core/src/test/fake-jira.ts
- [ ] Task 26: The last working day and the standup's text from plain facts (AC-28, AC-29, AC-30)
      Check: pnpm test packages/core/src/standup/standup-text.test.ts
      Files: packages/core/src/standup/standup-text.ts, the test
- [ ] Task 27: The standup service and `GET /api/standup`: facts from sessions, GitHub, Jira and the sprint, with each failed source missing (AC-28, AC-31)
      Check: pnpm test packages/core/src/routes/standup.test.ts
      Files: packages/core/src/standup/standup-service.ts, packages/core/src/routes/standup.ts, packages/core/src/create-server.ts, the test
- [ ] Task 28: api-client: the standup (AC-27)
      Check: pnpm test packages/api-client/src/endpoints/standup.test.ts
      Files: packages/api-client/src/endpoints/standup.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts
- [ ] Task 29: Home's "Write my standup" chip and the dialog: skeleton, the draft in an editable box, Copy, Close, the missing lines, focus and Escape (AC-27, AC-30, AC-31, AC-32, AC-33)
      Check: pnpm test packages/app/src/features/home/components/standup-dialog.test.tsx packages/app/src/features/home/components/quick-starts.test.tsx
      Files: packages/app/src/features/home/components/standup-dialog.tsx, packages/app/src/features/home/components/quick-starts.tsx, packages/app/src/features/home/composer-words.ts, the tests

## D. Review requests read ahead

- [ ] Task 30: Contracts: the `readReviewsAhead` preference (off), a session's `readAhead` mark, and the inbox row's `readAhead` (AC-34, AC-35)
      Check: pnpm test packages/contracts/src/preferences.test.ts packages/contracts/src/inbox.test.ts; pnpm typecheck
      Files: packages/contracts/src/preferences.ts, packages/contracts/src/inbox.ts, packages/contracts/src/session.ts, packages/contracts/src/testing.ts
- [ ] Task 31: The read-ahead queue as a pure function: one at a time, fewer than 2 working, 5 a day, oldest first, withdrawn dropped (AC-37, AC-38, AC-39, AC-40)
      Check: pnpm test packages/core/src/read-ahead/queue.test.ts
      Files: packages/core/src/read-ahead/queue.ts, the test
- [ ] Task 32: The read-ahead service: new requests after turning on start a review, the queue moves when a session ends or the setting changes, and Home's rows carry `readAhead` (AC-35, AC-36, AC-37, AC-38, AC-40, AC-41)
      Check: pnpm test packages/core/src/read-ahead/read-ahead-service.test.ts
      Files: packages/core/src/read-ahead/read-ahead-service.ts, packages/core/src/inbox/inbox-service.ts, packages/core/src/sessions/session-service.ts, packages/core/src/create-server.ts, the test
- [ ] Task 33: Settings › Coding agent: "Read review requests ahead" (AC-34)
      Check: pnpm test packages/app/src/features/settings/components/coding-agent-panel.test.tsx
      Files: packages/app/src/features/settings/components/coding-agent-panel.tsx, the test
- [ ] Task 34: Home's review row: "Waiting to read", "Claude is reading", "Draft ready", and Review opens the session already reading (AC-35, AC-36, AC-38)
      Check: pnpm test packages/app/src/features/home/components/attention-panel.test.tsx
      Files: packages/app/src/features/home/components/attention-panel.tsx, packages/app/src/features/home/composer-words.ts, the test

## E. Spend and limit warnings

- [ ] Task 35: Contracts: the summary's `costUsd` and `startedAt`, Claude's limit in status, and the `limit_near` notification (AC-42, AC-45, AC-50)
      Check: pnpm test packages/contracts/src/session.test.ts packages/contracts/src/status.test.ts packages/contracts/src/notifications.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/status.ts, packages/contracts/src/notifications.ts, packages/contracts/src/testing.ts
- [ ] Task 36: A cost never goes down, and the list's summaries carry it (AC-42, AC-44, AC-50)
      Check: pnpm test packages/core/src/sessions/file-session-store.test.ts packages/core/src/sessions/session-service.test.ts -t "cost"
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-store.ts, the tests
- [ ] Task 37: Read `rate_limit_event`, keep the warning until it resets or says `allowed`, and notify once per window (AC-45, AC-46, AC-47, AC-48)
      Check: pnpm test packages/core/src/agents/claude/sdk-messages.test.ts packages/core/src/limits/limit-watch.test.ts
      Files: packages/core/src/agents/claude/sdk-messages.ts, packages/core/src/agents/agent-adapter.ts, packages/core/src/limits/limit-watch.ts, packages/core/src/notifications/session-notifications.ts, packages/core/src/status/status-service.ts, packages/core/src/create-server.ts, the tests
- [ ] Task 38: `SessionItem` gains a `detail` slot, with a story for it and a test (AC-42)
      Check: pnpm test packages/ui/src/components/session-item.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/session-item.tsx, packages/ui/src/components/session-item.stories.tsx, packages/ui/src/components/session-item.test.tsx
- [ ] Task 39: The Sessions page: each row's cost and the Today, This week and This month tiles (AC-42, AC-43, AC-49, AC-50)
      Check: pnpm test packages/app/src/features/sessions/sessions-screen.test.tsx
      Files: packages/app/src/features/sessions/sessions-screen.tsx, packages/app/src/features/sessions/components/spend-tiles.tsx, the tests
- [ ] Task 40: The limit callout on Home and the Sessions page, and the notification's words (AC-45, AC-46, AC-47, AC-48, AC-49)
      Check: pnpm test packages/app/src/features/sessions/components/limit-callout.test.tsx packages/app/src/features/notifications/words.test.ts packages/app/src/features/home/home-screen.test.tsx
      Files: packages/app/src/features/sessions/components/limit-callout.tsx, packages/app/src/features/home/home-screen.tsx, packages/app/src/features/sessions/sessions-screen.tsx, packages/app/src/features/notifications/words.ts, the tests
- [ ] Task 41: e2e: the standup dialog, the spend tiles and the limit callout, with no axe violations in either theme (AC-33, AC-43, AC-49)
      Check: pnpm test:e2e e2e/standup-and-spend.spec.ts
      Files: e2e/standup-and-spend.spec.ts

## Docs and review

- [ ] Task 42: Learn pages and skills: answering from chat and the notification, the Slack bot, review comments, the standup, read ahead, spend; the writes table gains the DMs
      Check: pnpm gate learn-freshness; pnpm gate handbook-size
      Files: learn/notifications.md, learn/connecting-slack-and-discord.md, learn/sessions-and-worktrees.md, learn/desktop-app.md, .claude/skills/integration-adapter/SKILL.md, .claude/skills/agent-runtime/SKILL.md
- [ ] Task 43: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
