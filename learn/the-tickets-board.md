<!-- learn-sources: packages/contracts/src/tickets.ts packages/core/src/integrations/jira/client.ts packages/core/src/integrations/jira/connection.ts packages/core/src/integrations/jira/sprint-map.ts packages/core/src/tickets/tickets-service.ts packages/core/src/inbox/inbox-service.ts packages/core/src/sessions/ticket-sessions.ts packages/core/src/routes/tickets.ts packages/api-client/src/queries.ts packages/app/src/features/tickets/queries.ts packages/app/src/features/tickets/ticket-words.ts packages/app/src/features/tickets/filters.ts packages/app/src/features/tickets/tickets-screen.tsx packages/app/src/features/tickets/components/sprint-pickers.tsx packages/app/src/features/tickets/components/tickets-toolbar.tsx packages/app/src/features/tickets/components/tickets-board.tsx packages/app/src/features/tickets/components/ticket-card.tsx packages/app/src/features/tickets/components/tickets-list.tsx packages/ui/src/components/combobox.tsx packages/ui/src/components/filter-menu.tsx -->

# The Tickets board: a sprint, the way your team's board shows it

Spec 008 lays a Jira sprint out as four columns, or as a list. Three ideas carry it. Orynx finds your sprint on its own, and since spec 020 you can pick any project's sprint instead. The columns come from the sprint's own board, by status id, never by a status's name. And the sprint syncs with Home's inbox, so it opens from the cache at once.

## The path

```
inbox-service.sync()  ──▶ tickets-service.sync()           beside Jira's issues and GitHub, on its own
                              │
          jira connection.credentials()
          settings.json `tickets`   which sprint (spec 020); nothing saved means your sprint
          find the sprint:
            your sprint       client.mySprints()       /myself, /field, search/jql → pickSprint()
            a project's       client.projectSprints()  its active sprint ending first, else its first future one
            one held sprint   client.sprint(id)        /rest/agile/1.0/sprint/{id}
          client.boardColumns()     /rest/agile/1.0/board/{id}/configuration
          client.sprintIssues()     search/jql "sprint = 42 ORDER BY Rank ASC", 100 a page, at most 300,
                                    then your own past the first 300 ("… AND assignee = currentUser()")
          client.statusCategories() /rest/api/3/status, only when the board shows a status not yet known
          sprintRecord()            → cache.db, part `jira_sprint`, kept with the choice it was read for
                              │
                     publish inbox.changed
                              ▼
page ── GET /api/tickets ──▶ tickets-service.read()   cache + each ticket's newest session → Tickets
```

No sprint skips the board: `client.account()` says who you are, then `client.issuesWithoutSprint()` reads the tickets (below).

## Your sprint (Q1)

A site has a sprint per team board, so until you pick one, Orynx works out yours. It asks for your issues in open sprints (`assignee = currentUser() AND sprint in openSprints() AND sprint not in futureSprints()`), with the sprint field. That field is a custom field whose id differs from site to site, so `/rest/api/3/field` finds it by its type (`com.pyxis.greenhopper.jira:gh-sprint`). `openSprints()` brings future sprints too, so the search leaves them out (an issue sits in one open sprint at a time) and `pickSprint()` keeps only active ones as well, then picks the one holding most of your issues, and the one that ends first on a tie. A site with no sprint field (no Jira Software), or none of your issues in an active sprint, shows "None of your tickets is in an active sprint".

## Picking a project and a sprint (spec 020)

Two pickers open the toolbar (`sprint-pickers.tsx`):

- **Project** is a `Combobox` from `@devhub/ui`: a field drawn like Select that opens a list with a search box. "Your sprint" comes first, then the Jira projects you can see ("WEB · Web app"), from the same `GET /api/jira/projects` that Settings › Repositories reads, asked only while the list is open. Typing narrows the list by key or name. The list opens on your pick and stays on it when the projects arrive after it opened, so Enter keeps it. A pick the server refuses puts the page back and shows spec 005's "Couldn't save that change." under the pickers. No sprint and a sprint share one page, so a pick that empties or fills it keeps focus on the picker.
- **Sprint** is a `Menu`. It lists the project's active sprints, ending soonest first, then its future ones, starting soonest, each with a line from `openSprintLine()` ("Active · ends 24 Oct", "Future · starts 27 Oct"). It ends with "No sprint". With Your sprint, it lists the sprints of your sprint's project, when its board has one.
- Both lists are compact (`size="sm"`): 32 px rows in `text-small`, at most 360 px tall, and a longer list scrolls inside them.

The pick is one object, `TicketsChoiceSchema` in `contracts/src/tickets.ts`:

| `projectKey` | `sprintId` | Tickets shows                                                                                                           |
| ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| null         | null       | your sprint, as above (the default)                                                                                     |
| `WEB`        | null       | WEB's current sprint: its active sprint that ends first, else its first future one. It follows WEB as sprints roll over |
| `WEB`        | `43`       | sprint 43, held even after it closes, until you pick another                                                            |
| `WEB` / null | `'none'`   | the tickets in no sprint that aren't Done: WEB's backlog, or with no project, your own in any project                   |

The schema refuses a sprint without its project.

**Saved on the server, not in the browser.** The 2-minute sync has to read the sprint you picked, and the sidebar's Tickets count has to count it, so the pick can't live in the browser. `PUT /api/tickets/choice` has `tickets.choose()` write it to `settings.json` under `tickets`. Your sprint writes nothing, so the default leaves no trace. The route then calls `inbox.sprintAfterChange()`, which starts a sprint pass at once. A pass already running read the old choice, so another follows it.

**The old sprint never shows under the new name.** The cache keeps the sprint with the choice it was read for: `{ for: choice, record }`. If the saved choice differs, `read()` answers `syncing` with no tickets, so the page shows its loading board until the pass ends and `inbox.changed` brings the new sprint to every open tab. If the last sync failed, it says so instead. The page doesn't wait for the server to say this: `useChooseTicketsSprint()` puts the same loading state in the cache when you pick (`onMutate`). A row written before spec 020 holds the record alone, and counts as read for your sprint.

**The Sprint menu asks Jira now.** `GET /api/tickets/sprints?project=WEB` runs only while the menu is open. It goes through `connection.openSprints()`, which reads the token as `projects()` does, to `client.projectSprints()`. That asks for the project's Scrum boards (`/rest/agile/1.0/board?projectKeyOrId=WEB&type=scrum`, at most 10), then for each board's open sprints, side by side (`/rest/agile/1.0/board/{id}/sprint?state=active,future`, at most 50 each). A sprint on two boards shows once. A board that's gone, hidden or keeps no sprints (404, 403 or 400) is skipped. The answer is kept for a minute under `['jira', 'sprints', project]`. That key is outside `queryKeys.tickets`, so a sync's `inbox.changed` never asks Jira for it again. While it loads, the menu is `aria-busy` and draws two rows the size of a sprint's (a menu may hold menu items alone, so there's no status inside it). A failed read says "Sprints didn't load." with Try again, and the sprint shown doesn't change. A project with no open sprint says "WEB has no open sprints." in the menu and on the page.

**No sprint** reads `issuesWithoutSprint()`: `project = WEB AND sprint is EMPTY AND statusCategory != Done`, or `assignee = currentUser()` in place of the project. The key goes into the query as it is, because the contract lets a project key hold only capital letters, digits and `_`. The read is the one a sprint gets (`rankedIssues()` in `client.ts`, shared with `sprintIssues()`): rank order, at most 300, then your own past those. No board orders these tickets, so they sit in To do, In progress and Done by status category, and In review stays empty. The record's `sprint` is null, and the page names it "No sprint".

## The columns (Q2)

Jira has three status categories (To do, In progress, Done), but the design has a fourth column, In review. Matching a status called "Review" by its name would break on the first team that calls it "QA" or "Klar". So the board's own configuration decides. To do and Done follow the category. Among In progress statuses, those in the board's first column that holds any In progress status go to In progress, and those in a later column go to In review. The board names statuses by id only, so Orynx also reads every status's category from `/rest/api/3/status` (any user may). It keeps that list between syncs and asks again only when the board shows a status it doesn't know. A board that's gone or hidden from you (404, or a plain 403) isn't a failure: every In progress ticket is In progress, and In review stays empty.

## The cache

The link isn't cached: `read()` builds each ticket's link from the saved site, so a `cache.db` someone else wrote can't point a title anywhere else, and the contract checks it with `JiraLinkSchema` from `contracts/src/jira.ts`. The record is checked against the contract before it's written, so one bad field fails the sync and keeps the last good sprint.

The sprint is one JSON record in `cache.db`, in its own part (`jira_sprint`), next to Home's tools: the choice it was read for, the sprint's name, end and project, and its tickets in rank order, with titles and metadata only. The sprint reads never ask for a description or comment, and `sprintRecord()` copies only the fields it names, so one a proxy sent anyway never lands (`inbox/no-leaks.test.ts`). The only read that asks for a description is spec 011's `client.issue()`, when a session starts, and its answer stays out of the cache (`learn/connecting-jira.md`). Each ticket's session isn't kept: `read()` joins the newest session on each ticket from the session store, unless that one was stopped. The rule lives in `sessions/ticket-sessions.ts`, because ⌘K search (spec 009) opens a ticket by the same one. The part keeps its own last sync and problem, so a failed sprint read shows 007's quiet line on Tickets and leaves Home alone. Disconnecting Jira and Clear cache take it away.

A big shared sprint can hold more than 300 issues, and yours may rank past the first 300; with Assignee: Me on by default the board would then be empty. So when the sprint is cut short, a second read brings your own issues and adds the ones still missing after the first 300. Anything the first read left out ranks after all of it, so the list stays in rank order. A real Jira site showed this on the first look (spec 008, task 21).

The project key in the page bar ("PROJ · ends 24 Oct") comes from the sprint's issue keys: one project gives its key, several give none.

## In the browser

- `ticket-words.ts` writes every word from data with the laptop's calendar, the way Home writes its dates ("Mon", "28 Oct", "Overdue · 2 d"), with a spoken form ("Due Monday") for screen readers. The calendar helpers are shared with Home in `packages/app/src/words/`, and so, since spec 013, are the due words (`words/due.ts`) and the status pills' tones (`words/status-tone.ts`), which the Session screen's Ticket tab uses too.
- **Five filters** (spec 020, replacing 008's three chips): Assignee, Status, Type, Priority and Due. Each is a `FilterMenu` from `@devhub/ui`, the plain picker with a count of ticked options that Home's filters use too. Options in one filter widen it (any of them), and filters narrow each other (all of them). `filterOptions()` builds each menu from the sprint's own tickets: Me and Unassigned, then the people A to Z; the statuses in board order; the types A to Z; the priorities highest first, in the site's own order (each ticket's priority carries its `rank` in Jira's list, since Highest and High share a level); and Due's Overdue, This week and No due date. A value ticked in the address that no ticket has still shows, so it can be unticked.
- The filters live in the address as comma lists (`/tickets?assignee=me,unassigned&status=Code%20Review&due=overdue,week`), so a reload keeps them. A value's own comma is written `%2C` (and its `%` as `%25`), so a person named "Doe, Jane" stays one value. Only a filter that differs from the default is written: Assignee: Me isn't, and nothing ticked under Assignee is `assignee=anyone`. Spec 008's addresses still work: `assignee=anyone` means no Assignee filter, `due=week` means Due: This week, and `type=bug` means Type: Bug. Clear filters goes back to Assignee: Me, empties the search, and puts focus on Assignee. The search text is held by react-hook-form and isn't kept. Board or List is a persisted zustand preference (`devhub.tickets`). Its switch draws Hugeicons' `KanbanIcon` and `LeftToRightListBulletIcon`, and the filters' mark `FilterIcon`, through `<Icon>` (18 Oct 2026). When the hub doesn't answer, the page says "Couldn't load the sprint" and "Check that Orynx is still running, then try again." (`unreachableText`).
- A ticket with a live session shows its agent chip. One without shows Ship (spec 011, named Ship in spec 020): the sparkle on a card, an `IconButton` named "Ship PROJ-1423" whose tooltip says "Ship" (`ticket-card.tsx`), and "Ship" in the list's last column (`tickets-list.tsx`). Both are `ShipWithClaude`, which starts Claude on the ticket in a worktree, or says why it can't, and can add a folder on the way (`learn/sessions-and-worktrees.md`). A title that opens the ticket in Jira carries the external link's arrow (`WorkItemTitle`'s `external`, 18 Oct 2026).
- Due: This week and the card's amber date are one rule (`dueText(...).soon`): not Done, and due within 6 days or overdue.
- When a sync takes the focused card away, the board hands focus on: to the same ticket in its new column or its new place in the same column (a browser drops focus from an element it moves), else the next card, the one before, or the board itself. Focus that went elsewhere on the page is never taken back; focus that left with the window (another tab) still moves on. A card that takes focus in a half-hidden column is scrolled into view.
- Every state has an `h1`, hidden where the design draws none: "Sprint 42 tickets", "No sprint tickets", or "Tickets". When there's no sprint to show, the page keeps the Project and Sprint pickers, so another project is one pick away.
- Under 768 px the search field moves from the page bar to the start of the toolbar, so the page bar stays one line. `useWide()` moves it, so only one search field exists at a time; restyling stays in CSS.

## Testing

- `sprint-map.ts`, `ticket-words.ts` and `filters.ts` are pure and tested with plain data and a fixed local clock (Saturday 17 Oct 2026).
- `client.ts`, the service and the routes run against MSW standing in for Jira and the real cache. `test/fake-jira.ts` answers the field list, your sprints, the board, the sprint's pages and the status list, and since spec 020 a project's boards, their sprints and one sprint by id (`acceptingProjectSprints()`).
- The screen tests render the real app with `test/tickets.ts`, the design's nine-ticket Sprint 42, and fake only the network, the clock's `Date`, and two browser features jsdom lacks (`matchMedia`, `scrollIntoView`). `sprint-pickers.test.tsx` stands up a server that keeps the choice as the real one does, then picks a project, a sprint and No sprint the way a person would.
