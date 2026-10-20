# DevHub Design System

The look, rules and building blocks for DevHub, the local-first developer workspace. Version 1.1, October 2026.

**1.1 (17 Oct 2026):** type, icons and control sizes follow the Clean UI scale (`.claude/skills/clean-ui/SKILL.md`): 16px body, two weights (400 and 500), 20px icons, 40px controls, a 56px page bar and a 300px sidebar. Colours and tokens.css are unchanged. Three components changed shape: EmptyState lost its dashed outline, PageHeader keeps the page bar on one line over a column of three widths, and Breadcrumb moved to `body` size on one line. The screens in `docs/design/screens/` were drawn at the 1.0 sizes; read their sizes through this page.

**Provisional until spec 006 builds them:** sizes for components not built yet were scaled from 1.0, not chosen by a person: Input 40px (search inset 40px), menu rows 40px with 14px descriptions, the Composer's send button 36px, SegmentedControl segments, pickers, toolbar filter chips and context chips 32px, the context chip's remove button and the agent chip 24px (under the 32px hit-target minimum), nav counts 20px, Stepper and activity dots 24px, status icons 20px, and meta and priority icons 16px (a second icon size). The nav and menu section labels also moved from 12px/500 to 14px/400. Confirm each when its component is built.

Contents: 1. Brand guide · 2. Tokens · 3. Components · 4. CSS (tokens.css and components.css)

---

## 1. Brand guide

DevHub is a local-first workspace for developers. It puts the Jira tickets, GitHub pull requests and Slack messages that need you in one place, and lets you hand a ticket to a coding agent (Claude first) and watch the change being built. This system is the look and feel of that app: calm, quiet chrome, one obvious next action per screen.

### Principles

- **Calm by default.** The chrome is warm grey and steps back. Colour appears only where it means something: a status, a source, a selection, a focus ring.
- **One primary action per view.** Each screen has exactly one filled `primary` button (Send, Build with Claude, Create pull request). Everything else is secondary or ghost.
- **Always know where you are.** Sidebar for places, breadcrumb for depth, tabs for views inside a place. Never more than two levels of breadcrumb below a sidebar item.
- **Show state in words and shape, not colour alone.** Every pill has a dot and a label. Every source has a mark and a name.
- **Nothing happens without you.** The agent never pushes or opens a PR on its own. Approval prompts sit inline where the work is, not in pop-ups.

### Navigation model

| Layer | Component | Use for |
| --- | --- | --- |
| Places | `SidebarNav` | Home, Tickets, Sessions, Settings. 4–6 items, always visible on desktop. |
| Depth | `Breadcrumb` | Where this page sits: `Tickets / Sprint 42 / PROJ-1423`. The last item is `aria-current="page"` and not a link. |
| Views of different content | `Tabs` | Activity · Changes · Ticket inside a session; All · Jira · Pull requests · Slack in the inbox. |
| Views of the same content | `SegmentedControl` | Board / List. |
| Progress through a flow | `Stepper` | Plan · Build · Test · Review · Pull request in a session. |

Every screen starts with a "Skip to content" link, and `⌘K` opens search from anywhere (shown in the sidebar). Keyboard: `Tab` moves between regions, arrow keys move inside a tab list (roving `tabindex`), `Esc` closes menus and returns focus to the trigger.

### Colour

Neutrals are a warm stone grey, biased toward yellow so the app feels calm rather than clinical. The canvas is an almost-white `#fcfcfb`, the sidebar one step darker. Indigo (`accent`) is the only chromatic colour in the chrome. Status hues are tuned to the same depth so none shouts louder than another, and every status is also told by an icon shape and a word.

- `bg-canvas` is where work happens; `bg-sidebar` is the chrome around it; `bg-subtle` marks hover and selection; `bg-raised` + `border-default` make a card.
- Text is `text-primary` or `text-secondary`. Both meet 4.5:1 on every background token in both themes. `text-placeholder` is for placeholders only.
- `border-default` is decorative. Anything you can type into or toggle uses `border-control` (3:1).
- `accent` (indigo) is for links, focus and selection. It is never a big fill.
- `primary` (ink) fills the one primary button.
- Status: `success`, `warning`, `danger`, each with a `-subtle` background. Use them only for state: done/passing, waiting on you, failing/destructive.
- Sources: `source-jira`, `source-github`, `source-slack`. Always paired with the source name.

### Type

- **Geist** for the interface, **Geist Mono** for keys, branches, paths and diffs, **Newsreader** for the single greeting on Home. The serif appears once per screen at most.
- Sizes: `display` 40, `title-lg` 20, `title` 18, `body` 16, `small` 14, `label` 12, `code` 14. Nothing smaller than 12px. Each size has its own line height (section 2).
- Two weights: 400 for text and 500 for emphasis. Never 600 or 700.
- Sentence case everywhere. Ticket keys and branch names keep their own case.

### Space and shape

- 4px base: `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-6` 24, `space-8` 32.
- Radius: `radius-sm` 6 for controls, `radius-md` 10 for cards and menus, `radius-lg` 16 for the composer and dialogs, `radius-full` for avatars and chips.
- One shadow, `shadow-overlay`, for menus and the composer. Cards use a border, not a shadow.

### Accessibility rules

- Text contrast 4.5:1 (checked for every text/background pair above in both themes); control borders, icons and focus rings 3:1.
- Focus is a 2px `accent` outline with 2px offset on every interactive element. Never remove it.
- Hit targets are at least 32px tall in dense rows and 40px elsewhere.
- Use real elements: `<nav>`, `<a href>`, `<button>`, `role="tablist"`/`role="tab"`/`aria-selected`, `aria-current="page"` in nav and breadcrumbs, `aria-label` on icon-only buttons.
- Live agent output is in a region with `aria-live="polite"`; approval prompts use `role="alert"`.
- Respect `prefers-reduced-motion`.

### Iconography

Outline icons, 20px, 1.75px stroke, round caps, drawn in `currentColor` so they follow the text token (the `.dh-icon` class). Lucide's set matches this style. An icon never stands alone without a label or an `aria-label`.

### Writing

- Buttons say what happens: "Build with Claude", "Create pull request", "Allow once". Not "Submit" or "OK".
- Say why something is in the inbox: "Review requested · waiting 2 days", "No reply · 3 h".
- Errors say what happened and what to do: "Slack needs admin approval. Copy the request and send it to your Slack admin."

### Using it

Load `tokens.css` then `components/bundle.css`, put `class="dh-root"` on the app root, and set `data-theme="dark"` on `<html>` for dark mode. Components are plain HTML and CSS classes prefixed `dh-`; each component page shows the markup.

---

## 2. Tokens

### Colour

Every text/background pair passes WCAG AA (4.5:1) in both themes; control borders and focus rings pass 3:1.

| Token | Light | Dark | Use for |
| --- | --- | --- | --- |
| `--bg-canvas` | `#fcfcfb` | `#171614` | Main content area and the page behind boards. |
| `--bg-sidebar` | `#f6f5f2` | `#12110f` | Sidebar, board columns and app chrome. Warm stone, one step below the canvas so the work area reads as the focus. |
| `--bg-subtle` | `#efeee9` | `#22211e` | Hover rows, selected nav item, segmented-control track, board column wash. |
| `--bg-raised` | `#ffffff` | `#201f1c` | Cards, menus, composer. Pair with border-default; menus also take shadow-overlay. |
| `--border-default` | `#e6e4de` | `#2e2c28` | Decorative dividers and card outlines. Never the only cue for a control. |
| `--border-control` | `#8b887f` | `#706d65` | Outline of inputs, checkboxes and secondary buttons. 3:1 or better against bg-canvas. |
| `--text-primary` | `#1c1b18` | `#eceae4` | Headings, titles and body text. |
| `--text-secondary` | `#5f5c54` | `#aaa69c` | Meta lines, helper text, inactive tabs and nav. 4.5:1 or better on every background token. |
| `--text-placeholder` | `#6f6c63` | `#8e8a80` | Input placeholders only. Still 4.5:1, so hints stay readable. |
| `--primary` | `#1c1b18` | `#eceae4` | Fill of the one primary button per view (Send, Create pull request). |
| `--on-primary` | `#ffffff` | `#1c1b18` | Text and icons on primary. |
| `--accent` | `#3b5bdb` | `#8ea4ff` | Indigo. Links, focus rings, selected tab underline, active nav icon, current file. Never a large fill. |
| `--accent-subtle` | `#eef1fd` | `#1f2645` | Background of selected rows, In review pill, info callouts. |
| `--accent-text` | `#2c45b0` | `#b6c3ff` | Text on accent-subtle. |
| `--success` | `#2b7a4b` | `#74cf98` | Done, checks passing, connected. Text on success-subtle or canvas. |
| `--success-subtle` | `#e9f5ee` | `#15291d` | Background of success pills. |
| `--warning` | `#8f5a12` | `#eab565` | Waiting on you, due soon, needs approval. |
| `--warning-subtle` | `#fbf2e2` | `#2f2513` | Background of warning pills and the approval callout. |
| `--danger` | `#b3372b` | `#ff9286` | Failing checks, bugs, destructive actions, removed diff lines. |
| `--danger-subtle` | `#fcebe8` | `#361a16` | Background of danger pills and removed diff lines. |
| `--on-danger` | `#ffffff` | `#171614` | Text on a filled danger button. |
| `--source-jira` | same as `--accent` | same as `--accent` | Jira source mark. Always shown with the word Jira or a ticket key. |
| `--source-github` | same as `--text-primary` | same as `--text-primary` | GitHub source mark. Always shown with a repo name. |
| `--source-slack` | `#7b3f8c` | `#d6a3e4` | Slack source mark. Always shown with a channel name. |
| `--source-slack-subtle` | `#f5edf7` | `#2b1d31` | Background behind the Slack mark. |
| `--brand-jira` / `--brand-jira-deep` | `#2684ff` / `#0052cc` | same | Jira's logo in its own blues: the top piece light, the two below shaded from deep into light. Logos only (decided 17 Oct 2026). |
| `--brand-slack-red` / `-blue` / `-green` / `-yellow` | `#e01e5a` / `#36c5f0` / `#2eb67d` / `#ecb22e` | same | Slack's logo in its four colours. Logos only (decided 17 Oct 2026). |

### Typography

| Family | Stack |
| --- | --- |
| `--font-sans` | Geist, "Helvetica Neue", Arial, sans-serif |
| `--font-serif` | Newsreader, Georgia, "Times New Roman", serif |
| `--font-mono` | "Geist Mono", ui-monospace, Menlo, Consolas, monospace |

| Style | Family | Size / line height | Weight | Use for |
| --- | --- | --- | --- | --- |
| `display` | serif | 40px / 48px | 400 | One greeting per screen, on Home only. |
| `title-lg` | sans | 20px / 28px | 500 | Page title under the breadcrumb. |
| `title` | sans | 18px / 28px | 500 | Section and panel headings. |
| `body` | sans | 16px / 24px | 400 | Default text: nav, rows, buttons, body. |
| `body-strong` | sans | 16px / 24px | 500 | Card titles, nav labels, buttons. |
| `small` | sans | 14px / 20px | 400 | Meta lines, helper text, a row's second line, sidebar section labels. |
| `label` | sans | 12px / 16px | 500 | Pills, counts, keyboard hints. Smallest size allowed. |
| `code` | mono | 14px / 20px | 400 | Branch names, ticket keys, file paths, diffs. |

### Spacing

| Token | Value | Use for |
| --- | --- | --- |
| `--space-1` | 4px | Icon to label inside a pill. |
| `--space-2` | 8px | Gap between buttons; icon to label. |
| `--space-3` | 12px | Card inner padding; gap between cards in a column. |
| `--space-4` | 16px | Panel padding; gap between sections in a panel; the page gutter under 768px. |
| `--space-6` | 24px | Gap between page sections; space above the page column. |
| `--space-8` | 32px | Space below the page column. |
| `--space-12` | 48px | Space above the Home greeting; the page gutter from 768px. |

### Radius

| Token | Value | Use for |
| --- | --- | --- |
| `--radius-sm` | 6px | Buttons, inputs, nav items, pills. |
| `--radius-md` | 10px | Cards, menus, callouts. |
| `--radius-lg` | 16px | The composer, dialogs, the app frame. |
| `--radius-full` | 999px | Avatars, count bubbles, filter chips. |

### Shadow

| Token | Light | Dark | Use for |
| --- | --- | --- | --- |
| `--shadow-overlay` | `0 1px 2px rgba(28,27,24,0.05), 0 8px 24px rgba(28,27,24,0.08)` | `0 8px 24px rgba(0,0,0,0.55)` | Menus, popovers and the composer. Nothing else takes a shadow. |

---

## 3. Components

Components are plain HTML with `dh-` CSS classes (section 4). Put `class="dh-root"` on the app root and set `data-theme="dark"` on `<html>` for dark mode.

### SidebarNav

The always-visible list of places in the app, the agent sessions you have open, and who is signed in.

- `<nav aria-label="Main">` on `bg-sidebar`, 300px wide by default. The person can drag its right edge, or use the arrow keys on it, to resize it between 260 and 400px. Top: logo, collapse button, then New task (⌘N) and Search (⌘K).
- Places and Search are 36px rows. Inside the sidebar, text and icons sit one step down the scale (the user's call, 20 Oct 2026, spec 039 Q4): places, Search and session titles at `small` (14px, weight 500), session second lines, the Sessions heading and the footer's status at `label` (12px), icons at 16px and session state circles at 20px. The narrow bar under 768px keeps its own sizes.
- Places are `<a class="dh-nav-item">` with an icon and label; the current one has `aria-current="page"`. Counts sit in `.dh-nav-count` (filled ink on the current place) with hidden words for screen readers ("14 need you").
- Sessions are two-line `.dh-session` links: title on top, ticket key and state below. State is told three ways: an icon shape (! waiting, arc working, check done), its word ("Needs you", "Working", "Done, ready for PR") and its colour. Keep the 5 most recent; "View all" leads to the full list. Each row has a ⋯ More actions button at its end (Rename, Pin or Unpin, Delete), beside the link, never inside it: it shows on hover or focus, and always under 768px (spec 039). Pinned sessions sit first, under a "Pinned" heading.
- The footer is the signed-in person with the agent's connection state; it links to Settings.
- On phones the sidebar stacks above the content; never fix it to `100vh`.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="display:flex;background:var(--bg-canvas)">
  <nav class="dh-sidebar" aria-label="Main" style="width:300px;min-height:580px">
    <div class="dh-sidebar-head"><span aria-hidden="true" style="width:32px;height:32px;border-radius:6px;background:var(--primary);color:var(--on-primary);display:flex;align-items:center;justify-content:center;font-weight:500;font-size:16px">D</span><span style="font-weight:500;font-size:18px;line-height:28px">DevHub</span><button class="dh-btn dh-btn--ghost dh-btn--icon dh-btn--sm" type="button" aria-label="Collapse sidebar" style="margin-left:auto"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg></button></div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <a class="dh-btn dh-btn--secondary" href="#" style="justify-content:flex-start"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>New task<kbd class="dh-kbd">⌘N</kbd></a>
      <button class="dh-sidebar-search" type="button"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Search<kbd class="dh-kbd">⌘K</kbd></button>
    </div>
    <div class="dh-nav">
      <a class="dh-nav-item" href="#" aria-current="page"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg><span class="dh-nav-text">Home</span><span class="dh-nav-count">14<span class="dh-sr-only"> need you</span></span></a>
      <a class="dh-nav-item" href="#"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/></svg><span class="dh-nav-text">Tickets</span><span class="dh-nav-count">9</span></a>
      <a class="dh-nav-item" href="#"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg><span class="dh-nav-text">Settings</span></a>
    </div>
    <div class="dh-nav">
      <div class="dh-nav-head"><span>Sessions</span><a href="#">View all</a></div>
      <a class="dh-session" href="#" aria-current="page"><span class="dh-session-icon dh-session-icon--wait" aria-hidden="true"><svg class="dh-icon" viewBox="0 0 24 24"><path d="M12 7v6"/><path d="M12 17h.01"/></svg></span><span class="dh-session-body"><span class="dh-session-title">Add bulk archive</span><span class="dh-session-sub"><span class="dh-mono">PROJ-1423</span><span aria-hidden="true">·</span><span class="dh-state--wait">Needs you</span></span></span></a>
      <a class="dh-session" href="#"><span class="dh-session-icon dh-session-icon--run" aria-hidden="true"><svg class="dh-icon" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9"/></svg></span><span class="dh-session-body"><span class="dh-session-title">Read receipts on analytics</span><span class="dh-session-sub"><span class="dh-mono">PROJ-1398</span><span aria-hidden="true">·</span><span class="dh-state--run">Working</span></span></span></a>
      <a class="dh-session" href="#"><span class="dh-session-icon dh-session-icon--done" aria-hidden="true"><svg class="dh-icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></span><span class="dh-session-body"><span class="dh-session-title">Fix timezone shift in event cards</span><span class="dh-session-sub"><span class="dh-mono">PR #2836</span><span aria-hidden="true">·</span><span class="dh-state--done">Done, ready for PR</span></span></span></a>
    </div>
    <div class="dh-sidebar-foot">
      <a class="dh-user" href="#"><span class="dh-avatar">RD</span><span class="dh-session-body"><span class="dh-session-title">Rakesh D.</span><span class="dh-session-sub"><span class="dh-dot" aria-hidden="true" style="color:var(--success)"></span>Claude connected · runs locally</span></span></a>
    </div>
  </nav>
</div>
```

</details>

### PageHeader

The same frame on every screen: a 56px page bar with the breadcrumb on the left and page actions on the right, an optional 56px toolbar for filters, then the page body.

- `.dh-main` > `header.dh-pagebar` > breadcrumb, `.dh-pagebar-meta`, `.dh-pagebar-actions`. Then `.dh-toolbar` (filters and counts), then `.dh-pagebody` > `.dh-pagebody-col`.
- The page bar is one line at every width: a long breadcrumb is cut first, and under 768px the meta hides.
- The gutter (16px, 48px from 768px) sits on `.dh-pagebody` and the width on `.dh-pagebody-col`, centred: 960px by default, 720px (`--narrow`) for sparse pages such as Home, or `--full` only for a board or table that 960px would squeeze. No other widths.
- Both bars are separated by a `border-default` hairline, not by colour or shadow.
- The page's single primary button, if any, lives in the page bar actions.

<details><summary>Example markup</summary>

```html
<div class="dh-root dh-main" style="border:1px solid var(--border-default)">
  <header class="dh-pagebar">
    <nav class="dh-breadcrumb" aria-label="Breadcrumb"><ol><li><a href="#">Tickets</a></li><li><span aria-current="page">Sprint 42</span></li></ol></nav>
    <span class="dh-pagebar-meta">Ends Oct 24</span>
    <div class="dh-pagebar-actions">
      <div class="dh-segmented" role="group" aria-label="View"><button class="dh-segment" type="button" aria-pressed="true">Board</button><button class="dh-segment" type="button" aria-pressed="false">List</button></div>
    </div>
  </header>
  <div class="dh-toolbar">
    <button class="dh-chip" type="button" aria-pressed="true" style="background:var(--accent-subtle);color:var(--accent-text);border-color:var(--accent)">Assigned to me</button>
    <button class="dh-chip" type="button" aria-pressed="false">Due this week</button>
    <span style="margin-left:auto;font-size:14px;color:var(--text-secondary)">9 tickets</span>
  </div>
</div>
```

</details>

### Breadcrumb

Shows where the current page sits under a sidebar place, and gives a one-click way back.

- `<nav aria-label="Breadcrumb">` with an ordered list. The first item is the sidebar place.
- The last item is the current page: plain text with `aria-current="page"`, not a link.
- At most three items, on one line in `body` size; the current page is `body-strong`. Only the last item shrinks: a long one is cut with an ellipsis and keeps its full text in `title`.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;background:var(--bg-canvas)">
  <nav class="dh-breadcrumb" aria-label="Breadcrumb">
    <ol>
      <li><a href="#">Tickets</a></li>
      <li><a href="#">Sprint 42</a></li>
      <li><span aria-current="page">PROJ-1423</span></li>
    </ol>
  </nav>
</div>
```

</details>

### Tabs

Switches between different content inside one page, such as Activity, Changes and Ticket in a session.

- Markup: a `role="tablist"` with an `aria-label`, each tab a `<button role="tab">` with `aria-selected`; panels are `role="tabpanel"` with `aria-labelledby`.
- Keyboard: arrow keys move between tabs (roving `tabindex`: the selected tab is `0`, others `-1`).
- The selected tab gets `text-primary` and a 2px `accent` underline. Unselected tabs use `text-secondary` (4.5:1).
- Tabs are 48px tall. Counts go in `.dh-count` after the label. Keep to 2–5 tabs; scrolls sideways on narrow screens.
- For Board/List views of the same items, use SegmentedControl instead.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;background:var(--bg-canvas)">
  <div class="dh-tabs" role="tablist" aria-label="Inbox sources">
    <button class="dh-tab" role="tab" aria-selected="true" tabindex="0" type="button">All <span class="dh-count">14</span></button>
    <button class="dh-tab" role="tab" aria-selected="false" tabindex="-1" type="button">Jira <span class="dh-count">5</span></button>
    <button class="dh-tab" role="tab" aria-selected="false" tabindex="-1" type="button">Pull requests <span class="dh-count">5</span></button>
    <button class="dh-tab" role="tab" aria-selected="false" tabindex="-1" type="button">Slack <span class="dh-count">4</span></button>
  </div>
</div>
```

</details>

### SegmentedControl

Switches how the same items are shown, such as Board or List.

- A `role="group"` with `aria-label`, each option a `<button aria-pressed>`.
- The pressed option sits on `bg-raised` with a hairline; others are `text-secondary` on the `bg-subtle` track.
- Two to four options, each with an icon and a word.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;background:var(--bg-canvas)">
  <div class="dh-segmented" role="group" aria-label="View">
    <button class="dh-segment" type="button" aria-pressed="true"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/></svg>Board</button>
    <button class="dh-segment" type="button" aria-pressed="false"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>List</button>
  </div>
</div>
```

</details>

### Stepper

Shows where an agent session is: Plan, Build, Test, Review, Pull request.

- An `<ol>` with `data-state` of `done`, `current` or `todo` on each step; the current one also has `aria-current="step"`.
- Done steps show a check and a hidden ", done" for screen readers. The current step is the only filled circle.
- Five steps at most. It sits under the page title, never inside a card.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;background:var(--bg-canvas)">
  <ol class="dh-stepper" aria-label="Session progress">
    <li data-state="done"><span class="dh-step-num" aria-hidden="true">✓</span>Plan<span class="dh-sr-only">, done</span></li>
    <li data-state="done"><span class="dh-step-num" aria-hidden="true">✓</span>Build<span class="dh-sr-only">, done</span></li>
    <li data-state="current" aria-current="step"><span class="dh-step-num" aria-hidden="true">3</span>Test</li>
    <li data-state="todo"><span class="dh-step-num" aria-hidden="true">4</span>Review</li>
    <li data-state="todo"><span class="dh-step-num" aria-hidden="true">5</span>Pull request</li>
  </ol>
</div>
```

</details>

### Button

Triggers an action; one `primary` button per view, everything else `secondary` or `ghost`.

- **primary** (`dh-btn--primary`): the single next step on the screen. Ink fill.
- **secondary** (`dh-btn--secondary`): other actions. Has a `border-control` outline so it reads as a control.
- **ghost** (`dh-btn--ghost`): low-emphasis actions in toolbars and dialogs.
- **danger** (`dh-btn--danger`): destructive and irreversible. Pair with a confirm step in the page, never a browser dialog.
- **icon** (`dh-btn--icon`): square; must have `aria-label`.
- Sizes: default 40px; `dh-btn--sm` 32px for cards and dense rows.

Label with the action ("Create pull request"), sentence case. Use `<a class="dh-btn">` when it navigates, `<button>` when it acts.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;display:flex;flex-direction:column;gap:12px;background:var(--bg-canvas)">
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <button class="dh-btn dh-btn--primary" type="button">Create pull request</button>
    <button class="dh-btn dh-btn--secondary" type="button">Open in VS Code</button>
    <button class="dh-btn dh-btn--ghost" type="button">Cancel</button>
    <button class="dh-btn dh-btn--danger" type="button">Discard changes</button>
    <button class="dh-btn dh-btn--secondary dh-btn--icon" type="button" aria-label="Refresh"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><polyline points="21 3 21 9 15 9"/></svg></button>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <button class="dh-btn dh-btn--primary dh-btn--sm" type="button">Build with Claude</button>
    <button class="dh-btn dh-btn--secondary dh-btn--sm" type="button">Open in Jira</button>
    <button class="dh-btn dh-btn--primary dh-btn--sm" type="button" disabled>Create pull request</button>
  </div>
</div>
```

</details>

### Input

A single-line text field, with a visible label and optional one-line help.

- Outline is `border-control` (3:1); focus adds the accent ring. Placeholder uses `text-placeholder` and never replaces the label.
- Search fields may hide the label visually but keep an `aria-label`.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;display:flex;flex-direction:column;gap:16px;background:var(--bg-canvas);max-width:420px">
  <div class="dh-field">
    <label class="dh-field-label" for="jira-site">Jira site</label>
    <input class="dh-input" id="jira-site" value="your-team.atlassian.net">
    <span class="dh-field-help">The address you open Jira at.</span>
  </div>
  <div class="dh-search">
    <svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input class="dh-input" type="search" aria-label="Search tickets" placeholder="Search tickets">
  </div>
</div>
```

</details>

### Composer

The one place to give the agent a task: a text box, the repository (local folder) it works in, the agent, and Send.

- `radius-lg`, `bg-raised`, `shadow-overlay`; the border turns `accent` while focused.
- The textarea has a visually hidden `<label>`. Placeholder tells people what they can type.
- Pickers (`.dh-picker`) open a Menu (`aria-haspopup="menu"`). The repo picker lists local folders and ends with "Add local folder".
- The **+ button** ("Add context", `aria-haspopup="menu"`) opens a menu of what Claude can work from: Git repository, Jira ticket, Pull request, Slack thread, File from this computer. Each opens a searchable list in the same popover with a Back button; picking an item adds a removable context chip (`.dh-context`) above the text box, except a repository, which sets the folder picker. A file opens the system file dialog. `Esc` closes, focus returns to +.
- Send is the screen's primary button, round, with `aria-label`. `Enter` sends, `Shift+Enter` adds a line.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;background:var(--bg-canvas)">
  <form class="dh-composer" style="max-width:640px" onsubmit="event.preventDefault()">
    <label for="cmp" class="dh-sr-only">Describe a task for Claude</label>
    <textarea id="cmp" rows="2" placeholder="Describe a task, or paste a Jira key like PROJ-1423"></textarea>
    <div class="dh-composer-bar">
      <button class="dh-btn dh-btn--ghost dh-btn--icon dh-btn--sm" type="button" aria-label="Attach a file"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <button class="dh-picker" type="button" aria-haspopup="menu"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>web-app<svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
      <button class="dh-picker" type="button" aria-haspopup="menu"><span aria-hidden="true" style="width:8px;height:8px;border-radius:50%;background:var(--success)"></span>Claude<svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button>
      <button class="dh-btn dh-btn--primary dh-send" type="submit" aria-label="Send to Claude"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>
    </div>
  </form>
</div>
```

</details>

### Menu

A short list of choices opened from a picker or a "more" button.

- `role="menu"`; choices are `menuitem`, or `menuitemradio` with `aria-checked` when one is selected (shown with an accent check).
- Group with `.dh-menu-label`, separate with `.dh-menu-sep`. Secondary info (a folder path) goes in `<small>` in mono.
- Arrow keys move, `Enter` picks, `Esc` closes and returns focus to the trigger.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;background:var(--bg-canvas)">
  <div class="dh-menu" role="menu" aria-label="Repository" style="max-width:320px">
    <div class="dh-menu-label">On this computer</div>
    <button class="dh-menu-item" role="menuitemradio" aria-checked="true" type="button"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span style="flex:1">web-app<small>~/code/web-app</small></span><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true" style="color:var(--accent)"><polyline points="20 6 9 17 4 12"/></svg></button>
    <button class="dh-menu-item" role="menuitemradio" aria-checked="false" type="button"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span style="flex:1">api<small>~/code/api</small></span></button>
    <div class="dh-menu-sep" role="separator"></div>
    <button class="dh-menu-item" role="menuitem" type="button"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add local folder</button>
    <button class="dh-menu-item" role="menuitem" type="button"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>Manage folders</button>
  </div>
</div>
```

</details>

### Sheet

A panel that slides in from the right edge over the page, for a set of controls that would crowd a toolbar, such as Tickets' filters (spec 039, Q6: from shadcn's `sheet`, on the dialog's tokens).

- A dialog underneath (`role="dialog"`, named by its title): focus moves in and stays in, and `Esc`, Close or a click beside it closes it and returns focus to what opened it. The sheet itself takes focus when it opens, so the first `Esc` closes it.
- As tall as the window and 400px wide, the whole width when the window is narrower. `bg-raised`, a hairline on its open side and `shadow-overlay`. The page behind fades towards the canvas, as behind a dialog.
- A head with the title (`title`) and Close, a body that scrolls, and an optional foot on the sidebar's tint with a hairline above, as a dialog's foot.
- It slides in 24px with a fade over 200ms, and only fades with reduced motion.
- A list of choices that each need more room is a list of rows (the user's pattern, 20 Oct 2026): each row a title, a count of what's picked in an ink bubble, one quiet line saying what's picked ("Any" for nothing) and a chevron, divided by hairlines. A row opens its own page inside the sheet, with Back before its title.

### Pill

A short status label: a dot plus a word, so state never depends on colour alone.

- Neutral (no modifier): To do, Backlog. `--warning`: In progress, waiting on you. `--info`: In review. `--success`: Done, passing. `--danger`: failing, bug.
- `dh-pill--plain` drops the dot for non-status tags.
- Source marks (`dh-source--jira|github|slack`) always show the source name next to the mark. Since 17 Oct 2026 the mark is each tool's own logo in its own colours (Jira's blues, GitHub's Invertocat in `--source-github`, Slack's four colours), on a `bg-subtle` tile at the large size; the letters in the markup below stand in for the logos.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;display:flex;flex-direction:column;gap:12px;background:var(--bg-canvas)">
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <span class="dh-pill">To do</span>
    <span class="dh-pill dh-pill--warning">In progress</span>
    <span class="dh-pill dh-pill--info">In review</span>
    <span class="dh-pill dh-pill--success">Done</span>
    <span class="dh-pill dh-pill--danger">Checks failing</span>
    <span class="dh-pill dh-pill--warning">Needs your approval</span>
  </div>
  <div style="display:flex;gap:16px;flex-wrap:wrap">
    <span class="dh-source dh-source--jira"><span class="dh-source-mark" aria-hidden="true">J</span>Jira</span>
    <span class="dh-source dh-source--github"><span class="dh-source-mark" aria-hidden="true">G</span>GitHub</span>
    <span class="dh-source dh-source--slack"><span class="dh-source-mark" aria-hidden="true">#</span>Slack</span>
  </div>
</div>
```

</details>

### WorkItemCard

One ticket on a board: key and type, title (two lines at most), priority, due date, assignee, and either the agent's state or a quiet "Build with Claude" action.

- `bg-raised`, `border-default`, `radius-md`; the border darkens on hover. No shadow.
- Top row: mono key, type as a word (`dh-tag--bug` in danger), avatar on the right.
- Meta row: priority bars plus word, due date with a calendar icon (`--soon` in warning when due this week), then on the right either an agent chip ("Needs you", links to the session) or an icon-only ghost button with an `aria-label` naming the ticket.
- The title is the link to the item; the card is not one big link, so the action stays reachable by keyboard.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;background:var(--bg-sidebar);display:flex;gap:12px;flex-wrap:wrap">
  <article class="dh-card" style="width:280px">
    <div class="dh-card-top"><span class="dh-card-key">PROJ-1423</span><span class="dh-tag">Story</span><span class="dh-avatar" style="margin-left:auto" title="Assigned to you">RD</span></div>
    <a class="dh-card-title" href="#">Add bulk archive to the content list</a>
    <div class="dh-card-meta"><span class="dh-prio dh-prio--high"><svg viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="8" width="3" height="5" rx="1"/><rect x="5.5" y="5" width="3" height="8" rx="1"/><rect x="10" y="2" width="3" height="11" rx="1"/></svg>High</span><span class="dh-meta-item dh-meta-item--soon"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>Fri</span><a class="dh-agent-chip" href="#"><span class="dh-dot" aria-hidden="true"></span>Needs you</a></div>
  </article>
  <article class="dh-card" style="width:280px">
    <div class="dh-card-top"><span class="dh-card-key">PROJ-1377</span><span class="dh-tag dh-tag--bug">Bug</span><span class="dh-avatar" style="margin-left:auto" title="Assigned to you">RD</span></div>
    <a class="dh-card-title" href="#">Search returns archived sites for guest users</a>
    <div class="dh-card-meta"><span class="dh-prio dh-prio--med"><svg viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="8" width="3" height="5" rx="1"/><rect x="5.5" y="5" width="3" height="8" rx="1"/><rect x="10" y="2" width="3" height="11" rx="1"/></svg>Medium</span><span class="dh-meta-item"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>Oct 28</span><a class="dh-btn dh-btn--ghost dh-btn--icon dh-btn--sm dh-card-action" href="#" aria-label="Build PROJ-1377 with Claude"><svg class="dh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/></svg></a></div>
  </article>
</div>
```

</details>

### AttentionRow

One inbox item: where it comes from, what it is, why it needs you, and the one thing to do next.

- Order: source mark, title + sub line, reason pill, action. The reason always includes the wait ("No reply · 3 h").
- The source mark is decorative; a visually hidden name keeps it readable for screen readers.
- Title and sub line truncate with an ellipsis; rows are at least 56px tall.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:8px;background:var(--bg-canvas)">
  <div role="list">
    <div class="dh-row" role="listitem">
      <span class="dh-source dh-source--github"><span class="dh-source-mark" aria-hidden="true">G</span><span class="dh-sr-only">GitHub</span></span>
      <div class="dh-row-main"><a class="dh-row-title" href="#">Lazy-load the people directory</a><span class="dh-row-sub">web-app #2841 · by Priya S.</span></div>
      <span class="dh-pill dh-pill--warning">Review requested · 2 d</span>
      <a class="dh-btn dh-btn--secondary dh-btn--sm" href="#">Review</a>
    </div>
    <div class="dh-row" role="listitem">
      <span class="dh-source dh-source--slack"><span class="dh-source-mark" aria-hidden="true">#</span><span class="dh-sr-only">Slack</span></span>
      <div class="dh-row-main"><a class="dh-row-title" href="#">Can you confirm the archive API returns 207 for partial failures?</a><span class="dh-row-sub">Neha K. in #web-platform</span></div>
      <span class="dh-pill dh-pill--warning">No reply · 3 h</span>
      <a class="dh-btn dh-btn--secondary dh-btn--sm" href="#">Reply</a>
    </div>
  </div>
</div>
```

</details>

### EmptyState

Fills an empty list, column or panel with what would appear there and how it gets there.

- One short title in `text-primary`, one line in `text-secondary`, as plain centred text: no outline, no icon, no card.
- With active filters, say so and offer to clear them: "No bugs due this week. Clear filters".

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;background:var(--bg-sidebar)">
  <div class="dh-empty" style="max-width:280px">
    <span style="font-weight:500;color:var(--text-primary)">Nothing in review</span>
    <span>Tickets move here when you open a pull request.</span>
  </div>
</div>
```

</details>

### Callout

An inline message inside the flow of work: an approval the agent is waiting for, or a notice.

- `--warning` for approvals (with `role="alert"` so screen readers announce it), `--info` for notices.
- Title says what is happening; the body shows exactly what will run; buttons say what each choice does.
- Never a modal: the work stays visible behind it.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;display:flex;flex-direction:column;gap:12px;background:var(--bg-canvas)">
  <div class="dh-callout dh-callout--warning" role="alert" style="max-width:520px">
    <span class="dh-callout-title">Claude wants to run a command</span>
    <code>npm test -- content-list</code>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="dh-btn dh-btn--primary dh-btn--sm" type="button">Allow once</button>
      <button class="dh-btn dh-btn--secondary dh-btn--sm" type="button">Always allow npm test</button>
      <button class="dh-btn dh-btn--ghost dh-btn--sm" type="button">Deny</button>
    </div>
  </div>
  <div class="dh-callout dh-callout--info" style="max-width:520px">
    <span class="dh-callout-title">Everything stays on this computer</span>
    <span>Tokens live in your OS keychain. DevHub talks only to Jira, GitHub, Slack and Claude.</span>
  </div>
</div>
```

</details>

### FileList

The files an agent changed, with +/− counts; picking one shows its diff next to it.

- Each file is a `<button>`; the shown file has `aria-current="true"` (accent edge and tint).
- Paths are mono and truncate from the end; counts use `success` and `danger` with the + and − signs.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;background:var(--bg-canvas)">
  <div class="dh-filelist" role="list" aria-label="Changed files" style="max-width:420px">
    <button class="dh-file" type="button" aria-current="true"><span class="dh-file-path">src/content/ContentList.tsx</span><span style="color:var(--success)">+68</span><span style="color:var(--danger)">−9</span></button>
    <button class="dh-file" type="button"><span class="dh-file-path">src/content/api/contentApi.ts</span><span style="color:var(--success)">+31</span><span style="color:var(--danger)">−2</span></button>
    <button class="dh-file" type="button"><span class="dh-file-path">src/content/useSelection.ts</span><span style="color:var(--success)">+22</span><span style="color:var(--danger)">−7</span></button>
    <button class="dh-file" type="button"><span class="dh-file-path">src/content/__tests__/bulkArchive.test.ts</span><span style="color:var(--success)">+21</span></button>
  </div>
</div>
```

</details>

### DiffView

Shows the agent's code changes as they happen.

- Mono 14/20. Added lines on `success-subtle` with a `+`, removed on `danger-subtle` with a `−`: the sign carries the meaning, colour backs it up.
- File header shows the path and +/− counts. Wide lines scroll inside the diff, never the page.
- Mark the container as a `region` with an `aria-label` naming the file.

<details><summary>Example markup</summary>

```html
<div class="dh-root" style="padding:16px;background:var(--bg-canvas)">
  <div class="dh-diff" role="region" aria-label="Changes in ContentList.tsx">
    <div class="dh-diff-file"><span style="flex:1">src/content/ContentList.tsx</span><span style="color:var(--success)">+3</span><span style="color:var(--danger)">−1</span></div>
    <div class="dh-diff-line"><span>41</span><span> </span><span>export function ContentList({ items }: Props) {</span></div>
    <div class="dh-diff-line dh-diff-line--del"><span>42</span><span>−</span><span>  const [rows] = useState(items);</span></div>
    <div class="dh-diff-line dh-diff-line--add"><span>42</span><span>+</span><span>  const { selected, toggle } = useSelection(items);</span></div>
    <div class="dh-diff-line dh-diff-line--add"><span>43</span><span>+</span><span>  const archive = useBulkArchive();</span></div>
    <div class="dh-diff-line dh-diff-line--add"><span>44</span><span>+</span><span></span></div>
    <div class="dh-diff-line"><span>45</span><span> </span><span>  return (</span></div>
  </div>
</div>
```

</details>

---

## 4. CSS

### tokens.css

```css
/* DevHub — generated from tokens.json */
:root, [data-theme="light"] {
  --bg-canvas: #fcfcfb; --bg-sidebar: #f6f5f2; --bg-subtle: #efeee9; --bg-raised: #ffffff;
  --border-default: #e6e4de; --border-control: #8b887f;
  --text-primary: #1c1b18; --text-secondary: #5f5c54; --text-placeholder: #6f6c63;
  --primary: #1c1b18; --on-primary: #ffffff;
  --accent: #3b5bdb; --accent-subtle: #eef1fd; --accent-text: #2c45b0;
  --success: #2b7a4b; --success-subtle: #e9f5ee;
  --warning: #8f5a12; --warning-subtle: #fbf2e2;
  --danger: #b3372b; --danger-subtle: #fcebe8; --on-danger: #ffffff;
  --source-jira: var(--accent); --source-github: var(--text-primary); --source-slack: #7b3f8c; --source-slack-subtle: #f5edf7;
  --shadow-overlay: 0 1px 2px rgba(28,27,24,0.05), 0 8px 24px rgba(28,27,24,0.08);
}
[data-theme="dark"] {
  --bg-canvas: #171614; --bg-sidebar: #12110f; --bg-subtle: #22211e; --bg-raised: #201f1c;
  --border-default: #2e2c28; --border-control: #706d65;
  --text-primary: #eceae4; --text-secondary: #aaa69c; --text-placeholder: #8e8a80;
  --primary: #eceae4; --on-primary: #1c1b18;
  --accent: #8ea4ff; --accent-subtle: #1f2645; --accent-text: #b6c3ff;
  --success: #74cf98; --success-subtle: #15291d;
  --warning: #eab565; --warning-subtle: #2f2513;
  --danger: #ff9286; --danger-subtle: #361a16; --on-danger: #171614;
  --source-slack: #d6a3e4; --source-slack-subtle: #2b1d31;
  --shadow-overlay: 0 8px 24px rgba(0,0,0,0.55);
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg-canvas: #171614; --bg-sidebar: #12110f; --bg-subtle: #22211e; --bg-raised: #201f1c;
    --border-default: #2e2c28; --border-control: #706d65;
    --text-primary: #eceae4; --text-secondary: #aaa69c; --text-placeholder: #8e8a80;
    --primary: #eceae4; --on-primary: #1c1b18;
    --accent: #8ea4ff; --accent-subtle: #1f2645; --accent-text: #b6c3ff;
    --success: #74cf98; --success-subtle: #15291d;
    --warning: #eab565; --warning-subtle: #2f2513;
    --danger: #ff9286; --danger-subtle: #361a16; --on-danger: #171614;
    --source-slack: #d6a3e4; --source-slack-subtle: #2b1d31;
    --shadow-overlay: 0 8px 24px rgba(0,0,0,0.55);
    color-scheme: dark;
  }
}
:root {
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; --space-8: 32px; --space-12: 48px;
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px; --radius-full: 999px;
  --font-sans: Geist, "Helvetica Neue", Arial, sans-serif;
  --font-serif: Newsreader, Georgia, "Times New Roman", serif;
  --font-mono: "Geist Mono", ui-monospace, Menlo, Consolas, monospace;
}
```

### components.css

```css
@import url("https://fonts.googleapis.com/css2?family=Geist:wght@400;500&family=Geist+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap");

/* DevHub components. Every color, radius and space comes from tokens.css. */

.dh-root { font-family: var(--font-sans); font-size: 16px; line-height: 24px; color: var(--text-primary); background: var(--bg-canvas); -webkit-font-smoothing: antialiased; }
.dh-root *, .dh-root *::before, .dh-root *::after { box-sizing: border-box; }
.dh-sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.dh-icon { width: 20px; height: 20px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
.dh-mono { font-family: var(--font-mono); font-size: 14px; }

/* Focus: one ring for everything */
.dh-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Button */
.dh-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); height: 40px; padding: 0 16px; border-radius: var(--radius-sm); border: 1px solid transparent; font: inherit; font-weight: 500; cursor: pointer; text-decoration: none; white-space: nowrap; }
.dh-btn--primary { background: var(--primary); color: var(--on-primary); }
.dh-btn--primary:hover { opacity: .88; }
.dh-btn--secondary { background: var(--bg-raised); color: var(--text-primary); border-color: var(--border-control); }
.dh-btn--secondary:hover { background: var(--bg-subtle); }
.dh-btn--ghost { background: transparent; color: var(--text-primary); }
.dh-btn--ghost:hover { background: var(--bg-subtle); }
.dh-btn--danger { background: var(--danger); color: var(--on-danger); }
.dh-btn--sm { height: 32px; padding: 0 12px; font-size: 14px; }
.dh-btn--icon { width: 40px; padding: 0; }
.dh-btn--icon.dh-btn--sm { width: 32px; }
.dh-btn[disabled], .dh-btn[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }

/* Breadcrumb */
.dh-breadcrumb { min-width: 0; }
.dh-breadcrumb ol { display: flex; align-items: center; gap: var(--space-1); min-width: 0; list-style: none; margin: 0; padding: 0; color: var(--text-secondary); }
.dh-breadcrumb li { display: inline-flex; align-items: center; gap: var(--space-1); flex-shrink: 0; white-space: nowrap; }
.dh-breadcrumb li:last-child { flex-shrink: 1; min-width: 0; }
.dh-breadcrumb li + li::before { content: "/"; color: var(--text-secondary); padding: 0 var(--space-1); }
.dh-breadcrumb a { color: var(--text-secondary); text-decoration: none; border-radius: 4px; padding: 4px; }
.dh-breadcrumb a:hover { color: var(--text-primary); background: var(--bg-subtle); }
.dh-breadcrumb [aria-current="page"] { color: var(--text-primary); font-weight: 500; padding: 4px; overflow: hidden; text-overflow: ellipsis; }

/* Tabs: underline, for switching content inside a page */
.dh-tabs { display: flex; gap: var(--space-6); border-bottom: 1px solid var(--border-default); overflow-x: auto; }
.dh-tab { position: relative; display: inline-flex; align-items: center; gap: var(--space-2); height: 48px; padding: 0 2px; border: 0; background: none; font: inherit; font-weight: 500; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.dh-tab:hover { color: var(--text-primary); }
.dh-tab[aria-selected="true"] { color: var(--text-primary); }
.dh-tab[aria-selected="true"]::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 2px; background: var(--accent); }
.dh-tab .dh-count { font-size: 12px; font-weight: 500; color: var(--text-secondary); background: var(--bg-subtle); border-radius: var(--radius-full); padding: 0 6px; }

/* Segmented control: for switching a view of the same content (Board / List) */
.dh-segmented { display: inline-flex; padding: 3px; gap: 2px; background: var(--bg-subtle); border-radius: var(--radius-sm); }
.dh-segment { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 0; border-radius: 4px; background: transparent; font: inherit; font-size: 14px; font-weight: 500; color: var(--text-secondary); cursor: pointer; }
.dh-segment[aria-pressed="true"], .dh-segment[aria-selected="true"] { background: var(--bg-raised); color: var(--text-primary); box-shadow: 0 0 0 1px var(--border-default); }

/* Sidebar nav */
.dh-sidebar { display: flex; flex-direction: column; gap: var(--space-4); background: var(--bg-sidebar); padding: var(--space-3); }
.dh-nav { display: flex; flex-direction: column; gap: 2px; }
.dh-nav-label { font-size: 14px; line-height: 20px; color: var(--text-secondary); padding: var(--space-2) 10px 4px; }
.dh-nav-item { display: flex; align-items: center; gap: var(--space-3); min-height: 40px; padding: 0 12px; border-radius: var(--radius-sm); color: var(--text-secondary); text-decoration: none; font-weight: 500; }
.dh-nav-item:hover { background: var(--bg-subtle); color: var(--text-primary); }
.dh-nav-item[aria-current="page"] { background: var(--bg-subtle); color: var(--text-primary); }
.dh-nav-item[aria-current="page"] .dh-icon { color: var(--accent); }
.dh-nav-item .dh-nav-meta { margin-left: auto; font-size: 12px; color: var(--text-secondary); }
.dh-nav-item .dh-nav-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Pills and chips */
.dh-pill { display: inline-flex; align-items: center; gap: var(--space-1); height: 24px; padding: 0 8px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 500; white-space: nowrap; background: var(--bg-subtle); color: var(--text-secondary); }
.dh-pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.dh-pill--plain::before { display: none; }
.dh-pill--info { background: var(--accent-subtle); color: var(--accent-text); }
.dh-pill--success { background: var(--success-subtle); color: var(--success); }
.dh-pill--warning { background: var(--warning-subtle); color: var(--warning); }
.dh-pill--danger { background: var(--danger-subtle); color: var(--danger); }
.dh-source { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: var(--text-secondary); }
.dh-source-mark { width: 20px; height: 20px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; }
.dh-source--jira .dh-source-mark { background: var(--accent-subtle); color: var(--source-jira); }
.dh-source--github .dh-source-mark { background: var(--bg-subtle); color: var(--source-github); }
.dh-source--slack .dh-source-mark { background: var(--source-slack-subtle); color: var(--source-slack); }
.dh-chip { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: var(--radius-full); border: 1px solid var(--border-default); background: var(--bg-raised); font: inherit; font-size: 14px; color: var(--text-primary); cursor: pointer; }
.dh-chip:hover { background: var(--bg-subtle); }

/* Avatar */
.dh-avatar { width: 28px; height: 28px; border-radius: var(--radius-full); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; background: var(--bg-subtle); color: var(--text-primary); border: 1px solid var(--border-default); flex-shrink: 0; }

/* Card: one work item on a board or in a list */
.dh-card { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border-radius: var(--radius-md); background: var(--bg-raised); border: 1px solid var(--border-default); }
.dh-card:hover { border-color: var(--border-control); }
.dh-card-top { display: flex; align-items: center; gap: var(--space-2); }
.dh-card-key { font-family: var(--font-mono); font-size: 14px; color: var(--text-secondary); }
.dh-card-title { font-weight: 500; color: var(--text-primary); text-decoration: none; }
.dh-card-title:hover { text-decoration: underline; }
.dh-card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); font-size: 14px; color: var(--text-secondary); }

/* Board column */
.dh-column { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.dh-column-head { display: flex; align-items: center; gap: var(--space-2); height: 32px; padding: 0 4px; font-weight: 500; }
.dh-column-head .dh-count { font-size: 12px; font-weight: 500; color: var(--text-secondary); }

/* List row: attention items */
.dh-row { display: flex; align-items: center; gap: var(--space-3); min-height: 56px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); }
.dh-row:hover { background: var(--bg-subtle); }
.dh-row + .dh-row { border-top: 1px solid var(--border-default); }
.dh-row-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.dh-row-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); text-decoration: none; }
.dh-row-sub { font-size: 14px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Input */
.dh-field { display: flex; flex-direction: column; gap: 6px; }
.dh-field-label { font-size: 14px; font-weight: 500; color: var(--text-primary); }
.dh-field-help { font-size: 14px; color: var(--text-secondary); }
.dh-input { height: 40px; width: 100%; padding: 0 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-control); background: var(--bg-raised); color: var(--text-primary); font: inherit; }
.dh-input::placeholder { color: var(--text-placeholder); }
.dh-search { position: relative; display: flex; align-items: center; }
.dh-search .dh-icon { position: absolute; left: 12px; color: var(--text-secondary); pointer-events: none; }
.dh-search .dh-input { padding-left: 40px; }

/* Composer: the one place to ask the agent */
.dh-composer { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border-radius: var(--radius-lg); background: var(--bg-raised); border: 1px solid var(--border-default); box-shadow: var(--shadow-overlay); }
.dh-composer textarea { border: 0; outline: none; resize: none; background: transparent; color: var(--text-primary); font: inherit; font-size: 16px; line-height: 24px; min-height: 48px; padding: 4px; }
.dh-composer textarea::placeholder { color: var(--text-placeholder); }
.dh-composer:focus-within { border-color: var(--accent); }
.dh-composer-bar { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.dh-composer-bar .dh-send { margin-left: auto; width: 36px; height: 36px; padding: 0; border-radius: var(--radius-full); }
.dh-picker { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-raised); font: inherit; font-size: 14px; font-weight: 500; color: var(--text-primary); cursor: pointer; }
.dh-picker:hover { background: var(--bg-subtle); }

/* Menu */
.dh-menu { display: flex; flex-direction: column; min-width: 260px; padding: 6px; border-radius: var(--radius-md); background: var(--bg-raised); border: 1px solid var(--border-default); box-shadow: var(--shadow-overlay); }
.dh-menu-label { font-size: 14px; line-height: 20px; color: var(--text-secondary); padding: 6px 8px 4px; }
.dh-menu-item { display: flex; align-items: center; gap: var(--space-3); min-height: 40px; padding: 6px 8px; border: 0; border-radius: var(--radius-sm); background: none; font: inherit; color: var(--text-primary); text-align: left; cursor: pointer; width: 100%; }
.dh-menu-item:hover, .dh-menu-item:focus-visible { background: var(--bg-subtle); }
.dh-menu-item small { display: block; font-size: 14px; color: var(--text-secondary); font-family: var(--font-mono); }
.dh-menu-sep { height: 1px; background: var(--border-default); margin: 6px 0; }

/* Callout: inline approval or notice */
.dh-callout { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); border: 1px solid var(--border-default); background: var(--bg-raised); }
.dh-callout--warning { background: var(--warning-subtle); border-color: transparent; }
.dh-callout--info { background: var(--accent-subtle); border-color: transparent; color: var(--accent-text); }
.dh-callout-title { font-weight: 500; color: var(--text-primary); }
.dh-callout--info .dh-callout-title { color: var(--accent-text); }
.dh-callout code { font-family: var(--font-mono); font-size: 14px; background: var(--bg-raised); border: 1px solid var(--border-default); border-radius: var(--radius-sm); padding: 6px 8px; color: var(--text-primary); }

/* Diff */
.dh-diff { font-family: var(--font-mono); font-size: 14px; line-height: 20px; overflow-x: auto; border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--bg-raised); }
.dh-diff-file { display: flex; align-items: center; gap: var(--space-2); padding: 8px 12px; border-bottom: 1px solid var(--border-default); background: var(--bg-sidebar); font-family: var(--font-mono); }
.dh-diff-line { display: grid; grid-template-columns: 44px 18px 1fr; white-space: pre; color: var(--text-primary); }
.dh-diff-line > span:first-child { text-align: right; padding-right: 8px; color: var(--text-secondary); user-select: none; }
.dh-diff-line--add { background: var(--success-subtle); }
.dh-diff-line--add > span:nth-child(2) { color: var(--success); }
.dh-diff-line--del { background: var(--danger-subtle); }
.dh-diff-line--del > span:nth-child(2) { color: var(--danger); }

/* Activity step (agent timeline) */
.dh-step { display: grid; grid-template-columns: 24px 1fr; gap: var(--space-3); }
.dh-step-dot { width: 24px; height: 24px; border-radius: var(--radius-full); display: inline-flex; align-items: center; justify-content: center; background: var(--bg-subtle); color: var(--text-secondary); }
.dh-step--done .dh-step-dot { background: var(--success-subtle); color: var(--success); }
.dh-step--wait .dh-step-dot { background: var(--warning-subtle); color: var(--warning); }
.dh-step-title { font-weight: 500; }
.dh-step-detail { font-size: 14px; color: var(--text-secondary); }

/* Skip link: first focusable element on every screen */
.dh-root { position: relative; }
.dh-skip { position: absolute; left: 8px; top: -60px; z-index: 30; padding: 8px 12px; border-radius: var(--radius-sm); background: var(--primary); color: var(--on-primary); font-weight: 500; text-decoration: none; }
.dh-skip:focus { top: 8px; }

/* Keyboard hint */
.dh-kbd { margin-left: auto; font-family: var(--font-mono); font-size: 12px; line-height: 16px; padding: 0 5px; border-radius: 4px; border: 1px solid var(--border-default); background: var(--bg-canvas); color: var(--text-secondary); }

/* Sidebar search and footer */
.dh-sidebar-search { display: flex; align-items: center; gap: var(--space-2); width: 100%; height: 40px; padding: 0 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-canvas); color: var(--text-secondary); font: inherit; cursor: pointer; }
.dh-sidebar-search:hover { border-color: var(--border-control); color: var(--text-primary); }
.dh-sidebar-foot { margin-top: auto; display: flex; flex-direction: column; gap: 2px; padding-top: var(--space-3); border-top: 1px solid var(--border-default); }
.dh-agent-status { display: flex; align-items: center; gap: var(--space-2); min-height: 32px; padding: 0 10px; font-size: 14px; color: var(--text-secondary); }
.dh-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: currentColor; }

/* Sidebar v2: header, counts, sessions, user */
.dh-sidebar-head { display: flex; align-items: center; gap: 10px; padding: 2px 2px 2px 6px; }
.dh-nav-count { margin-left: auto; min-width: 22px; height: 20px; padding: 0 6px; border-radius: var(--radius-full); border: 1px solid var(--border-default); background: var(--bg-canvas); font-size: 12px; font-weight: 500; line-height: 18px; text-align: center; color: var(--text-secondary); }
.dh-nav-item[aria-current="page"] .dh-nav-count { background: var(--primary); border-color: transparent; color: var(--on-primary); }
.dh-nav-head { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) 12px 4px; font-size: 14px; line-height: 20px; color: var(--text-secondary); }
.dh-nav-head a { margin: -6px 0 -6px auto; color: var(--text-secondary); text-decoration: none; border-radius: 4px; padding: 6px 4px; }
.dh-nav-head a:hover { color: var(--text-primary); background: var(--bg-subtle); }
.dh-session { display: flex; align-items: flex-start; gap: var(--space-3); padding: 8px 12px; border-radius: var(--radius-sm); color: var(--text-primary); text-decoration: none; }
.dh-session:hover { background: var(--bg-subtle); }
.dh-session[aria-current="page"] { background: var(--bg-raised); box-shadow: 0 0 0 1px var(--border-default); }
.dh-session-icon { width: 24px; height: 24px; margin-top: 1px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.dh-session-icon .dh-icon { width: 14px; height: 14px; stroke-width: 2; }
.dh-session-icon--wait { background: var(--warning-subtle); color: var(--warning); }
.dh-session-icon--run { background: var(--accent-subtle); color: var(--accent-text); }
.dh-session-icon--done { background: var(--success-subtle); color: var(--success); }
.dh-session-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.dh-session-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dh-session-sub { display: flex; align-items: center; gap: 4px; font-size: 14px; line-height: 20px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; }
.dh-state--wait { color: var(--warning); font-weight: 500; }
.dh-state--run { color: var(--accent-text); font-weight: 500; }
.dh-state--done { color: var(--success); font-weight: 500; }
.dh-user { display: flex; align-items: center; gap: var(--space-3); padding: 8px 10px; border-radius: var(--radius-sm); color: var(--text-primary); text-decoration: none; }
.dh-user:hover { background: var(--bg-subtle); }
.dh-user .dh-avatar { width: 36px; height: 36px; font-size: 12px; }

/* Resume banner: a session waiting on you */
.dh-resume { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 14px; border-radius: var(--radius-md); background: var(--warning-subtle); color: var(--text-primary); text-decoration: none; }
.dh-resume:hover { outline: 1px solid var(--warning); }
.dh-resume-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.dh-resume-text span:last-child { font-size: 14px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Stepper: where a session is in its flow */
.dh-stepper { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; list-style: none; margin: 0; padding: 0; font-size: 14px; }
.dh-stepper li { display: inline-flex; align-items: center; gap: 6px; color: var(--text-secondary); }
.dh-stepper li + li::before { content: ""; width: 20px; height: 1px; margin-right: 2px; background: var(--border-control); }
.dh-step-num { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; border: 1px solid var(--border-control); color: var(--text-secondary); }
.dh-stepper [data-state="done"] .dh-step-num { background: var(--success-subtle); border-color: transparent; color: var(--success); }
.dh-stepper [data-state="current"] { color: var(--text-primary); font-weight: 500; }
.dh-stepper [data-state="current"] .dh-step-num { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }

/* Empty state */
.dh-empty { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: var(--space-8) var(--space-4); color: var(--text-secondary); text-align: center; }

/* File list (changed files) */
.dh-filelist { display: flex; flex-direction: column; border: 1px solid var(--border-default); border-radius: var(--radius-md); overflow: hidden; }
.dh-file { display: flex; align-items: center; gap: var(--space-2); min-height: 40px; padding: 0 12px; border: 0; border-left: 2px solid transparent; background: var(--bg-raised); font: inherit; font-size: 14px; color: var(--text-primary); text-align: left; cursor: pointer; }
.dh-file + .dh-file { border-top: 1px solid var(--border-default); }
.dh-file:hover { background: var(--bg-subtle); }
.dh-file[aria-current="true"] { background: var(--accent-subtle); border-left-color: var(--accent); }
.dh-file-path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); }

/* Choice card (radio as a card) */
.dh-choice { display: flex; gap: 10px; align-items: flex-start; padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border-default); background: var(--bg-raised); cursor: pointer; }
.dh-choice:has(input:checked) { border-color: var(--accent); background: var(--accent-subtle); }
.dh-choice input { margin: 3px 0 0; width: 16px; height: 16px; accent-color: var(--accent); }

/* Page frame: every screen = page bar + optional toolbar + body */
.dh-main { display: flex; flex-direction: column; min-width: 0; background: var(--bg-canvas); }
.dh-pagebar { display: flex; align-items: center; gap: var(--space-3); min-height: 56px; padding: 8px 16px; border-bottom: 1px solid var(--border-default); }
.dh-pagebar-actions { margin-left: auto; display: flex; flex-shrink: 0; align-items: center; gap: var(--space-2); }
.dh-pagebar-meta { flex-shrink: 0; font-size: 14px; color: var(--text-secondary); }
.dh-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-height: 56px; padding: 8px 16px; border-bottom: 1px solid var(--border-default); }
.dh-pagebody { padding: 0 16px; min-width: 0; }
.dh-pagebody-col { display: flex; flex-direction: column; gap: var(--space-6); width: 100%; max-width: 960px; min-width: 0; margin: 0 auto; padding: var(--space-6) 0 var(--space-8); }
.dh-pagebody-col--narrow { max-width: 720px; }
.dh-pagebody-col--full { max-width: none; }
@media (max-width: 767px) { .dh-pagebar-meta { display: none; } }
@media (min-width: 768px) { .dh-pagebar, .dh-toolbar, .dh-pagebody { padding-left: 48px; padding-right: 48px; } }

/* Panel: a bordered surface holding a list */
.dh-panel { border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--bg-raised); overflow: hidden; }
.dh-panel-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); padding: 14px 16px 0; }
.dh-panel .dh-tabs { padding: 0 16px; }
.dh-panel .dh-row { border-radius: 0; padding: 10px 16px; }

/* Status icons: shape carries the state (Linear-style) */
.dh-status-icon { width: 20px; height: 20px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 2; }
.dh-status--todo { color: var(--text-secondary); }
.dh-status--doing { color: var(--warning); }
.dh-status--review { color: var(--accent); }
.dh-status--done { color: var(--success); }

/* Card details */
.dh-card { gap: 6px; padding: 10px 12px 10px; }
.dh-card-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dh-card-meta { gap: 10px; min-height: 24px; }
.dh-meta-item { display: inline-flex; align-items: center; gap: 4px; }
.dh-meta-item .dh-icon { width: 16px; height: 16px; }
.dh-meta-item--soon { color: var(--warning); font-weight: 500; }
.dh-prio { display: inline-flex; align-items: center; gap: 4px; }
.dh-prio svg { width: 16px; height: 16px; }
.dh-prio rect { fill: var(--border-control); opacity: .35; }
.dh-prio--high rect, .dh-prio--med rect:nth-child(-n+2), .dh-prio--low rect:first-child { fill: var(--text-primary); opacity: 1; }
.dh-tag { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
.dh-tag--bug { color: var(--danger); }
.dh-agent-chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; margin-left: auto; border-radius: var(--radius-full); font-size: 12px; font-weight: 500; text-decoration: none; background: var(--warning-subtle); color: var(--warning); }
.dh-card-action { margin-left: auto; color: var(--text-secondary); }
.dh-card-action:hover { color: var(--accent); }
.dh-column-head .dh-btn { margin-left: auto; color: var(--text-secondary); }

/* Composer context: what the + button adds */
.dh-context-row { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 2px 0; }
.dh-context { display: inline-flex; align-items: center; gap: 6px; max-width: 300px; height: 32px; padding: 0 4px 0 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); background: var(--bg-sidebar); font-size: 14px; font-weight: 500; color: var(--text-primary); }
.dh-context-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.dh-context-remove { width: 24px; height: 24px; flex-shrink: 0; border: 0; border-radius: 4px; background: none; color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.dh-context-remove:hover { background: var(--bg-subtle); color: var(--text-primary); }
.dh-menu-head { display: flex; align-items: center; gap: 6px; padding: 2px 2px 6px; font-weight: 500; }
.dh-menu-item .dh-desc { display: block; font-size: 14px; line-height: 20px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dh-menu-item .dh-menu-text { flex: 1; min-width: 0; }
.dh-menu-foot { padding: 6px 8px 2px; font-size: 14px; color: var(--text-secondary); border-top: 1px solid var(--border-default); margin-top: 4px; }

@media (prefers-reduced-motion: reduce) { .dh-root * { transition: none !important; animation: none !important; } }
```
