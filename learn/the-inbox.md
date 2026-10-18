<!-- learn-sources: packages/contracts/src/inbox.ts packages/core/src/inbox/inbox-cache.ts packages/core/src/inbox/inbox-service.ts packages/core/src/inbox/inbox-schedule.ts packages/core/src/inbox/rules.ts packages/core/src/sessions/ticket-sessions.ts packages/core/src/routes/inbox.ts packages/core/src/integrations/jira/map.ts packages/core/src/integrations/github/map.ts packages/app/src/features/home/inbox-words.ts packages/app/src/features/home/queries.ts packages/app/src/features/home/components/attention-panel.tsx packages/app/src/features/home/components/sync-status.tsx packages/app/src/features/home/inbox-view.ts packages/app/src/features/home/components/inbox-toolbar.tsx packages/app/src/live-updates.tsx e2e/fake-tools/preload.ts -->

# The inbox: how "Needs your attention" stays up to date

Spec 007 fills Home's list with the Jira tickets and pull requests waiting on you. Three ideas carry it: Home always reads from a cache on the laptop, the inbox rules apply when Home reads rather than when DevHub syncs, and the browser writes the words, because a wait has to move on each minute.

## The path

```
            every 2 min while a page is open, at start, on connect, on Refresh
                                   │
inbox-schedule.ts ──▶ inbox-service.sync()        one at a time; a second caller joins the first
                          │
          ┌───────────────┬───────────────┴────────────────┐      side by side
  jira connection.credentials()   (the sprint, spec 008)  github connection.credentials()
  jira client.assigned()          tickets-service.sync()  github client.inbox()      the only files that reach the network
  jira map.ts → records           sprint-map.ts → record  github map.ts → records
          └───────────────┴───────────────┬────────────────┘
                          ▼
                  cache.db (inbox-cache.ts)        records, or the problem, per tool
                          │
                  publish inbox.changed
                          ▼
page ── GET /api/inbox ──▶ inbox-service.read()    cache + rules.ts + waiting sessions → rows
```

## The reads

Tickets' sprint (spec 008) starts with each sync, beside these two but on its own: Home's rows, its "Synced" time and Refresh never wait for it, and it publishes its own `inbox.changed` when it ends. A sync while it's still on its way asks for one more pass after it, like `syncAfterChange()`. It has its own part of the cache (`jira_sprint`) with its own last sync and problem, so a failed sprint read never changes Home's lines, and anything the sprint throws goes to the terminal, not into Home's sync. `idle()` waits for it too. Its reads are in `learn/the-tickets-board.md`.

- **Jira:** one `POST /rest/api/3/search/jql` for `assignee = currentUser() AND statusCategory != Done ORDER BY created ASC` (oldest first, so the 100 kept are the ones that waited longest), asking only for summary, status, type, priority, due date, created and `statuscategorychangedate`. Each issue is checked on its own, so one odd issue is left out instead of failing the read, and a key Jira sends twice is kept once. When an issue is a bug, a second request reads the site's priority order, so "high priority" means the site's two highest, whatever they're called. Statuses are matched by category, never by name.
- **GitHub:** one GraphQL query through octokit with two searches: `user-review-requested:@me` (requests to you by name, not to your teams) and `author:@me`, both open, not draft, not archived. It brings each pull request's review-request events, the latest commit's check rollup and its first 20 review threads with only their last comment's author and time. A 200 with `errors` and some data (a repository behind single sign-on) keeps the data that came.
- **GitHub's points.** GitHub prices a query by the most nodes it could return, multiplying each connection's limit by the ones above it. With 100 + 100 pull requests, 100 × 100 check contexts and 100 × 20 threads with their last comment, a sync costs about 24 of the account's 5,000 points an hour; at one sync every 2 minutes that's about 720, shared with gh and other tools on the same account. 100 threads per pull request would have cost about 104 points a sync (spec 007 review). The sum sits next to the query in `client.ts`; redo it before raising a limit.
- `map.ts` turns each answer into records: titles and metadata only. A description or a comment's text is never asked for, and if a proxy sent one anyway, nothing copies it (`inbox/no-leaks.test.ts` checks the file).
- Every open pull request the GitHub read brings is kept, yours with green checks too, with when it opened (spec 009, Q1c). The rules decide which ones need you, so Home doesn't change, and ⌘K search finds the rest. `InboxService.records()` hands search each connected tool's records with no rules applied, and `read()` builds Home's rows on the same call (see `learn/search.md`).

## The cache

`<DEVHUB_HOME>/cache.db`, mode 0600, through better-sqlite3 and drizzle-orm. Three small tables: `records` (one JSON row per ticket or pull request, per tool), `tools` (the account the records belong to, when it last answered, and the last problem) and `meta` (when every connected tool last answered in the same sync, for "Synced 2 min ago").

- A good sync replaces the tool's records. A failed one keeps them and notes the problem, unless the account changed, in which case the old account's records go.
- A tool disconnected while its sync was on its way writes nothing: the service checks the saved account again before it writes.
- Disconnecting Jira forgets the sprint as well as Jira's rows, and Clear cache empties every part. The tables are shared by part name (`InboxTool`, or `jira_sprint` for Tickets), so adding the sprint changed no table and kept the version.
- The schema version is `PRAGMA user_version`. A file that isn't a database, that another version wrote, or whose pages fail `PRAGMA quick_check` is deleted and made again when it opens; it's only a cache. If SQLite reports a damaged file while DevHub runs (`SQLITE_CORRUPT`, `SQLITE_NOTADB`), the call makes the file again and runs once more, so Home and Clear cache never stay stuck. Something other than a file at the path (a folder, say) is never deleted: the cache lives in memory for that run, and the terminal says so. `secure_delete` is on, so forgotten titles are overwritten in the file.
- better-sqlite3 is a native module. pnpm builds it on install (it's in `onlyBuiltDependencies`), from a prebuilt binary when one matches, or with the C++ toolchain when none does. `apps/server` lists it next to core, because the server bundle keeps npm packages external.

## Rules apply when Home reads

`GET /api/inbox` reads the cache, the saved inbox rules and the session store, and `rules.ts` makes the rows: one per ticket or pull request, with the most pressing reason (a waiting session, then failing checks, then unresolved comments, then the ticket's own reason), longest wait first. An issue row whose ticket has a live session (the newest on the ticket, unless it was stopped, by `sessions/ticket-sessions.ts`, the rule Tickets and search use) points at that session instead of Jira (spec 011). So turning a rule off in Settings changes Home at once, in every open tab, without asking Jira or GitHub again: `settings.changed` refreshes the inbox query too, as `sessions.changed` does when a session starts or changes its state. A session's steps (`session.changed`) leave Home alone. A tool that isn't connected shows nothing, even if the cache still holds its rows.

## Why the browser writes the words

The server sends data: each row's reason (`review_requested`, `due` with a calendar day, …), when its wait started, and when each tool last synced. `inbox-words.ts` turns that into "Review requested · 2 d", "Due Mon", "Synced 2 min ago" and each tool's line, with the laptop's clock and calendar. The calendar helpers and each tool's line live in `packages/app/src/words/` since spec 008, so Tickets writes dates and Jira's problems the same way; `inbox-words.ts` re-exports `toolLine` and `waitText` for Home. A server-written "2 d" would be wrong a day later unless Home asked again. The words that never change with time, such as a signed-out gh's message from spec 004, come from the server as they are.

Waits read in minutes, hours and days ("12 min", "3 h", "9 d"), with a spoken form ("9 days") for screen readers.

## On Home

- **The panel** (`attention-panel.tsx`) draws the rows with 006's `AttentionRow`. A tab whose tools are all on their first sync shows five loading rows and no count.
- **The row's action** comes from `actionLabel()` in `inbox-words.ts` (spec 011). A review request says "Review". An assigned issue with no live session says "Build": it's `BuildWithClaude`, which starts Claude on the ticket in a worktree and opens the session, or says why it can't (`learn/sessions-and-worktrees.md`). The rest say "Open", including an issue with a live session, which opens that session. Failing checks keep "Open" until "Fix" comes in spec 020.
- **Search, filters, order and pages** (the amendment of 17 Oct 2026) all happen in the browser, on the rows the page already has (at most 300), so the server never hears of them. `inbox-view.ts` holds them as pure functions: the address in and out, matching (every word typed, across title, key, number, repository, author and status, through `words/match-words.ts`, which ⌘K search shares), filtering (any tick within a menu, every menu together), the newest or longest wait first, and pages of 16. Everything lives in the address next to the tab (`q`, `reason`, `project`, `status`, `repo` as comma lists, `sort=longest`, `page`), leaving out defaults, so a reload or a shared link shows the same list. Switching tabs keeps the search and the order and drops the filters, which belong to their tab; any change goes back to page 1, and a page past the end after a sync shows the last one. On screen the filters are plain pickers beside the search box, each with a filled count of its ticks, and the order picker sits at the far end of the panel's head, across from "Needs your attention" (the Orynx look, 18 Oct 2026).
- **The search box** (`inbox-toolbar.tsx`) is a react-hook-form field rather than one driven by the address: the router applies an address change in a transition, so an input bound to it could lose keys. It writes to the address as you type (replacing, so Back skips the keystrokes) and follows the address only when it isn't focused (Back, or Clear search and filters).
- **The tab counts** stay the totals: search and filters narrow the list, not what needs you. The sidebar's count is the total too. While a tab loads, a blank bubble holds its count's room, so the tabs don't move when the numbers come.
- **The query client ignores the browser's online state** (`networkMode: 'always'` in `createQueryClient`): every request goes to the hub on this computer, so a dropped Wi-Fi must not pause the refetch after a sync, or Refresh.
- **Rows with no mark.** A Claude session on neither a ticket nor a pull request has no tool to draw. Spec 011 starts sessions only from a ticket, so none exists yet, and `queries.ts` leaves such rows out of Home and the sidebar count alike, until a spec asks for a mark.
- **A clock that ticks once a minute** (`use-now.ts`) moves the waits and "Synced 2 min ago" on, with no request.
- **Refresh** (`sync-status.tsx`) stays busy until the new list is in, not just until the sync ends, so the line reads "Synced just now" the moment its arrow stops. The arrow is Hugeicons' `Rotate01Icon` through `<Icon>`, like every icon since 18 Oct 2026, and it spins only under `motion-safe:`.
- **Paging** moves focus to the new page's first title and scrolls the list's top under the page bar, but only when the pager was used; Back leaves focus alone.
- **Focus when rows change.** Rows are keyed by id, so a row that stays keeps its elements and focus on it never moves. When the focused row goes, the panel moves focus to the next row's title, the row before it when it was the last, or the selected tab when none is left. It remembers which row holds focus and forgets it when focus leaves for somewhere else, so a sync never pulls focus back from the page bar.

## When it syncs

`inbox-schedule.ts` runs only when the host passes `autoSync: true` (`apps/server` does): once at start, every 2 minutes while a page has the event stream open (the event bus counts pages apart from the hub's own listeners), and at once when `status.changed` shows a tool newly connected. Claude's login check (spec 010) publishes `status.changed` too, but changes no saved connection, so it starts no sync; the page only reads the cache again. It compares the saved connections one change at a time, in order. A tool that disconnects loses its rows from the cache, and any sync also forgets rows a disconnected tool left behind.

With `autoSync` left off, only Refresh (`POST /api/inbox/refresh`, which answers when the sync has ended) and Clear cache (`DELETE /api/inbox/cache`) sync, so no test reaches Jira or GitHub by surprise.

- **Joining and following.** Refresh joins a sync that's already running. A connect or Clear cache can't: the running sync read the old state, so `syncAfterChange()` asks for one more pass after it.
- **A sync that breaks in DevHub** (a cache it can't write, say; `inbox/tool-state.ts`, shared with Tickets) shows that tool as failed with the server's own line, "Something went wrong in the local server. See the terminal for details.", instead of "Syncing" forever. Its next normal sync clears it.
- **Closing.** One `onClose` hook stops the schedule, waits for the running sync (`inbox.idle()`), then closes the cache, so no sync writes to a closed file.
- **An account change on GitHub's token way** keeps the way (`token`), so the schedule sees no change; the new account's rows replace the old ones at the next sync. Keying the cache by login is left for later.

## Testing

- `map.ts`, `rules.ts` and `inbox-words.ts` are pure and tested with plain data; the words with a clock built from local dates, so they read the same in any time zone the tests run in.
- The service, the schedule and the routes run against the real cache (in memory), the real connections and MSW standing in for Jira and GitHub. The schedule fakes only `setInterval`, so requests and promises run as they really do.
- `e2e/home-inbox.spec.ts` runs the real hub with Jira and GitHub faked inside its process: `e2e/fake-tools/preload.ts` loads ahead of `apps/server/dist/main.mjs` with the same MSW answers core's tests use, fails any other request out (through a callback: MSW's own `error` setting still lets requests that look like static files through), and takes what the tools hold over `PUT /tools` on the port below its hub's (`controlPortFor`), answering only requests addressed to `127.0.0.1`. So Home's hub and spec 011's sessions hub (port 4396) run side by side, each with its own fakes. The fake Jira also answers a session's read of one issue, and a `sprint` switch puts the issues in Sprint 42 for a spec that needs a board. The spec connects both through Settings, then starts each sync with `POST /api/inbox/refresh` from the page, so focus and scroll stay where the test put them.
- `inbox/no-leaks.test.ts` runs a good sync and failed ones (a refused token whose error body names it, a GraphQL error, a locked keychain) at trace level, and reads the log, the answer and `cache.db` back: no token or error body anywhere, and no description or comment text in the cache.
