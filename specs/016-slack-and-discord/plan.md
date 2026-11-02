# Plan: Slack and Discord

Spec: `specs/016-slack-and-discord/spec.md`

## Shape

Slack and Discord are two more integrations in the Jira and GitHub mould (`packages/core/src/integrations/<tool>/`: `client.ts`, `problems.ts`, `connection.ts`, `map.ts`, `rules.ts`). The rest of Orynx sees them through four shared shapes:

- **Tools.** `IntegrationIdSchema` gains `discord`, and `InboxSourceSchema`, `InboxTabSchema` and `InboxSchema.tools` gain `slack` and `discord`. Every `Record` keyed by a tool breaks at once (token keys, `makeStatus`, the app's `toolNames`, `howToConnect`, `reads`, sync words). So each enum grows in one commit that fills every record, before any behaviour.
- **A message row.** `InboxSubjectSchema` gets `{ kind: 'message', tool, from, place, server, direct }` and `InboxReasonSchema` gets `{ kind: 'no_reply' }`. Targets accept `SlackLinkSchema` (`https://<workspace>.slack.com/archives/…`) and `DiscordLinkSchema` (`https://discord.com/channels/…`). The cache row is the item's fields only, never a thread (B). Rules and the wait apply in `inbox-service.read()`, as Jira's and GitHub's rules do today. So turning a rule off, or changing the wait, needs no sync (AC-18).
- **A thread chip.** `ComposerChipSchema` gets `slack_thread { channel, ts }` and `discord_thread { guild, channel, message }`, plus an optional `label { from, place }` that the server overwrites with what it read. The app makes a chip from a pasted link through `GET /api/threads/preview?link=`, or from an inbox row, which already has the names. `context-reader.ts` reads the thread and `brief.ts` writes its section, applying the limits (C).
- **A reply.** `SessionSchema` gets `threadReply: null | { state: 'dismissed' } | { state: 'posted', url, place }`, and `SessionPullRequestSchema` gets an optional `title`, which Create pull request saves. Two routes, `POST /api/sessions/:id/thread-reply` and `…/thread-reply/dismiss`, call `thread-reply.ts`, which posts through the tool's `client.ts`. The state lives on the server, so Not now lasts (AC-43) and TanStack Query keeps it.

Fix this is app-only. `NewTicketDialog` learns `prefill` and `onMade(key)`. Home's `FixThis` opens it on the folder's Jira project (`RepositorySchema.jiraProject`) and that project's one active sprint, or on Orynx. On `made` it starts a Build through `useStartFromComposer()` with `[ticket chip, thread chip]`, as Fix and Review with Claude already start theirs.

Discord's "you" is the application's owner (`GET /applications/@me`). Message Content is read from that answer's flags (`GATEWAY_MESSAGE_CONTENT` or `_LIMITED`), so AC-7 needs no message to test it. Mentions come from Discord's guild message search (`GET /guilds/:id/messages/search?mentions=`). A `202` with "index not yet available" leaves the tool `syncing` (AC-17).

## Order of work

1. **ui first,** because `SourceMark` must know Discord before the tool enum grows: the Discord tokens in `tokens.css` and `theme.css` (Q5 allowed it), and Discord's logo in `SourceMark`, with stories and tests. `docs/design-map.md` gets its rows.
2. **Contracts, enums first:** `discord` in `IntegrationId`, with every record and factory filled. Then the connection shapes, the inbox shapes and links, preferences (two rules and `replyWaitMinutes`), the notification event, the thread chips and preview, and the session's `threadReply` and PR title.
3. **Core, Slack then Discord, each bottom up:**
   - `client.ts` against an MSW fake (`test/fake-slack.ts`, `test/fake-discord.ts`), then `problems.ts`.
   - Then `connection.ts` with routes, status and a leak test.
   - Then `map.ts` and `rules.ts` for the rows.
   - Then the inbox service, schedule, cache and sync activity, which become maps over tools instead of `jira ? … : …`.
   - Then notifications, thread reading and the brief, the preview route, and the reply service and routes.
4. **api-client:** the connection calls, the preview, and the reply and dismiss calls, each parsing with its contract.
5. **app:**
   - Settings: Slack's step 2, Discord's row and dialog, and Inbox rules with the wait.
   - Home: the tabs, rows, lines and Fix this.
   - The composer: paste, the + menu and row add.
   - The session: the Context tab, and the "Tell the thread" callout.
   - The New ticket dialog's prefill comes before Fix this.
6. **e2e and docs:**
   - The e2e fake tools serve Slack and Discord.
   - One e2e connects both in Settings.
   - One goes from a Slack row through Fix this to a posted reply, with axe at 360 and 1280 px in both themes.
   - Then `learn/connecting-slack-and-discord.md`, `docs/architecture.md`, the integration-adapter skill's writes table, and the roadmap row.
   - A script for the edits to `docs/product/spec.md` and `docs/design/design-system.md`, which people own (F).

## Risks

| Risk                                                                                                                                                          | How we will notice early                                                                                                          | What we do                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Growing shared enums (`IntegrationId`, `InboxSource`, `InboxTab`, `ComposerChip` kinds) breaks every `Record` and `switch` keyed by them across five packages | Tasks 3, 5 and 8 each run `pnpm typecheck`, which lists every place                                                               | Grow each enum in one commit that fills every record. A tool that isn't built yet reads `not_connected`                  |
| Slack has no single "did I reply" call. Reading each candidate thread or DM costs one call each, and Tier 3 limits apply                                      | `rules.test.ts` and the fake count calls per sync                                                                                 | Check at most 100 candidates, longest wait first (B). A `429` is `rate_limited` with Slack's `Retry-After`               |
| Discord's guild search is new (2026) and can answer `202` while it indexes                                                                                    | The client test covers 202, 429 and 403. AC-17's service test                                                                     | Treat 202 as `syncing`, never as a failure. A server without the permission is skipped, and the connection line names it |
| A token leaks into a log, an event or a thrown error (the Slack SDK's errors carry request data)                                                              | A leak test per tool, like `no-token-leaks.test.ts`, with the real hub at trace level                                             | `client.ts` maps every SDK error to a fixed problem, so nothing that held the request leaves it                          |
| Message text ends up in the cache, logs or events                                                                                                             | `inbox/no-leaks.test.ts` gets Slack and Discord rows. The cache test reads `cache.db` (AC-24)                                     | Rows hold the first line only. Events carry ids and counts                                                               |
| Posting writes outside Orynx without the user's click (rule 11)                                                                                               | The reply route test: no `chat.postMessage` or Discord POST happens without the route, and the route is called only by Post reply | The service has one write, behind one route. The security-auditor checks it in `/review`                                 |
| `tokens.css` is protected, so the pre-tool guard may refuse the edit Q5 allowed                                                                               | Task 1 hits it at once                                                                                                            | If the guard refuses, stop and ask the user to make or approve the edit. Never bypass it                                 |
| `NewTicketDialog` has one caller and fixed defaults                                                                                                           | Its test renders it from Tickets and from Home                                                                                    | Add `prefill` and `onMade` as optional props. Tickets' use stays the same                                                |
| `session-service.ts` is very large and its tests have been flaky (specs 049 and 050)                                                                          | Each core task runs its tests with the fake clock                                                                                 | Thread and reply logic live in `context-reader.ts`, `brief.ts` and `thread-reply.ts`. The service only wires them        |
| Shared e2e ports with other clones' sessions (memory)                                                                                                         | The e2e tasks wait for a free run                                                                                                 | Never kill another clone's server                                                                                        |

## Touches

- **Packages:** contracts, core (new `integrations/slack/`, `integrations/discord/`, `sessions/thread-reply.ts`), api-client, ui (`source-mark.tsx`, `tokens.css`, `theme.css`), app (settings, home, sessions, tickets, notifications, sync-activity), and `apps/server/src/config.ts` with `.env.example` (`DEVHUB_DISCORD_BOT_TOKEN`).
- **Dependency:** `@slack/web-api` in `packages/core`, which `docs/architecture.md` already plans. Discord needs none (Q4).
- **e2e:** `e2e/fake-tools/` (Slack and Discord fakes), `e2e/connect-slack-and-discord.spec.ts`, `e2e/slack-fix-this.spec.ts`.
- **Docs:** `learn/connecting-slack-and-discord.md`, `docs/architecture.md`, `docs/design-map.md`, `docs/product/roadmap.md`, `.claude/skills/integration-adapter/SKILL.md`, and a script for `docs/product/spec.md` and `docs/design/design-system.md`.
- **Gates:** typecheck, lint, `boundaries`, `env-policy`, `secrets`, `style-policy`, `component-coverage`, `icon-buttons`, `design-source`, `test-policy`, `learn-freshness`, `specs`, and Storybook a11y.
