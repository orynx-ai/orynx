<!-- learn-sources: packages/contracts/src/inbox.ts packages/core/src/inbox/inbox-cache.ts packages/core/src/inbox/inbox-service.ts packages/core/src/inbox/inbox-schedule.ts packages/core/src/inbox/rules.ts packages/core/src/routes/inbox.ts packages/core/src/integrations/jira/map.ts packages/core/src/integrations/github/map.ts packages/app/src/features/home/inbox-words.ts packages/app/src/features/home/queries.ts packages/app/src/live-updates.tsx -->

# The inbox: how "Needs your attention" stays up to date

Spec 007 fills Home's list with the Jira tickets and pull requests waiting on you. Three ideas carry it: Home always reads from a cache on the laptop, the inbox rules apply when Home reads rather than when DevHub syncs, and the browser writes the words, because a wait has to move on each minute.

## The path

```
            every 2 min while a page is open, at start, on connect, on Refresh
                                   │
inbox-schedule.ts ──▶ inbox-service.sync()        one at a time; a second caller joins the first
                          │
          ┌───────────────┴────────────────┐      side by side
  jira connection.credentials()    github connection.credentials()
  jira client.assigned()           github client.inbox()             the only files that reach the network
  jira map.ts → records            github map.ts → records
          └───────────────┬────────────────┘
                          ▼
                  cache.db (inbox-cache.ts)        records, or the problem, per tool
                          │
                  publish inbox.changed
                          ▼
page ── GET /api/inbox ──▶ inbox-service.read()    cache + rules.ts + waiting sessions → rows
```

## The reads

- **Jira:** one `POST /rest/api/3/search/jql` for `assignee = currentUser() AND statusCategory != Done`, asking only for summary, status, type, priority, due date, created and `statuscategorychangedate`. When an issue is a bug, a second request reads the site's priority order, so "high priority" means the site's two highest, whatever they're called. Statuses are matched by category, never by name.
- **GitHub:** one GraphQL query through octokit with two searches: `user-review-requested:@me` (requests to you by name, not to your teams) and `author:@me`, both open, not draft, not archived. It brings each pull request's review-request events, the latest commit's check rollup and its review threads with only their last comment's author and time. A 200 with `errors` and some data (a repository behind single sign-on) keeps the data that came.
- `map.ts` turns each answer into records: titles and metadata only. A description or a comment's text is never asked for, and if a proxy sent one anyway, nothing copies it (`inbox/no-leaks.test.ts` checks the file).

## The cache

`<DEVHUB_HOME>/cache.db`, mode 0600, through better-sqlite3 and drizzle-orm. Three small tables: `records` (one JSON row per ticket or pull request, per tool), `tools` (the account the records belong to, when it last answered, and the last problem) and `meta` (when every connected tool last answered in the same sync, for "Synced 2 min ago").

- A good sync replaces the tool's records. A failed one keeps them and notes the problem, unless the account changed, in which case the old account's records go.
- A tool disconnected while its sync was on its way writes nothing: the service checks the saved account again before it writes.
- The schema version is `PRAGMA user_version`. A file that isn't a database, or that another version wrote, is deleted and made again; it's only a cache. `secure_delete` is on, so forgotten titles are overwritten in the file.
- better-sqlite3 is a native module. pnpm builds it on install (it's in `onlyBuiltDependencies`), from a prebuilt binary when one matches, or with the C++ toolchain when none does. `apps/server` lists it next to core, because the server bundle keeps npm packages external.

## Rules apply when Home reads

`GET /api/inbox` reads the cache, the saved inbox rules and the session store, and `rules.ts` makes the rows: one per ticket or pull request, with the most pressing reason (a waiting session, then failing checks, then unresolved comments, then the ticket's own reason), longest wait first. So turning a rule off in Settings changes Home at once, in every open tab, without asking Jira or GitHub again: `settings.changed` refreshes the inbox query too. A tool that isn't connected shows nothing, even if the cache still holds its rows.

## Why the browser writes the words

The server sends data: each row's reason (`review_requested`, `due` with a calendar day, …), when its wait started, and when each tool last synced. `inbox-words.ts` turns that into "Review requested · 2 d", "Due Mon", "Synced 2 min ago" and each tool's line, with the laptop's clock and calendar. A server-written "2 d" would be wrong a day later unless Home asked again. The words that never change with time, such as a signed-out gh's message from spec 004, come from the server as they are.

Waits read in minutes, hours and days ("12 min", "3 h", "9 d"), with a spoken form ("9 days") for screen readers.

## When it syncs

`inbox-schedule.ts` runs only when the host passes `autoSync: true` (`apps/server` does): once at start, every 2 minutes while a page has the event stream open (the event bus counts pages apart from the hub's own listeners), and at once when `status.changed` shows a tool newly connected. A tool that disconnects loses its rows from the cache. Left off, only Refresh (`POST /api/inbox/refresh`, which answers when the sync has ended) and Clear cache (`DELETE /api/inbox/cache`) sync, so no test reaches Jira or GitHub by surprise.

## Testing

- `map.ts`, `rules.ts` and `inbox-words.ts` are pure and tested with plain data; the words with a fixed local clock, in more than one time zone.
- The service, the schedule and the routes run against the real cache (in memory), the real connections and MSW standing in for Jira and GitHub. The schedule fakes only `setInterval`, so requests and promises run as they really do.
- `inbox/no-leaks.test.ts` runs a sync at trace level and reads `cache.db` back: no token anywhere, and no description or comment text in the cache.
