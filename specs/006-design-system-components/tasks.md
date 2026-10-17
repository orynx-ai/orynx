# Tasks: Design-system components

One task is one commit. Test first, then code. Tick a task only when its Check passes.

Every task below that adds a part also exports it from `packages/ui/src/index.ts` and adds its story and test. Its Check always includes `pnpm gate style-policy component-coverage boundaries` and `pnpm typecheck`; only the part's own test is named.

- [x] Task 1: Add `Skeleton` from shadcn's `skeleton`: a plain `bg-subtle` block with no animation that loading forms are built from (Q4a, AC-26)
      Check: pnpm test packages/ui/src/components/skeleton.test.tsx
      Files: packages/ui/src/components/skeleton.tsx, skeleton.stories.tsx, skeleton.test.tsx, packages/ui/src/index.ts
- [x] Task 2: Add `SegmentedControl` from shadcn's `toggle` (its `toggle-group` makes single-choice options radios): a named group of 32 px toggle buttons with an icon and a word, one always pressed (AC-1, AC-2)
      Check: pnpm test packages/ui/src/components/segmented-control.test.tsx
      Files: packages/ui/src/components/segmented-control.tsx, segmented-control.stories.tsx, segmented-control.test.tsx, packages/ui/src/index.ts
- [x] Task 3: Add `Stepper`: an ordered list of done, current and to-do steps, with ", done" for screen readers and `aria-current="step"` (AC-3)
      Check: pnpm test packages/ui/src/components/stepper.test.tsx
      Files: packages/ui/src/components/stepper.tsx, stepper.stories.tsx, stepper.test.tsx, packages/ui/src/index.ts
- [x] Task 4: Add `StatusIcon`: four 20 px shapes for to do, in progress, in review and done (Q1b, AC-25)
      Check: pnpm test packages/ui/src/components/status-icon.test.tsx
      Files: packages/ui/src/components/status-icon.tsx, status-icon.stories.tsx, status-icon.test.tsx, packages/ui/src/index.ts
- [x] Task 5: Add `ActivityStep` from shadcn's `trace` (AI Elements' Task pattern): a 24 px dot with its icon, a title and a detail line, as done, waiting or plain (Q1b, AC-25)
      Check: pnpm test packages/ui/src/components/activity-step.test.tsx
      Files: packages/ui/src/components/activity-step.tsx, activity-step.stories.tsx, activity-step.test.tsx, packages/ui/src/index.ts
- [x] Task 6: Add `Chip` (the quick start from AI Elements' Suggestion pattern): a 32 px filter toggle that says whether it's pressed, or a quick-start link through `asChild` (Q1b, AC-25)
      Check: pnpm test packages/ui/src/components/chip.test.tsx
      Files: packages/ui/src/components/chip.tsx, chip.stories.tsx, chip.test.tsx, packages/ui/src/index.ts
- [x] Task 7: Add `Panel`: a bordered surface with an optional head (heading and meta line) around a list (Q1b, AC-25)
      Check: pnpm test packages/ui/src/components/panel.test.tsx
      Files: packages/ui/src/components/panel.tsx, panel.stories.tsx, panel.test.tsx, packages/ui/src/index.ts
- [x] Task 8: Add `Menu` from shadcn's `dropdown-menu`: items with an icon, a description or mono path, a chevron, section labels, separators, a foot line and link items; arrow keys, typeahead, Enter, Esc and focus back on the trigger (AC-5, AC-6)
      Check: pnpm test packages/ui/src/components/menu.test.tsx
      Files: packages/ui/src/components/menu.tsx, menu.stories.tsx, menu.test.tsx, packages/ui/src/test/setup.ts (browser stand-ins only if jsdom needs them), packages/ui/src/index.ts
- [x] Task 9: Add `Picker` (the 32 px button that opens a menu) and radio items with an `info` check; the menu stays inside the window (AC-4, AC-7)
      Check: pnpm test packages/ui/src/components/picker.test.tsx packages/ui/src/components/menu.test.tsx
      Files: packages/ui/src/components/picker.tsx, picker.stories.tsx, picker.test.tsx, packages/ui/src/components/menu.tsx, menu.stories.tsx, menu.test.tsx, packages/ui/src/index.ts
- [x] Task 10: Add `Composer` from AI Elements' Prompt Input pattern (shadcn's `input-group`) in its "task" look: hidden label, placeholder, a bar for + and the pickers, round primary Send; Enter sends, Shift+Enter adds a line, Enter while composing doesn't send (AC-8, AC-9)
      Check: pnpm test packages/ui/src/components/composer.test.tsx
      Files: packages/ui/src/components/composer.tsx, composer.stories.tsx, composer.test.tsx, packages/ui/src/index.ts
- [x] Task 11: Composer sending states and height: Send unavailable when there's nothing to send, its spinner while sending; the text box grows to 8 lines, then scrolls (AC-10, AC-11)
      Check: pnpm test packages/ui/src/components/composer.test.tsx
      Files: packages/ui/src/components/composer.tsx, composer.stories.tsx, composer.test.tsx
- [x] Task 12: Add `ContextChip` from shadcn's `attachment`, and the Composer's "Context for Claude" list: mark or icon, text cut at 300 px with a tooltip, "Remove PROJ-1423" with a 32 px hit area, and focus to the next chip or the text box after removing (AC-12, AC-13)
      Check: pnpm test packages/ui/src/components/context-chip.test.tsx packages/ui/src/components/composer.test.tsx
      Files: packages/ui/src/components/context-chip.tsx, context-chip.stories.tsx, context-chip.test.tsx, packages/ui/src/components/composer.tsx, composer.stories.tsx, composer.test.tsx, packages/ui/src/index.ts
- [x] Task 13: Composer "follow-up" look: no shadow, no pickers, one line, the hint, a secondary Send (AC-14)
      Check: pnpm test packages/ui/src/components/composer.test.tsx
      Files: packages/ui/src/components/composer.tsx, composer.stories.tsx, composer.test.tsx
- [x] Task 14: Add `AgentChip`: a 24 px link with a 32 px hit area, in the sidebar's words and colours for each session state (Q2b, Q3d, AC-15)
      Check: pnpm test packages/ui/src/components/agent-chip.test.tsx
      Files: packages/ui/src/components/agent-chip.tsx, agent-chip.stories.tsx, agent-chip.test.tsx, packages/ui/src/index.ts
- [x] Task 15: Add `WorkItemCard`: key, type (Bug in `danger`), avatar, a title link clamped to two lines, priority bars and word, a due date (warning when soon) with 16 px icons, and an AgentChip or a "Build … with Claude" icon button; the card isn't one big link (Q2c, AC-15, AC-16, AC-17)
      Check: pnpm test packages/ui/src/components/work-item-card.test.tsx
      Files: packages/ui/src/components/work-item-card.tsx, work-item-card.stories.tsx, work-item-card.test.tsx, packages/ui/src/index.ts
- [x] Task 16: WorkItemCard loading form, the same size as a card (Q4a, AC-26)
      Check: pnpm test packages/ui/src/components/work-item-card.test.tsx
      Files: packages/ui/src/components/work-item-card.tsx, work-item-card.stories.tsx, work-item-card.test.tsx
- [x] Task 17: Add `AttentionList` and `AttentionRow`: source mark with its hidden name, title link and sub line, reason pill, Home's ghost action with a chevron; the pill moves under the sub line when the row is under 480 px; a loading form (Q3a, Q4a, Q4b, AC-18, AC-19, AC-26)
      Check: pnpm test packages/ui/src/components/attention-row.test.tsx
      Files: packages/ui/src/components/attention-row.tsx, attention-row.stories.tsx, attention-row.test.tsx, packages/ui/src/index.ts
- [x] Task 18: Add `FileList`: a list of 40 px buttons with the path (only the folder part is cut), counts in `success` and `danger` read as "68 lines added, 9 lines removed", `aria-current` on the shown file; a loading form (Q3b, Q5b, Q4a, AC-20, AC-21, AC-26)
      Check: pnpm test packages/ui/src/components/file-list.test.tsx
      Files: packages/ui/src/components/file-list.tsx, file-list.stories.tsx, file-list.test.tsx, packages/ui/src/index.ts
- [x] Task 19: Add `DiffView` from shadcn's `code-block` without Shiki (Q6b): a region named "Changes in <file>", the header with path and counts, numbered lines with their sign on the add and remove washes; long lines scroll inside it; copying takes only the code (Q5c, AC-22, AC-23)
      Check: pnpm test packages/ui/src/components/diff-view.test.tsx
      Files: packages/ui/src/components/diff-view.tsx, diff-view.stories.tsx, diff-view.test.tsx, packages/ui/src/index.ts
- [x] Task 20: DiffView hunk rows (`@@ … @@` on `bg-sidebar`; removed lines keep their old number) and its loading form (Q4c, Q4a, AC-22, AC-26)
      Check: pnpm test packages/ui/src/components/diff-view.test.tsx
      Files: packages/ui/src/components/diff-view.tsx, diff-view.stories.tsx, diff-view.test.tsx
- [ ] Task 21: Add `ResumeBanner`: one link to the session on `warning-subtle`, with the "!" icon, the title, a detail line cut on one line, and "Review" drawn as a small secondary button (AC-24)
      Check: pnpm test packages/ui/src/components/resume-banner.test.tsx
      Files: packages/ui/src/components/resume-banner.tsx, resume-banner.stories.tsx, resume-banner.test.tsx, packages/ui/src/index.ts
- [ ] Task 22: Mark every new part built in the design-map Components table, with its props (AC-28)
      Check: pnpm gate specs; pnpm exec prettier --check docs/design-map.md
      Files: docs/design-map.md
- [ ] Task 23: Open every new story in a real browser at 360 and 1280 px, in light and dark: run axe, measure sizes, wraps and sideways scroll, Tab through; fix what turns up, then run the full check (AC-27, AC-28)
      Check: Storybook (pnpm storybook) with axe in the browser, no violations; pnpm verify; pnpm test:coverage at 90% or more
      Files: whichever stories or parts the check shows need fixing
- [ ] Task 24: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
