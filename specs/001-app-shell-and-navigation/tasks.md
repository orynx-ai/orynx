# Tasks: App shell and navigation

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Contracts for the session list, `sessions.changed` and the person's name in the status, with builders (AC-8, AC-13, AC-15, AC-16)
      Check: pnpm test packages/contracts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/status.ts, packages/contracts/src/events.ts, packages/contracts/src/routes.ts, packages/contracts/src/testing.ts, packages/contracts/src/session.test.ts
- [x] Task 2: Core session store and `GET /api/sessions?limit=` behind the local-only checks (AC-15)
      Check: pnpm test packages/core
      Files: packages/core/src/sessions/session-store.ts, packages/core/src/routes/sessions.ts, packages/core/src/routes/sessions.test.ts, packages/core/src/create-server.ts, packages/core/src/index.ts
- [x] Task 3: Core reads the person's name from git once and puts it in the status (AC-16)
      Check: pnpm test packages/core
      Files: packages/core/src/status/git-user-name.ts, packages/core/src/status/git-user-name.test.ts, packages/core/src/status/status-service.ts, packages/core/src/create-server.ts, packages/core/src/create-server.test.ts
- [x] Task 4: API client `sessions()` and `sessionsQueryOptions` (AC-8, AC-15)
      Check: pnpm test packages/api-client
      Files: packages/api-client/src/endpoints/sessions.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/index.ts, packages/api-client/src/sessions.test.ts
- [x] Task 5: `SessionItem` in `@devhub/ui` with all five states and the current look (AC-9, AC-14)
      Check: pnpm test packages/ui; pnpm gate component-coverage; pnpm gate style-policy
      Files: packages/ui/src/components/session-item.tsx, packages/ui/src/components/session-item.stories.tsx, packages/ui/src/components/session-item.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 6: Sidebar session list in four states, refreshed by `sessions.changed` (AC-8, AC-10, AC-11, AC-12, AC-13)
      Check: pnpm test packages/app/src/shell packages/app/src/live-updates.test.tsx
      Files: packages/app/src/features/sessions/queries.ts, packages/app/src/shell/sidebar.tsx, packages/app/src/shell/sidebar-sessions.tsx, packages/app/src/shell/sidebar.test.tsx, packages/app/src/live-updates.tsx, packages/app/src/live-updates.test.tsx, packages/app/src/test/msw.ts
- [ ] Task 7: The `/sessions/$sessionId` route and the View all list (AC-14)
      Check: pnpm test packages/app/src/features/sessions; pnpm gate design-source
      Files: packages/app/src/router.tsx, packages/app/src/features/sessions/session-screen.tsx, packages/app/src/features/sessions/session-screen.test.tsx, packages/app/src/features/sessions/sessions-screen.tsx, packages/app/src/features/sessions/sessions-screen.test.tsx, packages/app/src/shell/page-frame.tsx
- [ ] Task 8: Footer with the person's initials and name, and Claude's state in words (AC-16)
      Check: pnpm test packages/app/src/shell
      Files: packages/app/src/shell/sidebar.tsx, packages/app/src/shell/sidebar-footer.tsx, packages/app/src/shell/person-name.ts, packages/app/src/shell/person-name.test.ts, packages/app/src/shell/sidebar.test.tsx
- [ ] Task 9: Keyboard: `Platform.os`, the New task shortcut, focus to the main region, the skip link and the Settings tab arrows (AC-5, AC-6, AC-7, AC-17, AC-18)
      Check: pnpm test packages/app apps/web
      Files: packages/app/src/platform.tsx, packages/app/src/shell/shortcuts.ts, packages/app/src/shell/use-shortcuts.ts, packages/app/src/shell/sidebar.tsx, packages/app/src/shell/app-shell.tsx, packages/app/src/shell/app-shell.test.tsx, packages/app/src/shell/shortcuts.test.tsx, packages/app/src/test/render.tsx, packages/app/src/features/settings/settings-screen.test.tsx, apps/web/src/platform.ts, apps/web/src/platform.test.ts
- [ ] Task 10: Collapsed rail with tooltips and names for every icon-only control (AC-2, AC-3, AC-4)
      Check: pnpm test packages/app/src/shell; pnpm gate style-policy
      Files: packages/app/src/shell/sidebar.tsx, packages/app/src/shell/sidebar-footer.tsx, packages/app/src/shell/sidebar.test.tsx
- [ ] Task 11: Compact top bar under 768 px (AC-19, AC-20)
      Check: pnpm test packages/app/src/shell; pnpm gate style-policy; checked in a real browser at 360 and 1280 px, light and dark
      Files: packages/app/src/shell/sidebar.tsx, packages/app/src/shell/sidebar-sessions.tsx, packages/app/src/shell/sidebar-footer.tsx, packages/app/src/shell/sidebar.test.tsx
- [ ] Task 12: e2e in Chromium: the shortcut reaches the page, CLS is 0 after a collapsed reload, no horizontal scroll at 360 px (AC-3, AC-6, AC-19)
      Check: pnpm test:e2e
      Files: e2e/shell.spec.ts
- [ ] Task 13: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
