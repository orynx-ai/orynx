# Clean UI Principles

Oct 17, 2026 · @Unknown

A clean interface comes from a small set of decisions made once and applied everywhere: one spacing scale, one header, one focus ring, one voice. This guide lists those decisions, written so they carry to any product, stack or design system.

**How to read it**

- Each rule is stated tool-agnostically, then followed by _Why_ or an _Example_ where it helps.
- Where a rule names a shared part (a top bar, a page column, an empty state), map it to your own design system's equivalent.
- The last section is a one-page checklist you can paste into a PR template, a design review, or an AI coding prompt.

## Core philosophy

A product feels clean when it allows very few choices per screen, and makes each one in a single shared place. Seven ideas sit under every rule that follows.

1. **Decide once, reuse everywhere.** A value written in two places drifts on the first change that should hit both. One real audit of page widths found eleven spellings of two numbers, six of them wrong. The fix was one component that owns the number.
2. **Fewer options, not more.** Three page widths, one vertical rhythm, one header, one focus ring, one selected-item style. Restraint is what reads as "clean".
3. **Shared parts own their geometry.** Layout components accept no `className` or style override. A caller who can pass padding can reintroduce the bug the component removed.
4. **Derive values, never eyeball them.** Every size, colour, weight and gap comes from a design token read off the design, not from a screenshot or memory. A guessed value and a derived one look identical in code, so the guess becomes invisible.
5. **The same thing looks the same everywhere.** A name in a trigger and the panel it opens share colour, weight and casing. A concept has one word across the whole product.
6. **Every state is designed.** Loading, empty, error, disabled, focus and hover are part of the screen, not polish added later.
7. **Inclusive is the default, not a variant.** Light, dark, high contrast, right-to-left, keyboard and screen reader all work on day one. They are switches you flip to verify, not separate screens you build.

## Layout and spacing

Every signed-in page uses one of three content widths, one gutter, one vertical rhythm and one top bar. That sameness is most of what makes the app feel calm as you move between pages.

**Page width: three measures, chosen by density**

| Measure        | Width               | Use for                                                        |
| -------------- | ------------------- | -------------------------------------------------------------- |
| Wide (default) | 960 px              | Lists, settings, detail pages: anything not obviously sparse   |
| Narrow         | 720 px              | Sparse pages and every chat or reading column, for line length |
| Full           | No cap, gutter kept | Only a genuinely large data table that 960 would squeeze       |

- **Never invent a fourth width.** 948, 976, 1024 and 1104 all crept in when pages set their own. If none of the three fit, that is a design question, not a code decision.
- **One width per tab group.** Tabs under one strip share a measure; take the wider one the worst-case tab needs, so content does not jump when switching tabs.
- **Full still keeps the gutter.** It fills the pane, never the browser edge.

**Gutter and rhythm**

- Gutter: 16 px on mobile, 48 px from the tablet breakpoint up.
- Vertical rhythm: 24 px gap between page sections, 24 px above the content, 32 px below it.
- **Keep padding and max-width on different elements.** Padding on the same box as a max-width is subtracted from the inside, so a "1024 box with 24 px padding" silently renders 976. Put the gutter on an outer wrapper and the measure on an inner one.
- **Never double a gutter.** Before wrapping a body that already pads itself, check its root; two insets stack.

**One top bar for every route**

- A single slim bar (about 56 px, bottom border) carries the back action, the page title or breadcrumb or sibling tabs, and page-level actions. Every team composes the same component.
- **One state per bar:** a title, _or_ a breadcrumb, _or_ tabs, never two at once.
- Long titles truncate to one line and stay readable through a native tooltip.
- A small mark (avatar for a person, logo for a product) can lead the title. It sizes itself from position; callers never pass a size.
- Keep this bar separate from content headers (a big profile block), section headers and dialog headers. Those have their own patterns.

_Why:_ One codebase had four hand-built top bars that disagreed on logo fallback, gap and breadcrumb colour, and eight different vertical insets across 960-wide pages. One shared part fixed both.

## Typography and hierarchy

Use five text sizes and two weights, and get hierarchy from size and colour rather than heavy type. A small, strict scale is the cheapest way to look composed.

| Style       | Size / line height | Typical use                                       |
| ----------- | ------------------ | ------------------------------------------------- |
| Extra small | 12 / 16 px         | Meta, timestamps, helper text, chips              |
| Small       | 14 / 20 px         | Default UI text: table cells, labels, menus, body |
| Base        | 16 / 24 px         | Reading text, card and section titles             |
| Large       | 18 / 28 px         | Page-level section headings                       |
| Extra large | 20 / 28 px         | Page titles                                       |

- **Two weights only: regular (400) and medium (500).** The "bold" token is 500, not 700. Semibold (600) is never used. Medium is enough to separate a title from body without shouting.
- **Line height belongs to the size.** Each size ships with its own leading; never set a separate line height next to it. A hand-set leading is usually the sign that the size itself was guessed.
- **Hierarchy through colour, not just size.** Pair main, subtle and muted foreground tokens: title in main, supporting text in subtle, meta in muted.
- **One line labels truncate, and stay recoverable.** Titles, names and crumbs clip with an ellipsis and expose the full value through a tooltip, so a long name never breaks a row.
- **Pick the style by name, not by pixel.** 12 and 14 px are both legal; only the design's named style says which one applies. Choosing the nearest size "by eye" is one step off and invisible in review.

_Example:_ page title in extra large medium, card title in base medium, body and table cells in small regular, timestamps in extra small regular with a muted colour.

## Color, tokens and theming

No colour, size or shadow is ever written as a raw value; everything is a semantic token, which is what lets one screen render correctly in light, dark and high contrast without a second design.

**Name colours by role, not by hue**

| Role family | Example token names                                     | Use                                              |
| ----------- | ------------------------------------------------------- | ------------------------------------------------ |
| Foreground  | main, default, subtle, muted, ghost, on-brand, inverted | Text and icons, from strongest to faintest       |
| Background  | main, default, subtle, muted, overlay                   | Page, surfaces, hovered or selected rows, scrims |
| Border      | muted, default, strong                                  | Dividers, card edges, input outlines             |
| Brand       | default, link, muted                                    | Primary action, links, selected markers          |
| Focus       | default, error                                          | The one focus ring, and its error variant        |

- **Banned in code:** hex, named colours, raw px or rem for spacing, type or radius, inline shadows, numeric z-index, magic breakpoints. If no token fits, the design or the system needs a change; ask instead of picking the nearest.
- **Use brand colour sparingly.** Keep it for the primary action, links and the selected state, so it still means "act here".
- **Spacing and radius come from one scale.** Use a 4 px base (`spacing/4` = 16 px) and named radii (`rounded-xl` = 12 px).

**Themes are a switch, not a redesign**

- Offer light, dark, high contrast and a system option. An accessibility-first default is high contrast until the user picks.
- **"System" must actually follow the OS** (`prefers-color-scheme`). Exercise it; don't trust the label.
- **Paint the theme on the server.** The choice is saved to the account and mirrored in a cookie, so the first paint is already correct: no flash of the wrong theme.
- **Check contrast in every theme.** Target WCAG 2.2 AA (4.5:1 for text). The muted text token is the usual offender and can miss 4.5:1 in every theme; measure your faintest text token early.

_Gotcha worth knowing:_ a utility class that combines a token with an unexpected prefix (for example a border colour used as a ring) can compile to nothing, with no error. Check that the exact class exists in the built theme, or read the CSS variable directly.

## Components and consistency

Every visible part comes from one design system, or from one shared app component built on it; nothing is a lookalike. Consistency across screens is what users read as quality.

- **Use the real component, never a lookalike.** Separators, dividers, focus rings, selection styles and buttons come from the design system. A hand-drawn copy drifts the first time the original changes.
- **Check for a shared pattern before composing your own.** Some patterns live above the design system: the top bar, page column and empty state should each be one shared app component. Assembling a breadcrumb, tabs and a back button into "a header" is how five headers appear.
- **Never invent a prop or variant.** Look it up in the component's docs. If it isn't documented, it doesn't exist, and the gap is a question for the design system team.
- **One selected-item style everywhere.** Pick a single highlight-plus-indicator treatment and use it in every list, menu and nested menu. The selected marker aligns exactly with the row it marks.
- **The same identity looks the same everywhere.** If a name shows in a trigger and in the panel it opens, colour, weight and casing match.
- **Compose, don't configure.** Prefer small parts that slot together (`Bar` > `Main` > `Title`) over one component with many layout props. Keep primitives thin: the caller supplies copy and actions, so one empty state serves "No projects yet" and "No results" without a growing `variant` list.
- **Shared parts own their geometry.** No `className` or style override on layout primitives, at runtime as well as in types. If the part can't express the design, change the part, don't patch the call site.
- **Check an icon by its shape, not its name.** Icon sets ship near-identical names for different glyphs (one team shipped `ArrowUp01`, a bare chevron, where `ArrowUp02`, a full arrow, was meant).

_Example:_ the empty state is plain centred text: a title, an optional line and an optional action. No border, no icon, no card. One shared version replaces the dashed-box-and-icon variants teams otherwise build on their own.

## States and feedback

Every screen designs its loading, empty, error and disabled states up front, and shows feedback only when the user is actually waiting. A product that never flashes, jumps or spins needlessly feels fast even when it isn't.

**Pick the right loading signal**

| Situation                                                           | Show                                             |
| ------------------------------------------------------------------- | ------------------------------------------------ |
| Content whose layout is known                                       | A skeleton shaped like the final layout          |
| Long work with measurable progress                                  | A progress bar                                   |
| A button that stays on screen while an in-place save or delete runs | Disable it and show a small spinner inside it    |
| A button that navigates away or closes a dialog                     | Nothing; it unmounts before a spinner could help |
| Synchronous work                                                    | Nothing at all; a loader here is just a flash    |

- **Skeletons match the loaded layout exactly.** Same width, same rhythm, so nothing jumps when data lands. Even a 32 px mismatch between skeleton and loaded view reads as a jump.
- **No hydration flashes.** Hard-reload every page you touch. A primary action that disappears and reappears on load is a bug, not a polish item.
- **Respect reduced motion.** Spinners and animations run only when the user hasn't asked for reduced motion.

**Empty states**

- The title states the state; the body says what will appear here. "You're all caught up." / "Anything needing your attention will appear here."
- Add an action only when the reader can do something from here.
- Announce an empty result to screen readers only when it came from the user's own action (a search or filter that matched nothing). A page that simply has no data yet should not re-announce itself on every visit.

**Errors**

- Scope failures. Each area of the app has its own error boundary, so one broken section never takes down the whole page.
- An error block is a title naming what failed, one line of recovery, and a "Try again" button. "Couldn't load Reports" / "Try again in a moment."
- Retry transient failures automatically, at most three attempts with backoff. **Never auto-retry a write**: repeating a save or delete can do it twice.

**Time and live data**

- Relative times keep ticking. One app showed a five-minute-old notification as "in 2 hours" because the clock was frozen at page load.
- Format a value with one shared helper wherever it appears. A chart axis, its tooltip and its table drifted apart when each formatted the same date on its own.

## Interaction, focus and keyboard

A keyboard user should always see where they are and never lose their place. Treat a dropped or invisible focus as a bug, not as polish.

**Focus**

- **One focus ring, one colour, everywhere.** Never fall back to the browser's default outline. Focus colour does not change between components.
- **Give the ring breathing room.** About 4 px between the element and its outline, unless the design system specifies otherwise.
- **Draw rings inside full-bleed panels.** A scroll pane that touches its container's edges clips an outside ring, so pull the ring 2 px inside.
- **Keyboard toggles never drop focus.** After a collapse, expand, open or close, focus stays on a sensible target.
- **Send focus somewhere real when its origin disappears.** If a dialog's action removes the button that opened it (for example, unassigning a row), move focus to a nearby control. Otherwise it falls to the page body and the next Tab restarts from the top.
- **Never pull a tab stop out from under focus.** If content streams in while the user is focused on a placeholder, keep focus where it is.

**Keyboard and semantics**

- **Links navigate, buttons act.** Anything that goes somewhere is a real link with an `href`, including the logo or brand mark. Anything that does something is a `button`.
- **Scrollable regions must be reachable.** A scrolling panel with nothing focusable inside it gets a tab stop, so keyboard users can scroll it.
- **Use native elements before ARIA.** A `<button>` is already a button; don't restate the role. Reserve ARIA for genuinely custom widgets.

**Hover, active and selected**

- Design and verify hover, focus, active and disabled for every interactive element. They are invisible in a static screenshot, so open the screen and enter each state by hand.
- The cursor matches the affordance: pointer on clickable things, default on static text.

## Writing UI copy

Good UI copy is plain, direct and calm: it says what happened and what you can do, in sentence case, with no apology and no exclamation marks. Copy is half of what makes an interface feel clean.

**Voice**

- Speak to the user as "you". The product never says "we" or "I": "Couldn't load the roles", not "We couldn't load the roles". Legal and privacy copy is the exception, since the company is the party speaking.
- No "Please", "Oops" or "Sorry". No exclamation marks. No celebration.
- Plain words only. No internal jargon, raw field names or terms used nowhere else in the product.
- **One concept, one name.** Before writing a label, search the existing copy and reuse the word that already ships.

**Mechanics**

- Sentence case everywhere: titles, buttons, tabs, menus, labels, toasts. Capitalise only the first word and proper nouns.
- A full sentence ends with a period; a fragment (heading, label, button, chip) does not.
- Use a single ellipsis character (…), and only on in-progress states.
- Every count uses real plural rules, never "item(s)".
- Never build visible text by joining strings in code. It can't be translated or reviewed.
- A symbol that carries meaning (\~108%, ↑18%) gets an accessible label that says it in words.

**Patterns**

| Surface          | Pattern                                      | Example                                                                   |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| Error toast      | Couldn't \[verb\] the \[object\]. Try again. | Couldn't save the roles. Try again.                                       |
| Page error title | Couldn't load \[page or object\]             | Couldn't load Reports                                                     |
| Page error body  | Recovery only; never repeat the title        | Try again in a moment.                                                    |
| Retry button     | Try again                                    | Try again (not "Retry")                                                   |
| Validation       | Say what to enter                            | Use 50 characters or fewer.                                               |
| Loading          | Loading \[thing\]…                           | Loading reports…                                                          |
| Empty state      | State, then what will appear                 | You're all caught up. / Anything needing your attention will appear here. |
| Button or link   | Verb first, add the object if needed         | View reports, Add source                                                  |
| Helper text      | Add what the label doesn't say               | Heading "Action needed", subtitle "Approvals and alerts waiting on you"   |
| Auth             | Sign in, Sign out                            | Not "Log in" or "Logout"                                                  |

_Banned phrases:_ "Something went wrong", "An error occurred", "\[X\] failed", "Invalid…", "Click here", "Please try again".

## Accessibility, RTL and i18n

Target WCAG 2.2 AA with zero automated violations, mirror fully for right-to-left languages, and keep every visible word in translation files. These are build requirements, never a later pass.

**Accessibility**

- **Zero axe violations, colour contrast included,** on every component's main render and every story.
- **Automated checks cover one configuration.** A typical run tests one theme, left-to-right only; flip to dark and RTL and check by hand.
- **Lint for the static mistakes:** missing `alt`, unnamed buttons, positive `tabIndex`.
- **Test what the user perceives.** Query by role, label and visible text, not by test IDs. An attribute like `data-collapsed="true"` doesn't prove the content is hidden.

**Right-to-left**

- **Use logical CSS, never physical.** Start and end, not left and right: `ms-4` not `ml-4`, `start-0` not `left-0`, `text-start` not `text-left`.
- **Mirror directional icons:** chevrons, arrows, back buttons.
- **Check third-party UI too.** Tables, overlays and embedded tools must mirror as well.
- **Use the platform for locale facts.** Ask `Intl` for text direction, currency and calendar rather than keeping a hand-written map.

**Internationalisation**

- **No hardcoded user-facing text,** including `title`, `placeholder`, `aria-label` and `alt` values. Keyboard notation such as ⌘U is the rare exception.
- **Labels are copy; identifiers are code.** A product label such as "Acme Home" is a translation string, while the code uses the stable slug `home`. A rebrand then touches only the locale files.
- **Leave room for longer languages.** Truncate one-line labels with a tooltip instead of letting them wrap into the layout.
- **Tests assert the rendered English, not the key.** A test that finds "projects.header.create" on screen means the translations aren't wired.

## Responsive and motion

Layouts are built mobile-first and checked at five widths; motion is short, subtle and switched off for anyone who asks. Page-to-page transitions are unnecessary.

**Responsive**

| Check width  | px   |
| ------------ | ---- |
| Phone (sm)   | 393  |
| Tablet (md)  | 768  |
| Laptop (lg)  | 1024 |
| Desktop (xl) | 1280 |
| Wide         | 1632 |

- **Mobile-first, named breakpoints only.** No ad hoc `min-width: 900px` values.
- **No overflow or clipping at any width.** The page never scrolls sideways; a wide table scrolls inside its own container with a minimum width.
- **Design tables against the content width.** Size columns as proportions of the 960 px measure, so they adapt instead of needing full width.
- **Reserve room for floating controls.** On mobile the top bar keeps clear space for the floating navigation button, so titles never sit underneath it.
- **Give full-height pages a real height.** A scroll area inside a page that has no defined height collapses to zero and hides its content.

**Motion**

- **Animate colour and opacity first, transform second.** Colour transitions should be the most common, then opacity, then transform. `transition-all` is almost never used.
- **Keep it short:** 150 to 200 ms for most state changes.
- **Gate it on reduced-motion preferences.** Spinners and movement run only under `prefers-reduced-motion: no-preference`.
- **Motion explains a change; it never decorates.** Each custom animation should mark a change: a panel sliding in, a field flashing after an update, a new node appearing. No bounce, no celebration.

## Design fidelity process

A build matches its design when every value is read from the design and the result is compared against it before anyone calls it done. Matching "by eye" afterwards never catches the value that was one step off.

1. **Build only from a design marked ready.** Drafts, explorations and in-progress frames start a conversation; they are not a spec.
2. **Read every frame before writing code.** Note what the screen is for, which states exist, what differs from the screen next door, and anything that looks undecided.
3. **Derive each value from its token name, not its pixels.** Read the spacing step, type style and colour role the design names. A screenshot can't tell you type: a 16 px tall text box fits both 12/16 and 14/16.
4. **Record where values came from.** Put the frame link and the style names you read at the top of the component. A link on its own doesn't prove the frame was read.
5. **Compare side by side.** Overlay design and build at the same canvas size, with a slider between them. Never shrink the viewport to a small frame's width; that triggers the mobile layout and every finding becomes noise.
6. **Give every finding evidence and an owner:** the build, the data, the capture, the design file, or intentional. "Not pixel perfect" with no owner is a to-do, not a finding.
7. **Done means verified.** No open findings, frames marked complete in the design file, and a reviewer has re-run the comparison.

**Stop and ask when**

- a design value has no matching token
- a value is a raw number in the design file rather than a named variable
- two frames disagree about the same component
- a state is never drawn: hover, focus, disabled, error, empty or loading
- a surface that needs one has no dark, high-contrast, right-to-left or narrow frame

Stopping costs a question. Guessing costs the build, the review and the rework, and the guess is invisible by then.

## One-page checklist

Run this before calling any screen done. Every line maps to a section above.

**Layout**

- [ ] Content width is one of three: 720 narrow, 960 wide (default), or full for a large table
- [ ] Gutter 16 px mobile, 48 px tablet and up; padding and max-width sit on different elements
- [ ] Section gap 24, top 24, bottom 32; all tabs in a group share one width
- [ ] The route uses the one shared top bar, with one state: title, breadcrumb or tabs

**Visual**

- [ ] Every colour, size, spacing, radius and shadow is a token; no hex, px, named colour or z-index number
- [ ] Five text sizes, two weights (400 and 500); no separate line height beside a size
- [ ] Brand colour only on the primary action, links and the selected state
- [ ] Correct in light, dark and high contrast; text meets 4.5:1 in each

**Components**

- [ ] Real design-system parts, no lookalikes; no invented props or variants
- [ ] One selected-item style across all lists and menus; markers align with their row
- [ ] The same name looks the same in every place it appears

**States**

- [ ] Loading, empty, error, disabled, hover and focus are designed and entered by hand
- [ ] Skeleton for known layouts, progress bar for measurable work, nothing for synchronous work
- [ ] Spinner only on a button that stays on screen during an in-place action
- [ ] Hard reload shows no flash; skeleton and loaded view have the same geometry

**Interaction and access**

- [ ] One visible focus ring everywhere; focus never drops after a toggle or a removed trigger
- [ ] Links navigate, buttons act; the logo is a real link
- [ ] Zero automated accessibility violations; dark and right-to-left checked by hand
- [ ] Logical CSS (start and end); directional icons mirror in right-to-left
- [ ] No layout break or sideways scroll at 393, 768, 1024, 1280 and 1632 px
- [ ] Animations are short (150 to 200 ms) and off under reduced motion

**Copy**

- [ ] Sentence case; no "Please", "Sorry", "Oops" or exclamation marks; never "we"
- [ ] Errors say "Couldn't \[verb\] the \[object\]" plus a "Try again" action
- [ ] Every string comes from translation files; real plural rules for counts

**Prompt version** — paste into an AI coding assistant or a project rules file:

```markdown
UI rules:

- Page content width: 720 (sparse/chat), 960 (default), or full (large tables only). Gutter 16px mobile, 48px tablet+. Padding and max-width on separate elements.
- Vertical rhythm: 24px between sections, 24px top, 32px bottom.
- One shared top bar per route; one state (title OR breadcrumb OR tabs).
- Tokens only: no hex, raw px, named colours, inline shadows or numeric z-index.
- Type: 12/16, 14/20, 16/24, 18/28, 20/28. Weights 400 and 500 only. Never set line height separately.
- Use design-system components; never invent props. One selected style everywhere.
- States: skeleton for known layouts, progress for measurable work, spinner only on an in-place button, nothing for sync work. No hydration flashes.
- Empty state: plain centred title + optional line + optional action. No icon, no box.
- Focus: one ring, visible offset, never dropped after toggles. Links navigate, buttons act.
- Accessibility: WCAG 2.2 AA, logical CSS for RTL, mirrored directional icons, no hardcoded strings.
- Motion: 150-200ms, colour/opacity first, gated on prefers-reduced-motion.
- Copy: sentence case, "you" not "we", no please/sorry/!, errors = "Couldn't <verb> the <object>. Try again."
- If a value has no token or a state isn't designed: stop and ask, never guess.
```
