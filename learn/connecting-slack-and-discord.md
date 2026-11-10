<!-- learn-sources: packages/core/src/integrations/slack/client.ts packages/core/src/integrations/slack/connection.ts packages/core/src/integrations/discord/client.ts packages/core/src/integrations/discord/connection.ts packages/core/src/inbox/inbox-service.ts packages/core/src/sessions/thread-reply.ts packages/core/src/threads/thread-preview.ts packages/contracts/src/threads.ts packages/core/src/chat-answers/chat-answers.ts packages/core/src/chat-answers/reply.ts packages/core/src/chat-answers/words.ts -->

# Slack and Discord: who waits on your reply, threads as context, and the one reply

Spec 016 adds two chat tools beside Jira and GitHub. Each is an integration in the usual shape
(`packages/core/src/integrations/<tool>/`): `client.ts` is the only file that talks to the network, `map.ts` and
`rules.ts` are pure, `connection.ts` connects, checks and disconnects.

## Connecting

- **Slack** takes a user token (`xoxp-…`) from a Slack app the workspace admin approved. `client.check()` calls
  `auth.test` and compares the token's scopes (Slack's `X-OAuth-Scopes`) with `slackScopes` in contracts; a missing
  one names itself, and nothing is saved. `@slack/web-api` loads on first use, with no retries and 429s returned at
  once, and a silent logger.
- **Discord** takes a bot's token, because Discord forbids automating a person's account. There's no library: Node's
  `fetch` against REST v10. `check()` reads the bot, then the application: its owner is "you", its flags say whether
  Message Content is on. A team's application has no person as owner, so the connection answers `user_id_needed` (422)
  and the form asks for your user ID.
- Both keep the token in the keychain (accounts `slack` and `discord`), who and where in `settings.json`, and a status
  line: "Neha K. in Acme", "Orynx · 2 servers".

## Who waits on your reply

Each sync (every 2 minutes, with the others) asks `client.waiting()` for the last 7 days:

- **Slack**: one `search.messages` for `<@you>`, then each mention's thread (`conversations.replies`), and each DM's
  history (`users.conversations`, `conversations.history`). At most 100 of those reads a sync, half kept for DMs.
- **Discord**: one guild search a server for `mentions=you` (`202` while Discord indexes a server: Discord stays as it
  was), then each mention's channel after it.

`rules.ts` decides what waits: someone else's message naming you (never `@here`, groups or bots) with nothing of yours
after it. The cache keeps only the row: the first line (120 characters, mentions as names), who, where, when, the
link. The wait from Settings › Inbox rules (2 h by default) applies when Home reads, in `inbox/rules.ts`, so changing it
needs no sync. A message past the wait is told once as "Someone is waiting on your reply".

## A thread as Claude's context

A thread chip (`slack_thread`, `discord_thread`) names a thread by its ids. Pasting a message link asks
`GET /api/threads/preview` who started it and where; the + menu lists the inbox's messages; a row's + adds its own.
At Send, `context-reader.ts` reads the whole thread with the tool's token and `brief.ts` writes it oldest first, at most
200 messages and 40,000 characters, keeping the first and the latest.

## The one reply

Once a session's pull request is open and its context holds a thread, the Session screen offers "Tell the thread". Only
`POST /api/sessions/:id/thread-reply`, on Post reply, writes: `thread-reply.ts` posts to the first thread chip (Slack
as you, Discord as your bot, as a Reply that pings nobody) and the session keeps where it went.

## Claude's questions in a DM (spec 057)

With Settings › Notifications' "Answer Claude's questions from chat" on, `chat-answers.ts` sends each waiting call to
you, as the session service's `onChange` sees it arrive:

- **Discord**: the bot you connected opens its DM with your saved user ID (`openDm`, `sendDm`, `dmAfter`, over REST:
  a bot reads its own DMs without the gateway).
- **Slack**: a message your own token posts never notifies you, so Slack needs its bot's token too (`xoxb-`, with
  `chat:write`, `im:write` and `im:history`). Settings › Connections › Slack checks it with `auth.test`, a bot's token
  in your workspace, and keeps it in the keychain as `slack_bot`; `settings.json` keeps only its workspace.
- **What goes**: a call with one question goes with its choices numbered, and your reply answers it. Two or more
  questions, and any approval, only ping: they say to answer in Orynx and are never read, so nothing in chat ever
  allows a command (Q1).
- **Your reply**: every 15 seconds while a question waits, even with no Orynx page open, Orynx reads the thread (Slack)
  or the DM after its message (Discord, one cursor for every question there). Only your own user ID counts.
  `reply.ts` reads a number, several numbers, `skip` or any text (Other); a reply it can't take gets a line asking
  again. The answer goes through the Session screen's own `respond()` with `from`, which checks it against the question
  and lets only the first answer count, so the step says "You answered from Discord".
- **The ends**: the session's `answered` report, which now names its call, says whether you answered in Orynx (`by:
'you'`) or the session stopped, and Orynx says so in the thread. A send that fails marks the waiting step `unsent`.

These DMs and their short replies, and the one thread reply above, are all Orynx ever writes to either tool.
