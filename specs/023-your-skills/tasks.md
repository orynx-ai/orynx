# Tasks: Your skills

One task is one commit. Test first, then code. Tick a task only when its Check passes. Per `/build`, a task runs its Check, one `pnpm typecheck` and the gates its change needs; `/review` runs `pnpm verify` and the e2e suite.

**Part A: Settings › Skills**

- [x] Task 1: Skill contracts: the folder-name rule, `folderFromName`, limits, the list, one skill, the save request, paths, `skills.changed`, `skill_rejected`, builders (AC-6, AC-8, AC-20)
      Check: pnpm test packages/contracts/src/skills.test.ts
      Files: packages/contracts/src/skills.ts, packages/contracts/src/skills.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/events.ts, packages/contracts/src/errors.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [x] Task 2: Read and write a `SKILL.md`: `name`, `description`, `metadata.title`, unknown keys kept; add `yaml` to core (AC-5, AC-17, AC-18)
      Check: pnpm test packages/core/src/skills/skill-file.test.ts
      Files: packages/core/src/skills/skill-file.ts, packages/core/src/skills/skill-file.test.ts, packages/core/package.json, docs/architecture.md
- [x] Task 3: The skill store, reading: list and read under `<DEVHUB_HOME>/plugin/skills`, unreadable folders, links skipped, 64 KB cap (AC-2, AC-12, AC-17, AC-20)
      Check: pnpm test packages/core/src/skills/skill-store.test.ts
      Files: packages/core/src/skills/skill-store.ts, packages/core/src/skills/skill-store.test.ts
- [x] Task 4: The skill store, writing: add, save with rename, delete and the starters; 0700 and 0600, atomic writes, one at a time, `skills.changed` (AC-5, AC-6, AC-7, AC-9, AC-10, AC-13)
      Check: pnpm test packages/core/src/skills/skill-store.test.ts
      Files: packages/core/src/skills/skill-store.ts, packages/core/src/skills/skill-store.test.ts, packages/core/src/skills/starters.ts
- [x] Task 5: Skills routes in the server, with 401, 400 for a bad folder and 422 for a taken name (AC-7, AC-20, AC-28)
      Check: pnpm test packages/core/src/routes/skills.test.ts
      Files: packages/core/src/routes/skills.ts, packages/core/src/routes/skills.test.ts, packages/core/src/create-server.ts
- [x] Task 6: API client for skills; `skills.changed` keys the list (its screen test is task 10's AC-19)
      Check: pnpm test packages/api-client/src/skills.test.ts
      Files: packages/api-client/src/endpoints/skills.ts, packages/api-client/src/skills.test.ts, packages/api-client/src/client.ts, packages/api-client/src/queries.ts, packages/api-client/src/index.ts
- [x] Task 7: `ListNav` in `@devhub/ui` (AC-3, AC-26)
      Check: pnpm test packages/ui/src/components/list-nav.test.tsx
      Files: packages/ui/src/components/list-nav.tsx, packages/ui/src/components/list-nav.stories.tsx, packages/ui/src/components/list-nav.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [x] Task 8: A `mono` Textarea and a `skill` SourceMark (AC-2)
      Check: pnpm test packages/ui/src/components/textarea.test.tsx packages/ui/src/components/source-mark.test.tsx
      Files: packages/ui/src/components/textarea.tsx, packages/ui/src/components/textarea.stories.tsx, packages/ui/src/components/textarea.test.tsx, packages/ui/src/components/source-mark.tsx, packages/ui/src/components/source-mark.stories.tsx, packages/ui/src/components/source-mark.test.tsx, docs/design-map.md
- [x] Task 9: The Skills tab after Coding agent, the page bar's count and New skill, the callout, and the loading, error and empty states (AC-1, AC-2, AC-12, AC-15)
      Check: pnpm test packages/app/src/features/settings/settings-screen.test.tsx packages/app/src/features/settings/components/skills-panel.test.tsx
      Files: packages/app/src/features/settings/tabs.ts, packages/app/src/features/settings/settings-screen.tsx, packages/app/src/features/settings/queries.ts, packages/app/src/features/settings/components/skills-panel.tsx, packages/app/src/features/settings/components/skills-panel.test.tsx
- [x] Task 10: The skill list with search, refreshed by `skills.changed` (AC-2, AC-3, AC-4, AC-19)
      Check: pnpm test packages/app/src/features/settings/components/skill-list.test.tsx
      Files: packages/app/src/features/settings/components/skill-list.tsx, packages/app/src/features/settings/components/skill-list.test.tsx, packages/app/src/features/settings/components/skills-panel.tsx
- [x] Task 11: The skill editor: fields, the folder name from the Name, save, field errors, a failed save (AC-2, AC-5, AC-6, AC-8, AC-16, AC-18, AC-27)
      Check: pnpm test packages/app/src/features/settings/components/skill-editor.test.tsx
      Files: packages/app/src/features/settings/components/skill-editor.tsx, packages/app/src/features/settings/components/skill-editor.test.tsx, packages/app/src/features/settings/schemas.ts, packages/app/src/features/settings/components/skills-panel.tsx
- [x] Task 12: New skill, and a taken name on Name (AC-7, AC-9)
      Check: pnpm test packages/app/src/features/settings/components/skill-editor.test.tsx packages/app/src/features/settings/components/skills-panel.test.tsx
      Files: packages/app/src/features/settings/components/skill-editor.tsx, packages/app/src/features/settings/components/skills-panel.tsx, their tests
- [x] Task 13: Delete skill with its dialog, and focus after it (AC-10)
      Check: pnpm test packages/app/src/features/settings/components/skills-panel.test.tsx
      Files: packages/app/src/features/settings/components/delete-skill.tsx, packages/app/src/features/settings/components/skills-panel.tsx, their tests
- [x] Task 14: Discard changes when picking another skill, pressing New skill or leaving the tab (AC-11)
      Check: pnpm test packages/app/src/features/settings/components/skills-panel.test.tsx
      Files: packages/app/src/features/settings/components/discard-skill-changes.tsx, packages/app/src/features/settings/components/skills-panel.tsx, their tests
- [x] Task 15: The starters, the Bug bash callout, and unreadable skills (AC-13, AC-14, AC-17)
      Check: pnpm test packages/app/src/features/settings/components/skills-panel.test.tsx packages/app/src/features/settings/components/skill-editor.test.tsx
      Files: packages/app/src/features/settings/components/skills-panel.tsx, packages/app/src/features/settings/components/skill-editor.tsx, their tests
- [x] Task 16: E2e for Settings › Skills on a hub of its own, and the browser check at 360 and 1280 px in both themes (AC-19, AC-25, AC-26, AC-29)
      Check: pnpm test:e2e e2e/skills.spec.ts
      Files: e2e/skills.spec.ts
- [x] Task 17: A `learn/` page for skills, and the `docs/product/spec.md` script for the user
      Check: pnpm gate specs learn-freshness
      Files: learn/your-skills.md, specs/023-your-skills/product-spec-edits.sh

**Part B: your skills in a session** (after 022 merges; refined then)

- [x] Task 18: Merge `origin/main` with 022, keeping one `yaml` line
      Check: pnpm typecheck; pnpm test packages/core/src/skills
      Files: whatever the merge touches
- [ ] Task 19: Your skills in 022's `/` list as "Orynx", after the folder's and `~/.claude`'s (AC-21)
      Check: 022's skill-list test file, with Orynx skills added
      Files: 022's skill reader in packages/core, its test
- [ ] Task 20: The brief carries an Orynx skill's whole file, and Claude can't read `<DEVHUB_HOME>` (AC-22)
      Check: 022's brief test file
      Files: 022's brief builder in packages/core, its test
- [ ] Task 21: Use counts from the sessions' briefs (AC-24)
      Check: pnpm test packages/core/src/skills packages/contracts/src/skills.test.ts
      Files: packages/core/src/skills/skill-store.ts, packages/contracts/src/skills.ts, their tests
- [ ] Task 22: "Used 4 times", "Not used yet" and Try in a new session (AC-23, AC-24)
      Check: pnpm test packages/app/src/features/settings/components
      Files: packages/app/src/features/settings/components/skill-list.tsx, packages/app/src/features/settings/components/skill-editor.tsx, their tests
- [ ] Task 23: E2e for a skill in a session (AC-21, AC-22, AC-23)
      Check: pnpm test:e2e e2e/skills.spec.ts
      Files: e2e/skills.spec.ts
- [ ] Task 24: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
