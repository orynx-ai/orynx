# Tasks: Sync activity

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Add the sync activity contracts, its path, and `tool` on the refresh request (AC-32)
      Check: pnpm test packages/contracts/src/sync-activity.test.ts; pnpm typecheck
      Files: packages/contracts/src/sync-activity.ts, packages/contracts/src/sync-activity.test.ts, packages/contracts/src/inbox.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts
- [x] Task 2: Keep a sync log in cache.db: a 2 → 3 upgrade that keeps the other tables, 30-day retention, newest-100 reads, per-tool figures, and Clear cache empties it (AC-34, AC-35, AC-36)
      Check: pnpm test packages/core/src/inbox/inbox-cache.test.ts
      Files: packages/core/src/inbox/inbox-cache.ts, packages/core/src/inbox/inbox-cache.test.ts
- [x] Task 3: Work out what a sync changed: new, updated, removed, the first 50 kept and the rest counted (AC-33, AC-16)
      Check: pnpm test packages/core/src/inbox/sync-changes.test.ts
      Files: packages/core/src/inbox/sync-changes.ts, packages/core/src/inbox/sync-changes.test.ts
- [x] Task 4: Write a log row for each tool's part of every sync, and sync one tool on its own (AC-32, AC-20, AC-22)
      Check: pnpm test packages/core/src/inbox/inbox-service.test.ts packages/core/src/inbox/no-leaks.test.ts
      Files: packages/core/src/inbox/inbox-service.ts, packages/core/src/inbox/inbox-service.test.ts, packages/core/src/inbox/no-leaks.test.ts
- [x] Task 5: Serve GET /api/sync-activity, and POST /api/inbox/refresh with a tool (AC-5, AC-6, AC-7, AC-17, AC-18, AC-37)
      Check: pnpm test packages/core/src/routes/sync-activity.test.ts packages/core/src/routes/inbox.test.ts packages/core/src/inbox/sync-activity-service.test.ts
      Files: packages/core/src/inbox/sync-activity-service.ts, packages/core/src/inbox/sync-activity-service.test.ts, packages/core/src/routes/sync-activity.ts, packages/core/src/routes/sync-activity.test.ts, packages/core/src/routes/inbox.ts, packages/core/src/routes/inbox.test.ts, packages/core/src/create-server.ts
- [x] Task 6: Read the sync activity and sync one tool from the api-client (AC-20)
      Check: pnpm test packages/api-client/src/sync-activity.test.ts packages/api-client/src/inbox.test.ts
      Files: packages/api-client/src/endpoints/sync-activity.ts, packages/api-client/src/endpoints/inbox.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/sync-activity.test.ts, packages/api-client/src/inbox.test.ts
- [x] Task 7: Add Dialog's wide size: 1100 × 860 px, with the gutter on smaller windows (AC-30, AC-31)
      Check: pnpm test packages/ui/src/components/dialog.test.tsx; pnpm gate style-policy component-coverage
      Files: packages/ui/src/components/dialog.tsx, packages/ui/src/components/dialog.stories.tsx, packages/ui/src/components/dialog.test.tsx, docs/design-map.md
- [x] Task 8: Add StatusDot and StatTiles (AC-8, AC-9)
      Check: pnpm test packages/ui/src/components/status-dot.test.tsx packages/ui/src/components/stat-tiles.test.tsx; pnpm gate style-policy component-coverage
      Files: packages/ui/src/components/status-dot.tsx, status-dot.stories.tsx, status-dot.test.tsx, stat-tiles.tsx, stat-tiles.stories.tsx, stat-tiles.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 9: Add HistoryRow, a row that opens in place (AC-12, AC-13)
      Check: pnpm test packages/ui/src/components/history-row.test.tsx; pnpm gate style-policy component-coverage
      Files: packages/ui/src/components/history-row.tsx, history-row.stories.tsx, history-row.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 10: Give ListNavItem a mark and a status, and add ListNavGroup (AC-5, AC-8)
      Check: pnpm test packages/ui/src/components/list-nav.test.tsx; pnpm gate style-policy component-coverage
      Files: packages/ui/src/components/list-nav.tsx, list-nav.stories.tsx, list-nav.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 11: Write the sync activity words: problems, fixes, summaries, status lines and times (AC-10, AC-11, AC-12)
      Check: pnpm test packages/app/src/features/sync-activity/sync-words.test.ts
      Files: packages/app/src/features/sync-activity/sync-words.ts, packages/app/src/features/sync-activity/sync-words.test.ts
- [ ] Task 12: Build the dialog's tool list and detail: head, groups, status, problem callout and stats, with loading and error states (AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-17, AC-19, AC-28, AC-29)
      Check: pnpm test packages/app/src/features/sync-activity
      Files: packages/app/src/features/sync-activity/queries.ts, packages/app/src/features/sync-activity/components/sync-activity-dialog.tsx, packages/app/src/features/sync-activity/components/sync-activity-dialog.test.tsx
- [ ] Task 13: Build the history and its actions: rows that open, the Failed filter, Sync now, Retry, Sync all now and the announcements (AC-12, AC-13, AC-14, AC-15, AC-16, AC-18, AC-20, AC-21, AC-22, AC-25)
      Check: pnpm test packages/app/src/features/sync-activity
      Files: packages/app/src/features/sync-activity/components/sync-history.tsx, packages/app/src/features/sync-activity/components/sync-history.test.tsx, packages/app/src/features/sync-activity/components/sync-activity-dialog.tsx, packages/app/src/features/sync-activity/queries.ts
- [ ] Task 14: Put the Sync activity button on Home's page bar, and open a tool's connection dialog from `?tool=` (AC-1, AC-2, AC-3, AC-4, AC-23, AC-24, AC-26)
      Check: pnpm test packages/app/src/features/home/components/sync-status.test.tsx packages/app/src/features/sync-activity packages/app/src/features/settings/components/connections-panel.test.tsx
      Files: packages/app/src/features/sync-activity/components/sync-activity-button.tsx, packages/app/src/features/sync-activity/components/sync-activity-button.test.tsx, packages/app/src/features/home/components/sync-status.tsx, packages/app/src/features/home/components/sync-status.test.tsx, packages/app/src/features/settings/tabs.ts, packages/app/src/features/settings/components/connections-panel.tsx, packages/app/src/features/settings/components/connection-dialog.tsx, packages/app/src/features/settings/components/connections-panel.test.tsx
- [ ] Task 15: Prove the modal end to end at 1280 and 360 px, light and dark, with axe and the keyboard (AC-1, AC-20, AC-27, AC-30, AC-31)
      Check: pnpm test:e2e e2e/sync-activity.spec.ts
      Files: e2e/sync-activity.spec.ts, e2e/fake-tools/\* (only if a failing Jira answer is missing)
- [ ] Task 16: Write the people-files script that copies the design and adds the new parts to design-system.md (Q2, Q4)
      Check: sh -n specs/035-sync-activity/people-files.sh; pnpm gate specs
      Files: specs/035-sync-activity/people-files.sh
- [ ] Task 17: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
