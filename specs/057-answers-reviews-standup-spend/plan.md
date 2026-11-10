# Plan: Answer from anywhere, review comments, standup, read ahead and spend

Spec: `specs/057-answers-reviews-standup-spend/spec.md`

## Order of work

The five parts go in the spec's order, A to E. Each part runs contracts → core → api-client → app, so it can be reviewed and reverted on its own. A goes first because it carries the most risk: two new writes, a new token and the desktop bridge.

1. **A. Answer Claude's questions without opening Orynx**
   - **Contracts.** Settings › Notifications gains `chatAnswers` (`{ on, to: 'slack' | 'discord' | 'both' }`, off by default). The `answered` step gains `from`. The `waiting` step gains `unsent`, the service a send failed on. Slack's connection gains `bot`. Each addition is optional or has a default, so nothing saved before this spec needs a migration.
   - **Pure core first.**
     - `chat-answers/reply.ts` reads a reply against the waiting question: a number, several numbers, `skip`, or text for Other.
     - `chat-answers/words.ts` writes every message Orynx sends.
     - Both are tested with plain data.
   - **The clients.**
     - Discord opens a DM, sends to it and reads it, over REST.
     - Slack's bot does the same through `@slack/web-api`.
     - The bot token is a keychain item of its own (`slack_bot`) and is checked with `auth.test` before it's saved.
     - Both are tested with MSW (`test/fake-discord.ts`, `test/fake-slack.ts`).
   - **The service** (`chat-answers/chat-answers.ts`).
     - It listens for `asked` reports, sends one message per channel the row turns on, and checks each sent thread every 15 seconds with its own timer, not the inbox's.
     - It feeds the first good reply to `SessionService.respond(…, from)`, which the session service already guards with first-answer-wins.
     - It's tested over the real session service, with MSW for Slack and Discord and a fake clock.
   - **The desktop channel.**
     - The hub posts the question to Electron over the utility process's port (the same bridge spec 045's updates use). Electron shows a macOS notification with `hasReply` and posts the reply back. The window still gets no preload.
     - Status says `desktopReplies`, so the page leaves questions out of its own desktop notifications instead of raising a second one.
   - **App.** The Notifications row, the Slack bot token field, the step's words and the waiting step's failure line.
   - **e2e.** One test through the fake Discord in the tools hub's preload.
2. **B. Review comments in the diff**
   - **The read.** The GitHub client reads a thread's `diffSide`, `isOutdated`, `url`, every comment and their times. Spec 049's draft keeps reading the last comment.
   - **The route.** `GET /api/sessions/:id/review-threads` reads the threads live.
     - It marks a thread `placeable` when it isn't outdated and its file has no changes since the last push: `git diff --name-only` against the pushed head, read-only git.
     - The app places a note only where a placeable thread lands on a line the diff draws.
   - **Live updates.** An inbox sync that sees the session's pull request change publishes `session.changed`, which the app already maps to a refetch.
   - **App.** The tab first, then the notes in the diff.
3. **C. Standup draft**
   - **Two new reads.** GitHub's search for your PRs merged on a day, and Jira's `status CHANGED BY currentUser() DURING (…)`. Each one is its client's own request, tested with MSW.
   - **Pure functions.** `lastWorkingDay()` and `standupText()` work on plain facts.
   - **The service.** It gathers the facts from sessions, GitHub, Jira and the current sprint. A failed source becomes a `missing` entry instead of an error.
   - **`GET /api/standup`**, then the chip and the dialog.
4. **D. Review requests read ahead**
   - **Contracts.** The `readReviewsAhead` preference, and the inbox row's `readAhead`.
   - **The queue.** A pure function decides what starts next: one at a time, fewer than 2 working, 5 a day, oldest first. It's tested on its own.
   - **The service.**
     - It's wired to `onSynced`, as notifications and `watchPulls()` are.
     - It starts each review through `SessionService.start()` with `readAhead: true`, so the session can be told apart.
     - It pumps the queue again when a session ends and when the setting changes.
   - **App.** The Settings row, then Home's pills, where Review opens the session already reading.
5. **E. Spend and limit warnings**
   - **Contracts.** `SessionSummary` gains `costUsd` and `startedAt`. Status gains `agents.claude.limit`. Notifications gain the `limit_near` kind.
   - **Core.**
     - Cost keeps the larger total, so it never goes down.
     - The summary carries the cost.
     - `sdk-messages.ts` reads `rate_limit_event` as an adapter `limit` event.
     - `limits/limit-watch.ts` holds the warning, clears it at `resetsAt` or on `allowed`, publishes `status.changed`, and raises one notification per window.
   - **`@devhub/ui`.** `SessionItem` gains an optional `detail` slot for the cost, with a story and a test. It's the only change to the design system, and it adds a slot, not a new component (Q8a).
   - **App.** The cost on rows, the tiles, then the callout on Home and the Sessions page.
6. **Docs, then `/review`.**
   - Learn pages: `notifications.md`, `connecting-slack-and-discord.md`, `sessions-and-worktrees.md`, `desktop-app.md`.
   - The integration-adapter skill's "What DevHub may write" table gains the DMs.
   - The agent-runtime skill gains answers from outside Orynx and read ahead.

## Risks

| Risk                                                                                             | How we will notice early                                                                                                                                                       | What we do                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A chat reply from someone else, or a forged one, answers Claude                                  | Task 7's tests: a reply from another user ID, an edited message, a reply in another DM                                                                                         | Only messages whose author is the saved user ID, in the DM Orynx opened, after Orynx's message. The answer still goes through `respond()`'s check against the question (`questionAnswers`), so a label Claude never offered can't get through |
| An approval gets allowed from chat by mistake (rule 11)                                          | Task 7: replying "allow" or "1" to an approval's ping changes nothing                                                                                                          | Pings are only sent, never read. The service passes only `decision: 'answer'` or a question's `deny` (Skip) to `respond()`, which already refuses both for anything but a question (`not_offered`)                                            |
| A token reaches a log or an error                                                                | The leak tests: `integrations/slack/no-token-leaks.test.ts` gains the bot token, and Discord's gains the DM calls                                                              | Bot token only through `app.tokens`, and only in `client.ts` headers                                                                                                                                                                          |
| The 15 s check runs forever or piles up                                                          | Task 7: with a fake clock, checking stops on answer, Skip, Stop, Discard and Orynx closing; one timer per question                                                             | One timer per sent question, cleared in one place; `close()` clears them all                                                                                                                                                                  |
| Discord or Slack rate limits (429)                                                               | Task 3 and 4 tests                                                                                                                                                             | Wait for `resetAt` and skip that tick; the question waits in Orynx regardless (AC-13)                                                                                                                                                         |
| The bot can't read its DMs without the gateway, or Slack's self-DM claim is wrong                | Task 3 and 4 read Discord's and Slack's docs for `GET /channels/{id}/messages` with a bot token and `conversations.replies` with `im:history`; the spec's last note flags both | If Discord needs the gateway, stop and ask (a gateway is a new dependency)                                                                                                                                                                    |
| Electron's `hasReply` is macOS only, and the hub can't know if the window shows it               | Task 9's test on `process.platform`                                                                                                                                            | The hub sends desktop questions only when the parent port exists and the app said it's on macOS at start; else nothing changes                                                                                                                |
| The native notification ignores Do not disturb, quiet hours or the desktop switch                | Task 8's test: each one off stops the native notification                                                                                                                      | Move the page's pure "should this alert" rule from `app/features/notifications/alerts.ts` into `@devhub/contracts` so the hub and the page share one rule                                                                                     |
| Thread lines don't match the worktree (spec 031's Build on your own PR starts at the PR head)    | Task 17's tests on a real temp repo: an unpushed edit, an outdated thread, a file Claude never touched                                                                         | Never place a thread that isn't `placeable` and drawn on that side; every thread is always in the tab                                                                                                                                         |
| Jira's JQL `CHANGED BY … DURING` isn't allowed on some sites, or returns only the current status | Task 23's MSW test and the spec's Assumptions                                                                                                                                  | Show the issue's current status ("Moved PROJ-1419 to In Review"); a refused search is `missing: ['jira']`, never an error                                                                                                                     |
| Read ahead starts sessions with no click (rule 11)                                               | Task 30's tests and `/review`'s security-auditor                                                                                                                               | Only with the row on; only spec 050's read-only review; posting stays the Post dialog. The agent-runtime skill says so                                                                                                                        |
| Read ahead takes the slot you need                                                               | Task 29: never with 2 or more working                                                                                                                                          | The limit is checked again right before each start                                                                                                                                                                                            |
| The 5-a-day count resets on restart                                                              | Accepted                                                                                                                                                                       | Count from the sessions themselves (review sessions with `readAhead: true` started today), so a restart counts them again. No new storage                                                                                                     |
| `rate_limit_event`'s `utilization` scale (0–1 or 0–100) isn't documented                         | Task 35: read the shipped Claude Code bundle for how it fills `utilization` before writing the reader                                                                          | Turn it into a whole percent in one place; if it's unclear, stop and ask                                                                                                                                                                      |
| 056 (settings revamp) changes the same Settings panels                                           | `git fetch` before each Settings task                                                                                                                                          | Rebase when 056 merges                                                                                                                                                                                                                        |
| The e2e ports are shared with other clones                                                       | The `shared-e2e-ports` memory                                                                                                                                                  | Wait, never kill                                                                                                                                                                                                                              |

## Touches

- Packages: contracts, core, api-client, ui (`SessionItem`'s `detail` slot), app, apps/server (the desktop bridge), apps/desktop (the macOS notification), e2e, learn
- Gates that check this work: typecheck, lint, test-policy, style-policy, component-coverage, icon-buttons, design-source, boundaries, env-policy, secrets, specs, learn-freshness, handbook-size
- Skills to follow: `.claude/skills/integration-adapter/SKILL.md`, `agent-runtime`, `add-api-endpoint`, `server-state`, `forms`, `honest-tests`, `build-a-screen`, `clean-ui`, `add-ui-component`
