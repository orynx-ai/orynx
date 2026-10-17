---
name: build-a-screen
description: Use when building or changing a screen or route in packages/app (Home, Tickets, Session, Settings, or a new place). Forbids raw colours, arbitrary values, ad hoc styled components inside a feature, and screens without a `// Design:` note or without loading, empty and error states.
---

# How to build a screen

A screen is one route in `packages/app`. It is assembled from `@devhub/ui` components and the shell chrome, and it follows a reference design. Read `docs/feature-layout.md` first.

## 1. Find the reference

1. Open `docs/design/screens/`. Each screen has three files:
   - `<screen>.html` is the markup source. Read it for structure, order, copy and `dh-*` classes.
   - `<screen>-light.png` and `<screen>-dark.png` show both themes.
2. Read the matching sections of `docs/design/design-system.md` (component rules, accessibility rules).
3. Read the screen's section of `docs/product/spec.md` for behaviour and copy.
4. If two of these disagree, or a state you need (loading, empty, error) is not shown anywhere, **stop and ask**.

## 2. Create the files

```
packages/app/src/features/<feature>/
├── <feature>-screen.tsx
├── <feature>-screen.test.tsx
├── components/          pieces used only here
└── queries.ts           hooks over api-client queryOptions
```

Register the route in `packages/app/src/router.tsx` with one `createRoute`.

## 3. Start with the design note

The first line of every `*-screen.tsx` must say where the design came from:

```tsx
// Design: docs/design/screens/settings.html — page bar, info callout, Connections tab
```

When there is no reference, say so and give the reason:

```tsx
// Design: none — reuses the Settings page frame unchanged (spec 005)
```

A hook blocks a new screen without this note, and `pnpm gate design-source` fails on it.

## 4. Use the page frame

Every screen is: page bar → optional toolbar → page body. Use the shell, never your own header.

```tsx
// Design: docs/design/screens/tickets.html — page bar, filter toolbar, board
import { PageBar, PageBody, PageBreadcrumb, Toolbar } from '../../shell/page-frame.tsx';

export function TicketsScreen() {
  return (
    <>
      <PageBar
        breadcrumb={<PageBreadcrumb crumbs={[{ label: 'Tickets', to: '/tickets' }, { label: 'Sprint 42' }]} />}
        meta="Ends Oct 24"
      />
      <Toolbar>{/* filter chips, count */}</Toolbar>
      <PageBody>{/* columns */}</PageBody>
    </>
  );
}
```

- `PageBody` picks one of three widths: `wide` (960 px, the default), `narrow` (720 px, sparse pages and Home) or `full` (a large board). It owns the gutter and spacing, so it takes no `className`.
- The one filled `primary` button for the view lives in the page bar actions.
- Breadcrumb: the first item is the sidebar place, the last is `BreadcrumbPage` (plain text, `aria-current="page"`), three items at most.

## 5. Translate the design into code

Follow `.claude/skills/clean-ui/SKILL.md` for layout, type scale, states and copy.

- `dh-*` classes become `@devhub/ui` components. Tokens become theme classes. Use the tables in `docs/design-map.md`.
- If the component you need is marked "build in the spec that first needs it", add it to `@devhub/ui` first with `.claude/skills/add-ui-component/SKILL.md`. Never style it inline in the feature.
- Copy comes from the html reference or the spec, word for word, in sentence case. If no one has given the wording, **stop and ask**.
- Spacing uses the 4 px scale (`gap-2`, `p-3`, `px-6`). Half steps (`p-2.5`) are fine where the component CSS uses them.

## 6. Build all four states

| State   | Rule                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading | A skeleton made from the **real** chrome (the same `PageBar`, the same row heights) so nothing shifts when data lands. Never a spinner over a blank page. |
| Empty   | `<EmptyState title>` that says why it is empty and how things get there ("Nothing in review"). With active filters, say so and offer to clear them.       |
| Error   | One line that says what happened and what to do ("GitHub is not connected. Connect it in Settings."), with a link. The rest of the screen keeps working.  |
| Loaded  | The design.                                                                                                                                               |

Data comes from `queries.ts` hooks (`.claude/skills/server-state/SKILL.md`). UI-only state goes in zustand (`.claude/skills/client-state/SKILL.md`).

## 7. Accessibility

- Real elements: `<nav>`, `<a href>` (via the router `Link`), `<button>`. Tabs use the `@devhub/ui` Tabs (arrow keys work).
- Icon-only buttons have `aria-label`. Places and breadcrumbs carry `aria-current="page"`.
- State is never colour alone: icon shape + word + colour ("! Needs you").
- Approvals use `role="alert"`. Live agent output sits in `aria-live="polite"`.
- Hit targets: 32 px tall in dense rows, 40 px elsewhere. Text is never smaller than 12 px.

## 8. Test it

- `<feature>-screen.test.tsx` renders the real app with `await renderApp({ route: "/tickets" })` from `packages/app/src/test/render.tsx`, fakes only the network with MSW, and finds things by role, label or text. See `.claude/skills/honest-tests/SKILL.md`.
- Cover each state: loading, empty, error, loaded.

## 9. Look at it in a real browser

1. `pnpm dev`, then open http://localhost:4318.
2. Check at 360 px and 1280 px wide, in light and dark (Settings › Appearance, or set `data-theme` on `<html>`).
3. Compare with `<screen>-light.png` and `<screen>-dark.png`.
4. Watch the load: no layout shift between the skeleton and the loaded page.
5. Tab through the screen: the skip link comes first, and every control shows the focus ring.

If the Playwright MCP server is available (`.mcp.json`), use it to take screenshots at both widths and in both themes, and attach them to the PR.

## Don't

- Don't write raw hex/rgb, `p-[13px]`, `text-sm`, `shadow-md`, `bg-gray-100` or `dark:`.
- Don't add a second filled `primary` button to a view.
- Don't fetch in `useEffect` or copy query data into `useState`.
- Don't build a skeleton that looks like the page but is made of different elements.
- Don't invent copy, tokens or states the design does not show.

## Checked by

`pnpm gate design-source` · `pnpm gate style-policy` · `pnpm gate component-coverage` · `pnpm gate test-policy` · `pnpm test packages/app` · the design-reviewer agent during `/review`
