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

| Design style              | Classes                        | Use for                                        |
| ------------------------- | ------------------------------ | ---------------------------------------------- |
| `display` 32/40 serif 400 | `font-serif text-display`      | the Home greeting only                         |
| `title-lg` 20/28 600      | `text-title-lg font-semibold`  | page title                                     |
| `title` 15/22 600         | `text-title font-semibold`     | section and panel headings                     |
| `body` 14/20 400          | `text-body` (the root default) | default text                                   |
| `body-strong` 14/20 500   | `text-body font-medium`        | card titles, nav labels, buttons               |
| `small` 13/18             | `text-small`                   | meta lines, helper text                        |
| `label` 12/16 500         | `text-label font-medium`       | pills, counts, section labels; nothing smaller |
| `code` 12/20 mono         | `font-mono text-code`          | keys, branches, paths, diffs                   |

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

| Design system                                                                                                                | `@devhub/ui`                                                           | Status                                |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| Button (`dh-btn--primary/secondary/ghost/danger`, `--sm`, `--icon`)                                                          | `<Button variant size>`                                                | built                                 |
| Keyboard hint (`dh-kbd`)                                                                                                     | `<Kbd>`                                                                | built                                 |
| Avatar (`dh-avatar`)                                                                                                         | `<Avatar>`                                                             | built                                 |
| Pill (`dh-pill`, `--info/success/warning/danger/plain`)                                                                      | `<Pill tone>`                                                          | built                                 |
| Breadcrumb (`dh-breadcrumb`)                                                                                                 | `<Breadcrumb items>`                                                   | built                                 |
| Tabs (`dh-tabs`, `dh-tab`, `dh-count`)                                                                                       | `<Tabs>`, `<TabsList>`, `<TabsTrigger count>`, `<TabsContent>` (Radix) | built                                 |
| EmptyState (`dh-empty`)                                                                                                      | `<EmptyState title>`                                                   | built                                 |
| Callout (`dh-callout--warning/info`)                                                                                         | `<Callout tone title>`                                                 | built                                 |
| SourceMark (`dh-source--jira/github/slack`)                                                                                  | `<SourceMark source>`                                                  | built                                 |
| SidebarNav, PageHeader (`dh-sidebar`, `dh-pagebar`, `dh-toolbar`, `dh-pagebody`)                                             | `packages/app/src/shell/*`                                             | built (app chrome, not ui)            |
| SidebarNav session (`dh-session`, `dh-session-icon--wait/run/done`)                                                          | `<SessionItem title source state asChild>`, `sessionStateLabels`       | built                                 |
| Resize handle (no `dh-` class; sidebar resizing decided in spec 001 Q10)                                                     | `<Splitter value min max onValueChange defaultValue step aria-label>`  | built                                 |
| SegmentedControl, Stepper, Input, Menu, Composer, WorkItemCard, AttentionRow, FileList, DiffView, Choice card, Resume banner | —                                                                      | build in the spec that first needs it |

## Icons

The design system draws outline icons at 16 px with a 1.75 stroke. Use `lucide-react`. The `.lucide` base style in `theme.css` sets the size and stroke, so write `<Plus aria-hidden />` with no size props. An icon never stands alone: give it a visible label, or put `aria-label` on its button.
