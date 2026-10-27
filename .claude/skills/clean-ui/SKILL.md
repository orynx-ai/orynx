---
name: clean-ui
description: Use whenever building, changing or reviewing anything a person sees in packages/ui or packages/app (a screen, the shell, a component, copy, a loading or empty state). Forbids a fourth page width, padding and max-width on the same element, page-level className overrides on the page frame, type off the five-size scale, weight 600 or 700, boxed or iconed empty states, spinners for work whose layout is known, and copy with "we", "please", "sorry" or "!".
---

# Clean UI

A screen feels clean when it makes very few choices and makes each one in a single shared place: one spacing scale, one page frame, one focus ring, one voice. This skill is the DevHub version of the Clean UI principles. The full, tool-agnostic text is in [principles.md](principles.md); read it once, then use this page while you work.

Where this page and `docs/design/design-system.md` disagree, colour and component identity come from the design system, and layout, scale, states and copy come from here. Where `principles.md` gives a number (14 px default text, `rounded-xl`), this page's DevHub mapping wins. Anything else that disagrees: **stop and ask**.

## 1. Page layout: use the frame, never your own

Every route is `PageBar` → optional `Toolbar` → `PageBody` from `packages/app/src/shell/page-frame.tsx`.

| `PageBody width` | Max width | Use for                                                      |
| ---------------- | --------- | ------------------------------------------------------------ |
| `wide` (default) | 960 px    | Lists, settings, detail pages: anything not obviously sparse |
| `narrow`         | 720 px    | Sparse pages, Home, every chat or reading column             |
| `full`           | none      | Only a large board or table that 960 would squeeze           |

- **No fourth width.** If none fits, it is a design question: stop and ask.
- **The frame owns its geometry.** `PageBar` and `PageBody` take no `className`. Gutter (16 px phone, 48 px from 768 px), rhythm (24 px between sections, 24 px on top, 32 px below) and the measure live inside them. Change the frame, never the call site.
- **Padding and max-width sit on different elements.** The gutter is on an outer wrapper and the measure on an inner one, or a "960 column" silently renders 864.
- **One state per page bar:** a breadcrumb, or tabs, never both. The bar is one 56 px line with a bottom hairline at every width: a long crumb is cut, and under 768 px the meta hides. The page's one `primary` button lives in its actions; on the Session page it lives in the next-move bar under the title instead (spec 048).
- **The page bar and the sidebar stay in place** (the user's call, 17 Oct 2026): the bar sticks to the top while the body scrolls under it (`scroll-padding-top` keeps focused things out from under it), and from 768 px the sidebar stays as tall as the window. Only the window scrolls; never add a scroll box around the page body. One exception: from 1024 px the Session page is the window's height and its two panes scroll on their own, the follow-up box at the left pane's foot (spec 048, the user's call, 27 Oct 2026).
- **The bar spans the pane; the column is centred under it.** At wide widths the crumb and the column do not line up. That is intended, as in the reference screens.
- **One width per tab group.** Tabs under one strip share the wider measure, so nothing jumps when you switch.

## 2. Type: five sizes, two weights

| Class           | Size / line | Use for                                           |
| --------------- | ----------- | ------------------------------------------------- |
| `text-label`    | 12 / 16     | Pills, counts, keyboard hints. Nothing smaller    |
| `text-small`    | 14 / 20     | Meta lines, helper text, the second line of a row |
| `text-body`     | 16 / 24     | Default: nav, rows, buttons, body (the root size) |
| `text-title`    | 18 / 28     | Section and panel headings                        |
| `text-title-lg` | 20 / 28     | The page title                                    |
| `text-display`  | 40 / 48     | The Home greeting only, `font-serif`              |
| `text-code`     | 14 / 20     | `font-mono`: keys, branches, paths, diffs         |

- **Weights are `font-normal` (400) and `font-medium` (500).** Never `font-semibold` or `font-bold`; the 600 face is not even bundled.
- **The line height belongs to the size.** Never add `leading-*` next to a text size; if it looks wrong, the size is wrong.
- **Hierarchy comes from colour before size.** Title in `text-foreground`, supporting text and meta in `text-muted-foreground`.
- **One-line labels truncate** (`truncate`) and stay readable through `title` when the text can be long (session titles, crumbs).

## 3. Size and density

| Thing                                   | Size                                      |
| --------------------------------------- | ----------------------------------------- |
| Icons (`<Icon>`, Hugeicons)             | 20 px, 1.5 stroke. Never pass a size prop |
| `Button` default / `sm`                 | 40 px / 32 px tall                        |
| Sidebar rows (places, New task, Search) | 40 px                                     |
| Page bar / Tabs                         | 56 px / 48 px                             |
| Hit targets                             | 32 px in dense rows, 40 px elsewhere      |

## 4. Components and colour

- Use the real `@devhub/ui` part, never a lookalike; if it is missing, follow `.claude/skills/add-ui-component/SKILL.md`. Never invent a prop or variant.
- Colours, radii and shadows are tokens from `docs/design-map.md`. The accent (`info`) is the brand's ink, never blue (18 Oct 2026); it only marks links, focus and the selected item.
- **Selected items reuse the design system's marks, never a new one:** a place is `bg-subtle` with its icon in `text-info`, the open session row is `bg-raised` with a hairline, a tab has the `info` underline. All of them carry `aria-current` or `aria-selected`.
- **Cards don't hold cards.** A bordered panel never contains another bordered or dashed box.
- **The same name looks the same everywhere** (colour, weight, casing), and one concept has one word across the app.

## 5. States

| Situation                                       | Show                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Content whose layout is known                   | The real chrome with the data slots empty or a skeleton of the same geometry |
| Long work with measurable progress              | A progress bar                                                               |
| A button that stays on screen during its action | Disabled, with a small spinner inside it                                     |
| A button that navigates or closes a dialog      | Nothing                                                                      |
| Synchronous work                                | Nothing                                                                      |

- **Empty state** (`EmptyState`): plain centred text, no border, no icon, no card. The title states the state, the line says what will appear and how ("Nothing needs you yet" / "Connect Jira, GitHub or Slack and…"). Add an action only when the reader can act from here.
- **Error:** a title naming what failed and a "Try again" button. Never auto-retry a write.
- **No jump on load.** Skeleton and loaded view have the same geometry; hard-reload every page you touch and measure CLS, don't eyeball it.

## 6. Focus, keyboard and motion

- One focus ring everywhere (`:focus-visible` in `theme.css`), in ink; never remove or restyle it per component. Toggles never drop focus. The one exception is a menu row: Radix focuses the row under the pointer, so its focus mark is the 4 px ink bar on `bg-subtle` instead (the user's call, 18 Oct 2026).
- Links navigate (`<a href>` / router `Link`), buttons act. Anything that goes somewhere is a link, a logo included.
- Prefer logical classes in new code: `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`.
- Motion: 150–200 ms, colour and opacity first, never `transition-all`, and only under `motion-safe:`. The shared motion lives in `theme.css`: every link, button, input, menu row and tab fades its colours over 150 ms, the focus ring settles in, menus grow out of their trigger (`animate-menu-in`, `animate-menu-out`), and a new tab panel or alert fades in (`animate-fade-in`). Use those; don't add a component's own.

## 7. Copy

These rules are for new copy. Copy that a screen design or the spec gives word for word stays as given (the Home greeting "What should we build today?"); if it breaks a rule, raise it with a person instead of rewriting it.

- The product is **Orynx** in every word the user sees, including errors and terminal lines. DevHub is only the code name for packages, settings and folders.
- Sentence case everywhere. Speak to "you"; the product never says "we" or "I".
- No "Please", "Sorry", "Oops", no exclamation marks. A full sentence ends with a period; a label does not.
- Errors: "Couldn't load sessions" + **Try again** (never "Retry", "Something went wrong" or "[X] failed").
- Loading text uses one ellipsis character: "Checking…".
- Never build visible text by joining strings; counts use real plurals.

## 8. Check it in the browser

1. `pnpm dev`, open http://localhost:4318.
2. Look at 360, 768, 1280 and 1440 px, light and dark. No sideways scroll at any width.
3. Hard-reload and watch the load; measure CLS with a `layout-shift` PerformanceObserver.
4. Tab through: the skip link first, every control shows the ring.

## Stop and ask when

- a value has no token, or the design gives a raw number instead of a named style
- you need a fourth width, a sixth text size or a third weight
- a state (hover, focus, disabled, loading, empty, error) is never drawn
- two sources (spec, screens, design system, this skill) disagree

## Checklist

- [ ] `PageBody` width is `narrow`, `wide` or `full`; no `className` on the frame
- [ ] Type uses the five sizes and two weights; no `leading-*` beside a size
- [ ] Every colour, radius and shadow is a token; icons carry no size props
- [ ] No box inside a box; empty states are plain text
- [ ] Loading, empty and error states exist and match the loaded geometry
- [ ] One focus ring; links navigate, buttons act
- [ ] Copy is sentence case, "you" not "we", no "please" or "!"
- [ ] Checked at 360 and 1280 px in light and dark, with CLS measured

## Checked by

`pnpm gate style-policy` (tokens) · `pnpm test` (behaviour) · the design-reviewer agent during `/review` (layout, scale, states, copy)
