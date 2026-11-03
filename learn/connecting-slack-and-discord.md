<!-- learn-sources: packages/core/src/integrations/slack/client.ts packages/core/src/integrations/slack/connection.ts packages/core/src/integrations/discord/client.ts packages/core/src/integrations/discord/connection.ts packages/core/src/inbox/inbox-service.ts packages/core/src/sessions/thread-reply.ts packages/core/src/threads/thread-preview.ts packages/contracts/src/threads.ts -->

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
as you, Discord as your bot, as a Reply that pings nobody) and the session keeps where it went. Nothing else is ever
written to either tool.
