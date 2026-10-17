# Tasks: Settings screens

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Contracts for preferences: the permission mode, the five inbox rules and their defaults, the PATCH body, the `settings.changed` event and the `/api/preferences` path. The agent adapter takes `PermissionMode` from contracts (AC-2, AC-12)
      Check: pnpm test packages/contracts; pnpm typecheck
      Files: packages/contracts/src/preferences.ts, preferences.test.ts, events.ts, routes.ts, index.ts, testing.ts; packages/core/src/agents/agent-adapter.ts
- [x] Task 2: Core preferences: settings.json keys, a service that reads with defaults and saves a partial change, and GET/PATCH `/api/preferences`, which publishes `settings.changed` and keeps every other key (AC-3, AC-13, AC-17, AC-18)
      Check: pnpm test packages/core/src/preferences packages/core/src/routes/preferences.test.ts packages/core/src/settings; pnpm gate learn-freshness
      Files: packages/core/src/settings/settings-store.ts, packages/core/src/preferences/preferences-service.ts (+test), packages/core/src/routes/preferences.ts (+test), packages/core/src/create-server.ts
- [x] Task 3: api-client preferences (get, update, queryOptions), and `settings.changed` refreshing them in live updates. The app-level test of that refresh comes with the first tab that shows them, in Task 5 (AC-17)
      Check: pnpm test packages/api-client packages/app/src/live-updates.test.tsx; pnpm gate learn-freshness
      Files: packages/api-client/src/endpoints/preferences.ts, client.ts, queries.ts, index.ts, preferences.test.ts; packages/app/src/live-updates.tsx; learn/live-updates.md
- [x] Task 4: `Checkbox` in `@devhub/ui`: a native checkbox at 20 px with a `border-control` outline, `info` when checked, and a label filling a 48 px row, with stories (unchecked, checked, disabled, long label) and a test; design-map row (AC-12, AC-19)
      Check: pnpm test packages/ui/src/components/checkbox.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/checkbox.tsx, checkbox.stories.tsx, checkbox.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 5: The Coding agent tab: legend, three choices with their lines, the two footnotes, the loading chrome, an optimistic save, and on failure a rollback with a line under the group (AC-1, AC-2, AC-3, AC-14, AC-15, AC-16)
      Check: pnpm test packages/app/src/features/settings; pnpm gate design-source style-policy component-coverage
      Files: packages/app/src/features/settings/tabs.ts, settings-screen.tsx (+test), queries.ts, components/coding-agent-panel.tsx (+test), components/save-error.tsx (+test), packages/app/src/test/msw.ts, packages/app/src/live-updates.test.tsx
- [x] Task 6: The Inbox rules tab: the intro line, five checkbox rows, the loading chrome, an optimistic save, and on failure a rollback with the save-error line (AC-1, AC-12, AC-13, AC-14, AC-15, AC-16)
      Check: pnpm test packages/app/src/features/settings; pnpm gate style-policy component-coverage
      Files: packages/app/src/features/settings/tabs.ts, settings-screen.tsx, components/inbox-rules-panel.tsx (+test); packages/ui/src/components/tabs.tsx (an opened tab past the edge scrolls into view), checkbox.tsx (12 px above and below a wrapped label)
- [x] Task 7: The folder check: expand `~`, require a full path, resolve symlinks, and answer with a folder or one of the reasons (empty, not a full path, nothing there, a file, can't read, not a repository, inside a repository with its top folder, inside DevHub's folder). It uses the file system only, tested against real temporary folders (AC-7)
      Check: pnpm test packages/core/src/repositories/folder-check.test.ts
      Files: packages/core/src/repositories/folder-check.ts (+test)
- [x] Task 8: Repositories end to end in core: contract (folder, add request, list), the `folder_rejected` error code, settings.json key, a service (list with name and `~` path, add with a duplicate check and the 100 limit, remove by id), and GET/POST/DELETE routes that publish `settings.changed`; `createServer` takes the home folder and DevHub's folder (AC-6, AC-7, AC-11, AC-17, AC-18)
      Check: pnpm test packages/contracts packages/core/src/repositories packages/core/src/routes/repositories.test.ts apps/server; pnpm typecheck
      Files: packages/contracts/src/repositories.ts (+test), errors.ts, routes.ts, index.ts, testing.ts; packages/core/src/repositories/repository-service.ts (+test), packages/core/src/routes/repositories.ts (+test), packages/core/src/settings/settings-store.ts, packages/core/src/create-server.ts; apps/server/src/main.ts
- [x] Task 9: Jira projects: a paged `projects()` in the Jira client (100 per page, at most 1000, 10 s per page), a service method that reads the saved connection and token, and GET `/api/jira/projects` with spec 003's problem messages (AC-5, AC-9)
      Check: pnpm test packages/core/src/integrations/jira packages/core/src/routes/jira.test.ts packages/contracts; pnpm gate learn-freshness
      Files: packages/contracts/src/jira.ts (+test), routes.ts; packages/core/src/integrations/jira/client.ts (+test), connection.ts (+test), packages/core/src/routes/jira.ts (+test), packages/core/src/test/fake-jira.ts; learn/connecting-jira.md
- [x] Task 10: api-client for repositories (list, add, remove) and Jira projects (never cached), and `settings.changed` also refreshing repositories (AC-5, AC-17)
      Check: pnpm test packages/api-client packages/app/src/live-updates.test.tsx
      Files: packages/api-client/src/endpoints/repositories.ts, endpoints/jira.ts, client.ts, queries.ts, repositories.test.ts, jira.test.ts; packages/app/src/live-updates.tsx
- [x] Task 11: `Select` in `@devhub/ui`: a native `<select>` styled like `Input` (40 px, `border-control`, the same focus ring, works inside `Field`), with stories (default, disabled, invalid, long list) and a test; design-map row (AC-5, AC-19)
      Check: pnpm test packages/ui/src/components/select.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/select.tsx, select.stories.tsx, select.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 12: The Repositories tab: the intro line, Add local folder, folder rows (name, `~` path in mono, Jira pill, Remove), the empty text, the loading chrome, and an optimistic Remove with focus moving on, a spoken "Removed …" and a rollback on failure (AC-1, AC-4, AC-11, AC-14, AC-15, AC-16)
      Check: pnpm test packages/app/src/features/settings; pnpm gate style-policy component-coverage
      Files: packages/app/src/features/settings/tabs.ts, settings-screen.tsx, queries.ts, components/repositories-panel.tsx (+test), components/repository-row.tsx (+test)
- [x] Task 13: The add-folder form: react-hook-form and zod (path required, starting with / or ~), the Jira project select (connected, not connected, list failed), server errors under Folder, Add folder and Cancel, Escape, and focus on open and close (AC-5, AC-6, AC-7, AC-8, AC-9, AC-10)
      Check: pnpm test packages/app/src/features/settings; pnpm gate style-policy component-coverage
      Files: packages/app/src/features/settings/schemas.ts, queries.ts, components/add-folder-form.tsx (+test), components/repositories-panel.tsx. Built in one commit with Task 12: the Add local folder button is the form's toggle and the place focus returns to
- [x] Task 14: e2e on the real server: the five tabs and their addresses with reload, at 360 px the opened tab scrolled fully into the tab list, CLS 0 on each new tab, keyboard through every control, adding and removing a temporary git folder with Jira not connected, a second page following along, and axe at 360 and 1280 px in light and dark. Then the browser check by hand (AC-1, AC-15, AC-17, AC-19, AC-20)
      Check: pnpm test:e2e e2e/settings.spec.ts
      Files: e2e/settings.spec.ts
- [x] Task 15: Asked by the user on 2026-10-17: draw Jira, GitHub and Slack with their own logos in their official colours (brand tokens approved by the user), in `SourceMark`, with the design system and design map updated
      Check: pnpm test packages/ui/src/components/source-mark.test.tsx; pnpm gate style-policy; the Connections list checked by eye in light and dark
      Files: packages/ui/src/components/source-mark.tsx (+test), packages/ui/src/styles/tokens.css, packages/ui/src/styles/theme.css, docs/design/design-system.md, docs/design-map.md
- [ ] Task 16: Docs: what settings.json holds (architecture), a learn page on how the settings save and how a folder is checked, the agent-runtime skill (the mode lives in Settings › Coding agent), and the comment in `tabs.ts`
      Check: pnpm gate learn-freshness handbook-size; pnpm format:check
      Files: docs/architecture.md, learn/settings-and-folders.md, .claude/skills/agent-runtime/SKILL.md
- [ ] Task 17: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
