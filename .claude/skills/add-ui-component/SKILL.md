---
name: add-ui-component
description: Use when a screen needs a design-system component that @devhub/ui does not have yet, or when changing an existing @devhub/ui component. Forbids styling components ad hoc inside packages/app, inventing tokens, and shipping a component without a story and a test.
---

# How to add a component to @devhub/ui

`@devhub/ui` is the design system in code. It imports no other `@devhub/*` package. Every component in it has a story for each state and a test.

## 1. Check the design system first

1. Find the component in `docs/design/design-system.md` (section 3, Components) and its CSS in section 4.
2. Find it in the Components table of `docs/design-map.md`. That table names the component and its props.
3. If the design system does not describe the component, option or colour you need, **stop and ask**. Do not invent one.

## 2. Start from shadcn when one exists

```sh
pnpm --filter @devhub/ui exec shadcn add <name>
```

The config is `packages/ui/components.json`. The output lands in `packages/ui/src/components/<name>.tsx`. If the shadcn MCP server is available (`.mcp.json`), use it to browse the registry first.

## 3. Restyle it to DevHub tokens

shadcn output uses names this theme leaves out on purpose. Rewrite them (full table in `docs/design-map.md`):

| shadcn writes                         | Rewrite to                                                          |
| ------------------------------------- | ------------------------------------------------------------------- |
| `bg-accent`, `focus:bg-accent`        | `bg-subtle`, `focus:bg-subtle`                                      |
| `text-accent-foreground`              | `text-foreground`                                                   |
| `bg-secondary`                        | `bg-raised` (with `border-control` for a secondary button)          |
| `bg-destructive`, `text-destructive`  | `bg-danger`, `text-danger`                                          |
| `text-sm`                             | `text-body` or `text-small` (match the design)                      |
| `text-xs`                             | `text-label`                                                        |
| `shadow-xs`, `shadow-sm`, `shadow-md` | nothing; only menus, popovers and the composer get `shadow-overlay` |
| `rounded-md` on a button or input     | `rounded-sm` (6 px); cards and menus are `rounded-md` (10 px)       |
| `size-4` on lucide icons              | remove it; the `.lucide` base style sets 16 px and 1.75 stroke      |

Then match the `dh-*` CSS: heights (36 px default, 30 px `sm`), padding, gaps, font weight.

## 4. Shape of a component

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';

const pillVariants = cva(
  'inline-flex h-5.5 items-center gap-1 rounded-sm px-2 text-label font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-subtle text-muted-foreground',
        info: 'bg-info-subtle text-info-foreground',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        danger: 'bg-danger-subtle text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);
```

`h-5.5` is 22 px on the 4 px scale. Never write the arbitrary form (`h-[22px]`); `pnpm gate style-policy` rejects it. If the design truly needs a value off the scale, use a one-line exception with a reason:

```tsx
// style-policy-ignore-next-line: 22 px pill height from components.css .dh-pill
```

- Export a typed props interface. Pass `className` through `cn()` last so callers can adjust layout, never colour.
- Use `asChild` (Radix `Slot`) when the component may render a link.
- Icon-only variants require an `aria-label` in the type.

## 5. Story for every state

`packages/ui/src/components/<name>.stories.tsx`: one story per variant and state (default, hover is not a story, but disabled, loading, long text and empty are). Theme, direction and width are toolbar switches in Storybook, so **never** write separate Dark or Mobile stories.

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pill } from './pill.tsx';

const meta = { component: Pill, args: { children: 'In review', tone: 'info' } } satisfies Meta<typeof Pill>;
export default meta;
export const Info: StoryObj<typeof meta> = {};
export const Danger: StoryObj<typeof meta> = { args: { tone: 'danger', children: 'Checks failing' } };
```

Storybook runs axe with `test: "error"`, so an accessibility violation fails the story.

## 6. Test

`packages/ui/src/components/<name>.test.tsx`: render the real component, act like a person (`userEvent`), assert by role, label or text, and run `expectNoAxeViolations(container)` from `@devhub/ui/testing`.

## 7. Export and document

1. Export it from `packages/ui/src/index.ts`.
2. Change its row in the `docs/design-map.md` Components table from "build in the spec…" to "built", with the component name and props. Change nothing else in that file.
3. Run `pnpm storybook` and look at every story in light and dark.

## Don't

- Don't import `@devhub/app`, `@devhub/api-client` or `@devhub/contracts` from `@devhub/ui`.
- Don't add a colour, size or shadow to `theme.css` or `tokens.css`. `tokens.css` comes from the design system; stop and ask.
- Don't mock anything from `@devhub/ui` in any test.
- Don't keep a shadcn class that does nothing in this theme.

## Checked by

`pnpm gate component-coverage` (story + test exist) · `pnpm gate style-policy` · `pnpm gate boundaries` · Storybook a11y · `pnpm test packages/ui`
