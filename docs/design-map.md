# Design map: design-system names → code

The design system (`docs/design/design-system.md`) names tokens and `dh-*` classes. The code uses Tailwind classes from the theme in `packages/ui/src/styles/theme.css` and components from `@devhub/ui`. This table is the translation. If a value you need is not here, it is not in the design system: stop and ask.

`pnpm gate style-policy` rejects raw colours, arbitrary values (`[13px]`), Tailwind's default palette (`gray-500`, `white`), default type sizes (`text-sm`), default shadows (`shadow-md`), `dark:`, and the shadcn names this theme leaves out on purpose (`accent`, `secondary`, `destructive`).

## Colour

Light and dark values switch through CSS variables, so never write `dark:`. Theme switching sets `data-theme` on `<html>`, or leaves it off to match the computer.

| Design token                                             | Tailwind colour                              | Example classes                                              | Use for                                           |
| -------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| `--bg-canvas`                                            | `canvas` (alias `background`)                | `bg-canvas`                                                  | main content area                                 |
| `--bg-sidebar`                                           | `sidebar`                                    | `bg-sidebar`                                                 | sidebar, board columns, diff file header          |
| `--bg-subtle`                                            | `subtle` (alias `muted`)                     | `bg-subtle`, `hover:bg-subtle`                               | hover rows, selected nav item, segmented track    |
| `--bg-raised`                                            | `raised` (aliases `card`, `popover`)         | `bg-raised`                                                  | cards, menus, composer                            |
| `--border-default`                                       | `border`                                     | `border-border`                                              | decorative dividers, card outlines                |
| `--border-control`                                       | `control` (alias `input`)                    | `border-control`                                             | inputs, checkboxes, secondary buttons             |
| `--text-primary`                                         | `foreground`                                 | `text-foreground`                                            | headings, body text                               |
| `--text-secondary`                                       | `muted-foreground`                           | `text-muted-foreground`                                      | meta lines, inactive tabs and nav                 |
| `--text-placeholder`                                     | `placeholder`                                | `placeholder:text-placeholder`                               | input placeholders only                           |
| `--primary` / `--on-primary`                             | `primary` / `primary-foreground`             | `bg-primary text-primary-foreground`                         | the one primary button per view                   |
| `--accent` (indigo)                                      | `info`, and `ring` for focus                 | `text-info`, `outline-ring`, `bg-info` (2 px underline only) | links, focus, selection marks; never a large fill |
| `--accent-subtle` / `--accent-text`                      | `info-subtle` / `info-foreground`            | `bg-info-subtle text-info-foreground`                        | selected rows, In review pill, info callouts      |
| `--success` / `--success-subtle`                         | `success` / `success-subtle`                 | `bg-success-subtle text-success`                             | done, passing, connected                          |
| `--warning` / `--warning-subtle`                         | `warning` / `warning-subtle`                 | `bg-warning-subtle text-warning`                             | waiting on you, due soon, approvals               |
| `--danger` / `--danger-subtle` / `--on-danger`           | `danger` / `danger-subtle` / `on-danger`     | `bg-danger text-on-danger`                                   | failing, bugs, destructive, removed lines         |
| `--source-jira` / `-github` / `-slack` / `-slack-subtle` | `jira` / `github` / `slack` / `slack-subtle` | `text-jira bg-info-subtle`                                   | source marks, always with the source name         |

Why there is no `accent`: in shadcn, `accent` means the grey hover surface, but in DevHub it means indigo. Leaving the name out makes `shadcn add` output fail the gate instead of silently turning menus indigo. When you add a shadcn component, rewrite `bg-accent` to `bg-subtle`, `secondary` to `raised`, and `destructive` to `danger`.

## Type

The sizes follow the Clean UI scale (`.claude/skills/clean-ui/SKILL.md`): on 17 Oct 2026 the user found the app "zoomed out" next to their reference screens and asked for the larger scale, and `docs/design/design-system.md` version 1.1 now lists the same numbers. The style names and their jobs are unchanged. Two weights only: `font-normal` and `font-medium` (the 600 face is no longer bundled). The screens in `docs/design/screens/` still show the 1.0 sizes. Every size that changed from 1.0:

- Type as below; icons 20 px (was 16).
- Buttons 40 px and `sm` 32 px (was 36 and 30); sidebar rows 40 px (was 34); tabs 48 px (was 40).
- Page bar and toolbar 56 px, the page bar on one line at every width (was 52 and 48, wrapping); page widths below.
- Sidebar 300 px by default, resizable from 260 to 400 px (was 248–260).
- Session rows: 24 px state circles with 14 px glyphs, 14 px source keys (was 20, 12 and 12; spec 001 Q12).
- Pills 24 px (was 22); source marks 20 and 40 px (was 18 and 32); avatars 28 and 36 px (was 24 and 28).
- EmptyState is plain centred text, without the dashed outline.

| Design style              | Classes                        | Use for                                        |
| ------------------------- | ------------------------------ | ---------------------------------------------- |
| `display` 40/48 serif 400 | `font-serif text-display`      | the Home greeting only                         |
| `title-lg` 20/28 500      | `text-title-lg font-medium`    | page title                                     |
| `title` 18/28 500         | `text-title font-medium`       | section and panel headings                     |
| `body` 16/24 400          | `text-body` (the root default) | default text                                   |
| `body-strong` 16/24 500   | `text-body font-medium`        | card titles, nav labels, buttons               |
| `small` 14/20             | `text-small`                   | meta lines, helper text, a row's second line   |
| `label` 12/16 500         | `text-label font-medium`       | pills, counts, keyboard hints; nothing smaller |
| `code` 14/20 mono         | `font-mono text-code`          | keys, branches, paths, diffs                   |

## Page widths

`PageBody width` from `packages/app/src/shell/page-frame.tsx`; it owns the gutter (16 px, 48 px from 768 px) and the 24 px rhythm, and takes no `className`.

| Width            | Max    | Use for                                    |
| ---------------- | ------ | ------------------------------------------ |
| `wide` (default) | 960 px | lists, settings, detail pages              |
| `narrow`         | 720 px | Home and other sparse or reading pages     |
| `full`           | none   | a board or table that 960 px would squeeze |

## Space, radius and shadow

| Design token                         | Tailwind                                                   | Notes                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `--space-1` … `--space-12` (4–48 px) | `1` … `12` in any spacing utility (`gap-2`, `p-3`, `px-6`) | Tailwind's 4 px scale matches; half steps (`p-2.5` = 10 px) are fine where the component CSS uses them |
| `--radius-sm` 6                      | `rounded-sm`                                               | buttons, inputs, nav items, pills                                                                      |
| `--radius-md` 10                     | `rounded-md`                                               | cards, menus, callouts                                                                                 |
| `--radius-lg` 16                     | `rounded-lg`                                               | composer, dialogs                                                                                      |
| `--radius-full`                      | `rounded-full`                                             | avatars, counts, chips                                                                                 |
| 4 px (inside components.css)         | `rounded-xs`                                               | segments, kbd, small inner marks                                                                       |
| `--shadow-overlay`                   | `shadow-overlay`                                           | menus, popovers, composer; nothing else has a shadow                                                   |

## Components

| Design system                                                                                                                                      | `@devhub/ui`                                                                                                                                                                 | Status                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Button (`dh-btn--primary/secondary/ghost/danger`, `--sm`, `--icon`)                                                                                | `<Button variant size pending>`                                                                                                                                              | built                      |
| Keyboard hint (`dh-kbd`)                                                                                                                           | `<Kbd>`                                                                                                                                                                      | built                      |
| Avatar (`dh-avatar`)                                                                                                                               | `<Avatar>`                                                                                                                                                                   | built                      |
| Pill (`dh-pill`, `--info/success/warning/danger/plain`)                                                                                            | `<Pill tone>`                                                                                                                                                                | built                      |
| Breadcrumb (`dh-breadcrumb`)                                                                                                                       | `<Breadcrumb items>`                                                                                                                                                         | built                      |
| Tabs (`dh-tabs`, `dh-tab`, `dh-count`)                                                                                                             | `<Tabs>`, `<TabsList>`, `<TabsTrigger count>`, `<TabsContent>` (Radix)                                                                                                       | built                      |
| EmptyState (`dh-empty`, drawn as plain centred text without the dashed outline: Clean UI)                                                          | `<EmptyState title>`                                                                                                                                                         | built                      |
| Callout (`dh-callout--warning/info`)                                                                                                               | `<Callout tone title>`                                                                                                                                                       | built                      |
| SourceMark (`dh-source--jira/github/slack`; each tool's own logo in its own colours, `--brand-*` tokens, 17 Oct 2026)                              | `<SourceMark source>`                                                                                                                                                        | built                      |
| SidebarNav, PageHeader (`dh-sidebar`, `dh-pagebar`, `dh-toolbar`, `dh-pagebody`)                                                                   | `packages/app/src/shell/*`                                                                                                                                                   | built (app chrome, not ui) |
| SidebarNav session (`dh-session`, `dh-session-icon--wait/run/done`)                                                                                | `<SessionItem title source state asChild>`, `sessionStateLabels`                                                                                                             | built                      |
| Resize handle (no `dh-` class; sidebar resizing decided in spec 001 Q10)                                                                           | `<Splitter value min max onValueChange defaultValue step aria-label>`                                                                                                        | built                      |
| Input (`dh-field`, `dh-field-label`, `dh-field-help`, `dh-input`; 40 px; error replaces help in `danger`, spec 003 Q4)                             | `<Field label help error id>` around `<Input>`                                                                                                                               | built                      |
| Choice card (`dh-choice`, radio as a card; a fieldset with its legend, as Coding agent and Appearance draw it, spec 004 Q4)                        | `<ChoiceGroup legend help error>` around `<ChoiceCard title detail>`                                                                                                         | built                      |
| Select (native `<select>` drawn like Input, 40 px, `border-control`, chevron at the end; for Settings › Repositories' Jira project, spec 005 Q4)   | `<Field label>` around `<Select>` with `<option>`s                                                                                                                           | built                      |
| Checkbox (native checkbox in a 48 px row, as Settings › Inbox rules draws it; the browser draws the box and tick in `info`, spec 005 Q5)           | `<Checkbox label>`                                                                                                                                                           | built                      |
| Skeleton (no `dh-` class; a plain `bg-subtle` block without a pulse, from shadcn `skeleton`, spec 006 Q4a)                                         | `<Skeleton shape>`                                                                                                                                                           | built                      |
| SegmentedControl (`dh-segmented`, `dh-segment`; toggle buttons in a named group, from shadcn `toggle`)                                             | `<SegmentedControl aria-label value defaultValue onValueChange>` around `<SegmentedControlItem value>`                                                                       | built                      |
| Stepper (`dh-stepper`, `dh-step-num`)                                                                                                              | `<Stepper aria-label steps current>`                                                                                                                                         | built                      |
| Status icon (`dh-status-icon`, `dh-status--todo/doing/review/done`)                                                                                | `<StatusIcon status label>`                                                                                                                                                  | built                      |
| Activity step (`dh-step`, `dh-step--done/wait`; from shadcn `trace`, AI Elements' Task pattern)                                                    | `<ActivityList>` around `<ActivityStep state icon title detail>`                                                                                                             | built                      |
| Chip (`dh-chip`; quick starts from AI Elements' Suggestion pattern, and toolbar filters pressed in `info`)                                         | `<Chip asChild>`, `<FilterChip pressed onPressedChange>`                                                                                                                     | built                      |
| Panel (`dh-panel`, `dh-panel-head`)                                                                                                                | `<Panel title meta headingLevel>`                                                                                                                                            | built                      |
| Menu (`dh-menu`, `dh-menu-item`, `dh-menu-label`, `dh-menu-sep`, `dh-menu-foot`, `dh-desc`; from shadcn `dropdown-menu`; Tab also closes it)       | `<Menu>`, `<MenuTrigger>`, `<MenuContent foot>`, `<MenuItem icon description path leadsOn asChild>`, `<MenuLabel>`, `<MenuSeparator>`, `<MenuRadioGroup>`, `<MenuRadioItem>` | built                      |
| Picker (`dh-picker`)                                                                                                                               | `<Picker icon>` inside `<MenuTrigger asChild>`                                                                                                                               | built                      |
| Search field (`dh-search`; a magnifier inside a 32 px search input; its label for screen readers only, design system Accessibility; spec 007 Q10b) | `<SearchField aria-label placeholder value onChange>`, sized by `className`                                                                                                  | built                      |
| Composer (`dh-composer`, `dh-composer-bar`, `dh-send`; AI Elements' Prompt Input pattern; task and follow-up looks, spec 006 Q3c)                  | `<Composer look canSend pending>` with `<ComposerTextarea label>`, `<ComposerBar>`, `<ComposerHint>`, `<ComposerSend label>`                                                 | built                      |
| Context chip (`dh-context`, `dh-context-row`, `dh-context-remove`; from shadcn `attachment`)                                                       | `<ContextList aria-label>` around `<ContextChip label icon onRemove>`                                                                                                        | built                      |
| Agent chip (`dh-agent-chip`; the sidebar's state words and colours, spec 006 Q3d)                                                                  | `<AgentChip state href asChild>`                                                                                                                                             | built                      |
| WorkItemCard (`dh-card`, `dh-card-top`, `dh-card-meta`, `dh-prio`, `dh-meta-item`, `dh-tag`, `dh-card-action`; 16 px meta icons, spec 006 Q2c)     | `<WorkItemCard itemKey type bug assignee priority due title action>` with `<WorkItemTitle>` and `<WorkItemBuild itemKey>`; `<WorkItemCardSkeleton>`                          | built                      |
| AttentionRow (`dh-row`, `dh-row-main`, `dh-row-title`, `dh-row-sub`; Home's ghost action, spec 006 Q3a; the pill wraps under 480 px, Q4b)          | `<AttentionList>` around `<AttentionRow source title sub reason reasonTone action>` with `<AttentionTitle>` and `<AttentionAction>`; `<AttentionRowSkeleton>`                | built                      |
| FileList (`dh-filelist`, `dh-file`, `dh-file-path`; only the folder part is cut, spec 006 Q3b)                                                     | `<FileList aria-label files current onSelect>`; `<FileListSkeleton rows>`                                                                                                    | built                      |
| DiffView (`dh-diff`, `dh-diff-file`, `dh-diff-line--add/del`; from shadcn `code-block` without Shiki, spec 006 Q6b)                                | `<DiffView path lines>`; `<DiffViewSkeleton lines>`                                                                                                                          | built                      |
| Resume banner (`dh-resume`)                                                                                                                        | `<ResumeBanner title detail action href asChild>`                                                                                                                            | built                      |

## Icons

Icons are outline, 20 px, with a 1.75 stroke. Use `lucide-react`. The `.lucide` base style in `theme.css` sets the size and stroke, so write `<Plus aria-hidden />` with no size props. An icon never stands alone: give it a visible label, or put `aria-label` on its button.
