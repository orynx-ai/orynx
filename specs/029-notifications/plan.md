# Plan: Notifications

Spec: `specs/029-notifications/spec.md` (approved 19 Oct 2026, every recommended answer)

## Order of work

1. **Contracts first**, so core, the client and the app share one shape: a notification (its kind and the facts the app words, never words of its own), the list answer with its unread and waiting counts, the read request, the notification settings with their defaults and change, the paths, and a `notifications.changed` event that carries nothing but its type. Builders go in `@devhub/contracts/testing`.
2. **Core, storage.** A `notifications` table joins `cache.db` (its version goes up, so an older file is made again, as the cache allows). It keeps the newest 200 and none older than 30 days, and Clear cache empties it with the rest.
3. **Core, what raises one.** Two pure functions, each tested alone: `sessionNotifications(before, after)` turns one session change into notifications (an approval asked or ended, finished, stopped, failed, the usage limit), and `inboxNotifications(before, after)` turns one tool's answered sync into notifications (a new review request, checks that started failing, a newly assigned ticket). The session service gets an `onChange(before, after)` hook in its one `change()` function, and the inbox service an `onSynced(tool, before, after)` hook in `keep()`, where the old records are still in the cache. The notification service holds the "first answered sync since Orynx started" rule (AC-21) and publishes `notifications.changed`.
4. **Core, settings.** A small service reads and saves `notifications` in `settings.json`, keeping keys it doesn't know, as the preferences service does. It has its own route and query, so the preferences' careful per-row rollback isn't touched.
5. **Core, routes.** `GET /api/notifications`, `POST /api/notifications/read` (some ids, or all), `GET`/`PATCH /api/notifications/settings`, wired in `create-server.ts`. Allow once reuses the existing `POST /api/sessions/:id/approvals/:approvalId`, so it goes through the same server check (Q3).
6. **API client.** Endpoints, `ApiClient` methods and `queryOptions`; `notifications.changed` and `settings.changed` refresh them in `live-updates.tsx`.
7. **UI parts**, before anything uses them: `Switch` (Radix Switch), `Slider` (native range), `NotificationBell`, `NotificationItem`, `NotificationPanel` (Radix Popover with its head, tabs, groups and foot) and `Toast` with its region, each with a story per state and a test, and a row in `docs/design-map.md`.
8. **App, the bell and panel.** The words (titles, details, times, Today and Earlier), the bell in the sidebar's foot (and on the rail, and beside Search under 768 px), the panel with its tabs, states, Mark all read, opening a notification, Allow once and Review, and the foot's switches.
9. **App, reaching you.** Pure `quiet.ts` (Do not disturb, quiet hours across midnight, approvals breaking through), `sounds.ts` (Web Audio: Knock, Chime, Ping), pop-ups mounted once in the shell, and desktop notifications with one tab chosen to sound and show them (Web Locks).
10. **App, Settings › Notifications**: the tab and page bar, then each of the four sections, then Send a test notification.
11. **E2e and the browser check**: the approval flow joins `e2e/approvals.spec.ts` (its hub already makes Claude ask), the tab joins `e2e/settings.spec.ts`; then every new view at 360 and 1280 px in both themes with `/api` faked. Last, the script for the people-owned files.

## Risks

| Risk                                                                      | How we will notice early                                                               | What we do                                                                                                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A restart or Clear cache floods the panel with the whole inbox            | `inboxNotifications` and service tests: first sync, after Clear cache, after reconnect | Notify only when the cache held records for the same connection and this run of Orynx already saw one answered sync of that tool                         |
| Approvals ended at shutdown or by Discard raise notices you caused        | `sessionNotifications` tests for Discard and closing                                   | Discard (a `discardedAt`) raises nothing; an ended approval only drops its buttons                                                                       |
| Two tabs both sound, or both raise the desktop notification               | A test with two fake lock holders                                                      | One tab holds the `orynx-notify` Web Lock and speaks for all; visible tabs hold an `orynx-visible-*` lock, which it reads with `navigator.locks.query()` |
| The cache's version bump empties Home on the first start after this lands | Inbox cache tests                                                                      | Expected: it's a cache. Home syncs at start, and the first sync raises nothing (AC-21)                                                                   |
| A notification's text reaches a log or an event                           | A no-leaks test like `sessions/no-leaks.test.ts`                                       | Events carry only their type; logs carry ids and counts                                                                                                  |
| jsdom has no `Notification`, `AudioContext` or `navigator.locks`          | The first app test that needs them                                                     | Small fakes of those browser APIs in the app's test setup (outside services, which honest-tests allows); real browsers in e2e                            |
| 028's Settings redesign conflicts with the new tab                        | Whichever merges second                                                                | Each addition to `tabs.ts`, `settings-screen.tsx` and `design-map.md` stays in its own lines; re-run the settings tests after merging                    |
| The panel opening upward is cut off in a short window                     | The browser check, with a 600 px-tall window too                                       | Radix's collision handling, and the list scrolls inside the panel with a height capped by the window                                                     |

## Touches

- Packages: contracts, core, api-client, ui, app, e2e. No new dependency (Radix Switch and Popover come in `radix-ui`).
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, icon-buttons, test-policy, secrets, specs; Storybook a11y; coverage at 90%.
- Skills to follow: `add-api-endpoint`, `server-state`, `client-state`, `add-ui-component`, `build-a-screen`, `clean-ui`, `forms`, `agent-runtime` (Allow once), `honest-tests`.
