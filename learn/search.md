<!-- learn-sources: packages/contracts/src/search.ts packages/core/src/search/search-service.ts packages/core/src/routes/search.ts packages/core/src/inbox/inbox-service.ts packages/core/src/sessions/ticket-sessions.ts packages/api-client/src/queries.ts packages/ui/src/components/dialog.tsx packages/ui/src/components/search-palette.tsx packages/ui/src/components/search-result.tsx packages/app/src/features/search/search-results.ts packages/app/src/features/search/components/search-dialog.tsx packages/app/src/shell/shortcuts.ts packages/app/src/shell/use-shortcuts.ts packages/app/src/words/match-words.ts packages/app/src/live-updates.tsx -->

# Search: ⌘K over what DevHub already holds

Spec 009 opens a search dialog over any page with ⌘K (Ctrl+K off a Mac) or the sidebar's Search. Three ideas carry it. It finds only what DevHub already holds, so it never waits on Jira or GitHub. The browser does the matching, so typing never sends a request. And the dialog keeps focus in its box while the arrow keys move through the results.

## The path

```
⌘K / Ctrl+K ── use-shortcuts.ts (capture phase) ──▶ useSearchStore.toggle()
Search button ───────────────────────────────────▶ useSearchStore.setOpen(true)
                                                          │
                                       SearchDialog: Dialog + SearchPalette
                                                          │ first open only
page ── GET /api/search ──▶ search-service.read()
                              inbox.records()     assigned issues and every open pull request, no inbox rules
                              tickets.read()      the sprint, in rank order (spec 008)
                              listSessions()      every session, newest first
                              searchIndex()       → SearchIndex: tickets, pull requests, sessions, tools
                                                          │
                       searchResults(index, query)  in the browser, as you type
                                                          │
                       Enter or a click: a ticket's session or Jira, a pull request on GitHub, a session
```

## What it finds (Q1)

- **Tickets:** the sprint first, in Jira's rank order, then the other issues assigned to you that aren't Done, by key (PROJ-7 before PROJ-1377). A ticket in both shows once. Each opens its newest session, unless that one was stopped, else Jira. That's 008's rule, now in `sessions/ticket-sessions.ts` so Tickets and search can't drift apart.
- **Pull requests:** every open one the GitHub read brings, yours and those waiting for your review, newest opened first. Before 009 the cache kept only the ones an inbox rule matched, so your own pull request with green checks couldn't be found. Now `github/map.ts` keeps them all with `openedAt`, and the rules still decide what Home shows. A record cached before `openedAt` existed reads with null and sorts last until the next sync.
- **Sessions:** all of them, newest first. Until spec 011 creates sessions, this group stays empty.
- **Not:** Slack messages (spec 016), anything DevHub never synced (other people's issues, closed tickets, merged pull requests), or descriptions and comments, which the cache never holds.

The inbox rules don't hide anything from search. `InboxService.records()` hands over each connected tool's records with no rules applied, and Home's `read()` builds on the same call. A tool that isn't connected gives nothing, and a tool whose last sync failed still gives its last records. `tools` tells the dialog which tools are still on their first sync.

## Why the browser matches

The whole index is small (about 700 rows at most), so `GET /api/search` sends it once, when the dialog first opens. `searchQueryOptions` keeps it with `staleTime: Infinity`, and `inbox.changed`, `status.changed` and `sessions.changed` mark it stale (`live-updates.tsx`). That gives three things. Typing is instant, because no request rides on a keystroke. The dialog works with Jira and GitHub offline. And it matches the way Home does: `words/match-words.ts` needs every word typed, in any case, and isn't fuzzy, for both lists.

`search-results.ts` does the rest, as pure functions:

- It matches each kind on its own words: a ticket on its key, title and status; a pull request on its title, repository, `#number` and author; a session on its title, its ticket key or `PR #n`, and its state word.
- It puts an exact key or number first in its group ("proj-1423", "2841" or "#2841").
- It shows at most 6 a group, with "Tickets · 6 of 23" when more match.
- It writes the count a screen reader hears.

## How ⌘K gets through

`useGlobalShortcuts` listens on `window` in the capture phase, so a widget that stops keydown can't swallow the key. It calls `preventDefault`, because Chrome and Firefox both use Ctrl+K for their own search, and a page may take it, as GitHub and Slack do. The matcher wants exactly ⌘ (or Ctrl), no Shift and no AltGr, so ⇧⌘K and AltGr+K stay the browser's. Pressing it again closes the dialog (Q2d). The Search button shows the same key from `searchShortcut()`, with `aria-keyshortcuts`, and says it opens a dialog.

## The dialog

- **`Dialog`** is Radix Dialog with no `Overlay`. Radix locks scrolling only through its overlay, so leaving it out means the page's scrollbar never goes and nothing shifts sideways. It also means there's no dimmed backdrop, which the design system has no token for anyway. A click beside the dialog still closes it: Radix stops pointer events on the page while it's open, so the click lands outside the content.
- **Focus comes back to what had it.** Radix gives focus back to a trigger only. Opened by ⌘K there's no trigger, so `DialogContent` remembers the focused element when it opens and focuses it again when it closes. That's how a half-typed field keeps both its text and the focus.
- **`SearchPalette`** is an ARIA combobox. Focus stays in the box, and ↓ and ↑ move `aria-activedescendant` across the groups' options, stopping at the ends. Typing makes the first result active again. When a sync changes the results under you, the active one stays while it's there. The box's text is a react-hook-form field, and the body unmounts when the dialog closes, so search opens empty every time.
- **Each result is named by its own words,** with hidden commas between the parts ("PROJ-1423, Add bulk archive, In Progress"). An `aria-label` failed axe in a real browser, because it didn't hold the visible text. Under 480 px the meta leaves the eye but stays in the name. The hidden comma after a long title sits inside the title's own `relative` box: placed in the row's box, it landed past the whole untruncated title and widened the results at 360 px. That's the same trap as Tickets' hidden words (spec 008).

## States

Nothing typed shows a hint. Typing while the list is still on its way shows three loading rows the size of a result. With nothing connected and no sessions, it says "Nothing to search yet" and links to Settings › Connections. Text that matches nothing says "No matches". A tool still on its first sync adds a quiet line under the results. A server that doesn't answer says "Couldn't load search" with Try again.
