# Plan: Sync activity

Spec: `specs/035-sync-activity/spec.md`

## Order of work

1. **Contracts.** `sync-activity.ts` holds the run, the change, the tool summary and the query. `routes.ts` gets the path, and the refresh request gets an optional `tool`. Everything else is typed from these.
2. **The log in the cache.** `cache.db` gets a `syncs` table, added by a 2 → 3 upgrade that keeps the other tables. It gets writes with 30-day retention, reads for the newest 100 matching runs and the per-tool figures, and Clear cache empties it. This is tested on its own against a real SQLite file.
3. **What changed.** A pure function compares a tool's records before and after a sync: new, updated, removed, the first 50 kept and the rest counted. It is tested alone, with no service.
4. **The inbox service writes the log and syncs one tool.** Each tool's part of a sync writes one row: answered, failed, or thrown in Orynx. `sync(tool?)` runs only the tools asked for. A pending set replaces the single `again` flag, so a whole sync asked during a one-tool sync still runs. Only a pass over every tool moves Home's "Synced" time. The sprint pass runs only when Jira is in the pass.
5. **The route.** `GET /api/sync-activity` returns the summaries and runs. `POST /api/inbox/refresh` takes `{ tool }`. The service builds the summaries from the cache and the inbox's tool states; the route holds no logic.
6. **The api-client.** `syncActivity(query)` and `refreshInbox(tool?)`. The query key sits under `['inbox']`, so the `inbox.changed` that ends every sync, and Refresh's own invalidation, refresh the modal with no new event.
7. **The `@devhub/ui` parts (Q2, Q4).** `Dialog size="wide"`, `StatusDot`, `StatTiles`, `HistoryRow` (Radix Collapsible from `radix-ui`, already a dependency), and `ListNavItem`'s `mark` and `status` with `ListNavGroup`. Each comes with stories, tests and its `design-map.md` row. They don't depend on the server, so they could come earlier, but the app needs them only from step 8.
8. **The app.** In order: words (Q3), then the dialog's list and detail, then the history with its actions, then the Home button and Connections' `tool` parameter. Each is tested with MSW against the real components.
9. **e2e and the people-files script.** One e2e file proves the modal end to end at 1280 and 360 px, in both themes, with axe and the keyboard. The script copies the design into `docs/design/screens/sync-activity/` and adds the new parts to `design-system.md`, for the user to run.

## Risks

| Risk                                                                                        | How we will notice early                                                                                | What we do                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| The 2 → 3 upgrade drops a user's inbox and notifications, or a damaged file loops           | Task 2's test opens a real version-2 file with rows and checks that they're all still there             | Upgrade in one transaction, then run the `quick_check` the cache already does. Anything else still goes through today's delete-and-remake |
| One-tool syncs race the single-flight sync: a whole sync is swallowed, or a pass runs twice | Task 4's tests start a Jira sync, ask for a whole sync while it runs, and count the client calls        | A pending set of tools, drained pass by pass. Nothing new joins a pass that has already started                                           |
| "Updated" fires on every sync because a record field changes each time                      | Task 3 compares records from the real `jiraRecords`/`githubRecords` mappers, twice over the same answer | Compare only what the item shows: ref, title, status or reason fields. Not the timestamps                                                 |
| "Changes today" depends on the time zone                                                    | Task 5's tests pin the clock, and pass the zone's midnight in from `now`                                | The server takes local midnight from its own clock. The browser is on the same computer                                                   |
| The log grows: about 43,000 rows a month with two tools                                     | Task 2 writes 31 days of rows and checks that the old ones go                                           | An index on `(tool, started_at)`, and deletion on each write. Reads are capped at 100                                                     |
| The 1100 px dialog breaks narrow windows or other dialogs                                   | The `Dialog` stories at 360 px, and the e2e at 360 px                                                   | `wide` is opt-in. Under 768 px it has the same gutter as every dialog, and the body stacks                                                |
| A token or response body reaches the log                                                    | `no-leaks.test.ts` gets a sync-log case                                                                 | The log only ever takes the problem kind and the record's ref, title and link                                                             |

## Touches

- Packages: contracts, core, api-client, ui, app (plus `e2e/` and the spec folder's script)
- Gates that check this work: boundaries, style-policy, component-coverage, icon-buttons, test-policy, secrets, specs, design-source (no new screen file; the dialog gets a `Design:` comment anyway)
- Skills to follow: `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/add-ui-component/SKILL.md`, `.claude/skills/build-a-screen/SKILL.md`, `.claude/skills/clean-ui/SKILL.md`, `.claude/skills/server-state/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`
