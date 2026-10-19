# Tasks: Notifications

One task is one commit. Test first, then code. Tick a task only when its Check passes. Per `/build`, a task runs its Check, one `pnpm typecheck` and the gates its change needs; `/review` runs `pnpm verify` and the e2e suite.

**Contracts and core**

- [x] Task 1: Notification contracts: kinds and their facts, the list answer, the read request, settings with defaults and change, sounds, paths, `notifications.changed`, builders (AC-18, AC-19, AC-22, AC-47)
      Check: pnpm test packages/contracts/src/notifications.test.ts
      Files: packages/contracts/src/notifications.ts, packages/contracts/src/notifications.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/events.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [x] Task 2: A `notifications` table in `cache.db`: add, list newest first, mark read, mark all read, end an approval; newest 200, 30 days; Clear cache empties it (AC-13, AC-18)
      Check: pnpm test packages/core/src/inbox/inbox-cache.test.ts
      Files: packages/core/src/inbox/inbox-cache.ts, packages/core/src/inbox/inbox-cache.test.ts
- [x] Task 3: `sessionNotifications(before, after)`: approval asked (command, edit, push, pull request) and ended, finished, stopped, failed, usage limit; nothing for Discard (AC-12, AC-19, AC-20)
      Check: pnpm test packages/core/src/notifications/session-notifications.test.ts
      Files: packages/core/src/notifications/session-notifications.ts, packages/core/src/notifications/session-notifications.test.ts
- [x] Task 4: `githubNotifications` and `jiraNotifications`: new review requests, checks that started failing on my pull requests, newly assigned tickets (AC-22)
      Check: pnpm test packages/core/src/notifications/inbox-notifications.test.ts
      Files: packages/core/src/notifications/inbox-notifications.ts, packages/core/src/notifications/inbox-notifications.test.ts
- [x] Task 5: The notification service: list with counts, read, read all, session and inbox hooks, the first-sync rule, `notifications.changed`; hooks in the session and inbox services (AC-9, AC-12, AC-13, AC-19, AC-21, AC-22)
      Check: pnpm test packages/core/src/notifications/notification-service.test.ts packages/core/src/inbox/inbox-service.test.ts packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/notifications/notification-service.ts, packages/core/src/notifications/notification-service.test.ts, packages/core/src/inbox/inbox-service.ts, packages/core/src/sessions/session-service.ts
- [x] Task 6: The notification settings service: read with defaults, save one change, keep unknown keys, `settings.changed` (AC-39, AC-41, AC-44)
      Check: pnpm test packages/core/src/notifications/notification-settings.test.ts
      Files: packages/core/src/notifications/notification-settings.ts, packages/core/src/notifications/notification-settings.test.ts, packages/core/src/settings/settings-store.ts
- [x] Task 7: Routes: `GET /api/notifications`, `POST /api/notifications/read`, `GET`/`PATCH /api/notifications/settings`, wired in the server; Clear cache empties the list; ids only in logs and events (AC-7, AC-13, AC-47)
      Check: pnpm test packages/core/src/routes/notifications.test.ts packages/core/src/sessions/no-leaks.test.ts (a session's approval now raises a notification, and its command still reaches no log or event)
      Files: packages/core/src/routes/notifications.ts, packages/core/src/routes/notifications.test.ts, packages/core/src/create-server.ts, packages/core/src/inbox/inbox-service.ts

**API client**

- [x] Task 8: API client for notifications and their settings; `notifications.changed` and `settings.changed` refresh them (AC-13, AC-44; the refresh is proven by task 15's two-tab test and task 22's)
      Check: pnpm test packages/api-client/src/notifications.test.ts
      Files: packages/api-client/src/endpoints/notifications.ts, packages/api-client/src/notifications.test.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/index.ts, packages/app/src/live-updates.tsx

**UI parts**

- [x] Task 9: `Switch` and `Slider` in `@devhub/ui` (AC-17, AC-33, AC-36, AC-37)
      Check: pnpm test packages/ui/src/components/switch.test.tsx packages/ui/src/components/slider.test.tsx
      Files: packages/ui/src/components/switch.tsx, packages/ui/src/components/switch.stories.tsx, packages/ui/src/components/switch.test.tsx, packages/ui/src/components/slider.tsx, packages/ui/src/components/slider.stories.tsx, packages/ui/src/components/slider.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 10: `NotificationBell` (the count, 99+) and `NotificationItem` (icon tone, title, detail, time, unread dot, buttons) (AC-1, AC-2, AC-4, AC-9, AC-11)
      Check: pnpm test packages/ui/src/components/notification-bell.test.tsx packages/ui/src/components/notification-item.test.tsx
      Files: packages/ui/src/components/notification-bell.tsx, packages/ui/src/components/notification-bell.stories.tsx, packages/ui/src/components/notification-bell.test.tsx, packages/ui/src/components/notification-item.tsx, packages/ui/src/components/notification-item.stories.tsx, packages/ui/src/components/notification-item.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 11: `NotificationPanel`: the popover with its head, tabs, groups, foot, skeleton, empty and error lines (AC-4, AC-5, AC-6, AC-14, AC-15, AC-16)
      Check: pnpm test packages/ui/src/components/notification-panel.test.tsx
      Files: packages/ui/src/components/notification-panel.tsx, packages/ui/src/components/notification-panel.stories.tsx, packages/ui/src/components/notification-panel.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 12: `Toast` and `ToastRegion`: the card, alert or status, bottom-right, at most three (AC-23, AC-24, AC-25)
      Check: pnpm test packages/ui/src/components/toast.test.tsx
      Files: packages/ui/src/components/toast.tsx, packages/ui/src/components/toast.stories.tsx, packages/ui/src/components/toast.test.tsx, packages/ui/src/index.ts, docs/design-map.md

**App: the bell and the panel**

- [x] Task 13: Notification words: titles, details, times, Today and Earlier, where each opens (AC-19, AC-20, AC-22)
      Check: pnpm test packages/app/src/features/notifications/words.test.ts
      Files: packages/app/src/features/notifications/words.ts, packages/app/src/features/notifications/words.test.ts
- [x] Task 14: The bell at the bottom of the sidebar, on the rail and beside Search under 768 px, with the unread count (AC-1, AC-2, AC-3)
      Check: pnpm test packages/app/src/shell/sidebar-footer.test.tsx packages/app/src/shell/sidebar.test.tsx packages/app/src/features/notifications/components/notification-centre.test.tsx
      Files: packages/app/src/features/notifications/queries.ts, packages/app/src/features/notifications/components/notification-centre.tsx, packages/app/src/features/notifications/components/notification-centre.test.tsx, packages/app/src/shell/sidebar-footer.tsx, packages/app/src/shell/sidebar.tsx
- [x] Task 15: The panel: tabs, groups, opening a notification marks it read, Mark all read, loading, empty and error (AC-4, AC-5, AC-6, AC-7, AC-8, AC-13, AC-14, AC-15, AC-16)
      Check: pnpm test packages/app/src/features/notifications/components/notification-centre.test.tsx
      Files: packages/app/src/features/notifications/components/notification-centre.tsx, packages/app/src/features/notifications/components/notification-centre.test.tsx, packages/app/src/features/notifications/queries.ts
- [x] Task 16: Allow once and Review in the panel; an answered approval drops its buttons (AC-9, AC-10, AC-11, AC-12)
      Check: pnpm test packages/app/src/features/notifications/components/notification-actions.test.tsx
      Files: packages/app/src/features/notifications/components/notification-actions.tsx, packages/app/src/features/notifications/components/notification-actions.test.tsx, packages/app/src/features/notifications/components/notification-centre.tsx
- [ ] Task 17: The panel's foot: Do not disturb and Sounds switches, All settings and the gear (AC-17)
      Check: pnpm test packages/app/src/features/notifications/components/notification-centre.test.tsx
      Files: packages/app/src/features/notifications/components/notification-centre.tsx, packages/app/src/features/notifications/components/notification-centre.test.tsx, packages/app/src/features/notifications/queries.ts

**App: reaching you**

- [ ] Task 18: `quiet.ts`: Do not disturb and its end, quiet hours across midnight on the chosen days, approvals breaking through (AC-29, AC-30, AC-31)
      Check: pnpm test packages/app/src/features/notifications/quiet.test.ts
      Files: packages/app/src/features/notifications/quiet.ts, packages/app/src/features/notifications/quiet.test.ts
- [ ] Task 19: `sounds.ts`: Knock, Chime and Ping with Web Audio at a volume, skipped when the browser refuses (AC-28, AC-37)
      Check: pnpm test packages/app/src/features/notifications/sounds.test.ts
      Files: packages/app/src/features/notifications/sounds.ts, packages/app/src/features/notifications/sounds.test.ts, packages/app/src/test/browser-fakes.ts
- [ ] Task 20: Pop-ups: new notifications pop up per the settings, approvals stay, others go after 8 s, three at most; mounted once in the shell (AC-23, AC-24, AC-25, AC-26, AC-29)
      Check: pnpm test packages/app/src/features/notifications/components/pop-ups.test.tsx
      Files: packages/app/src/features/notifications/components/pop-ups.tsx, packages/app/src/features/notifications/components/pop-ups.test.tsx, packages/app/src/shell/app-shell.tsx
- [ ] Task 21: Desktop notifications and sounds once for every tab: the Web Lock, visible tabs, "only when Orynx isn't the tab you're looking at", clicking one opens its place (AC-27, AC-28, AC-29)
      Check: pnpm test packages/app/src/features/notifications/alerts.test.ts
      Files: packages/app/src/features/notifications/alerts.ts, packages/app/src/features/notifications/alerts.test.ts, packages/app/src/features/notifications/components/pop-ups.tsx, packages/app/src/test/browser-fakes.ts

**App: Settings › Notifications**

- [x] Task 22: The Notifications tab after Skills, its page bar, loading and save errors, and "Where you get notified" with the browser's permission and the desktop app's words; a `SettingList`/`SettingRow` in `@devhub/ui` for the design's `dh-perm` rows. Built before task 17, whose links need the tab. While loading, the controls show the defaults disabled, as every Settings tab does, rather than skeletons (AC-32, AC-33, AC-34, AC-35, AC-43, AC-44)
      Check: pnpm test packages/app/src/features/settings/settings-screen.test.tsx packages/app/src/features/settings/components/notifications-panel.test.tsx packages/ui/src/components/setting-row.test.tsx
      Files: packages/app/src/features/settings/tabs.ts, packages/app/src/features/settings/settings-screen.tsx, packages/app/src/features/settings/components/notifications-panel.tsx, packages/app/src/features/settings/components/notifications-panel.test.tsx, packages/app/src/features/notifications/queries.ts, packages/app/src/features/notifications/desktop.ts, packages/ui/src/components/setting-row.tsx, packages/ui/src/components/setting-row.stories.tsx, packages/ui/src/components/setting-row.test.tsx, docs/design-map.md
- [ ] Task 23: Sound and "What you're told about": Play sounds, Volume, the sound list, the events table and its narrow layout (AC-36, AC-37, AC-38, AC-39, AC-45)
      Check: pnpm test packages/app/src/features/settings/components/notification-events.test.tsx
      Files: packages/app/src/features/settings/components/notification-events.tsx, packages/app/src/features/settings/components/notification-events.test.tsx, packages/app/src/features/settings/components/notifications-panel.tsx
- [ ] Task 24: Do not disturb, quiet hours and "Still tell me when Claude is waiting for approval" (AC-40, AC-41)
      Check: pnpm test packages/app/src/features/settings/components/do-not-disturb.test.tsx
      Files: packages/app/src/features/settings/components/do-not-disturb.tsx, packages/app/src/features/settings/components/do-not-disturb.test.tsx, packages/app/src/features/settings/components/notifications-panel.tsx, packages/app/src/features/settings/schemas.ts
- [ ] Task 25: Send a test notification (AC-42)
      Check: pnpm test packages/app/src/features/settings/components/test-notification.test.tsx
      Files: packages/app/src/features/settings/components/test-notification.tsx, packages/app/src/features/settings/components/test-notification.test.tsx, packages/app/src/features/settings/settings-screen.tsx

**End to end**

- [ ] Task 26: E2e: Claude asks, the bell counts it, Allow once from the panel runs it; the Notifications tab saves and axe finds nothing (AC-1, AC-4, AC-9, AC-32, AC-46)
      Check: pnpm test:e2e e2e/approvals.spec.ts e2e/settings.spec.ts
      Files: e2e/approvals.spec.ts, e2e/settings.spec.ts
- [ ] Task 27: Browser check of the panel, a pop-up and the tab at 360 and 1280 px in light and dark; a `learn/` page; the script for `docs/design/screens/`, `design-system.md` and `docs/product/spec.md` (AC-45, AC-46)
      Check: pnpm gate design-source; pnpm gate learn-freshness
      Files: learn/notifications.md, specs/029-notifications/people-files.sh
- [ ] Task 28: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
