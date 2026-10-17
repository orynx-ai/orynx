<!-- learn-sources: packages/contracts/src/tickets.ts packages/core/src/integrations/jira/client.ts packages/core/src/integrations/jira/sprint-map.ts packages/core/src/tickets/tickets-service.ts packages/core/src/routes/tickets.ts packages/app/src/features/tickets/ticket-words.ts packages/app/src/features/tickets/filters.ts packages/app/src/features/tickets/tickets-screen.tsx packages/app/src/features/tickets/components/tickets-board.tsx -->

# The Tickets board: your sprint, the way your team's board shows it

Spec 008 lays your current Jira sprint out as four columns, or as a list. Three ideas carry it. DevHub finds the sprint on its own. The columns come from the sprint's own board, by status id, never by a status's name. And the sprint syncs with Home's inbox, so it opens from the cache at once.

## The path

```
inbox-service.sync()  ──▶ tickets-service.sync()           side by side with Jira's issues and GitHub
                              │
          jira connection.credentials()
          client.mySprints()        /myself, /field, search/jql: you, the sprint field, your open sprints
          pickSprint()              the active sprint holding most of your issues
          client.boardColumns()     /rest/agile/1.0/board/{id}/configuration
          client.sprintIssues()     search/jql "sprint = 42 ORDER BY Rank ASC", 100 a page, at most 300
          client.statusCategories() /rest/api/3/status, only when the board shows a status not yet known
          sprintRecord()            → cache.db, part `jira_sprint`
                              │
                     publish inbox.changed
                              ▼
page ── GET /api/tickets ──▶ tickets-service.read()   cache + each ticket's newest session → Tickets
```

## Which sprint (Q1)

A site has a sprint per team board, and DevHub has no setting naming yours. So it asks for your issues in open sprints (`assignee = currentUser() AND sprint in openSprints()`), with the sprint field. That field is a custom field whose id differs from site to site, so `/rest/api/3/field` finds it by its type (`com.pyxis.greenhopper.jira:gh-sprint`). `openSprints()` brings future sprints too, so `pickSprint()` keeps only active ones, then picks the one holding most of your issues, and the one that ends first on a tie. A site with no sprint field (no Jira Software), or none of your issues in an active sprint, shows "None of your tickets is in an active sprint".

## The columns (Q2)

Jira has three status categories (To do, In progress, Done), but the design has a fourth column, In review. Matching a status called "Review" by its name would break on the first team that calls it "QA" or "Klar". So the board's own configuration decides. To do and Done follow the category. Among In progress statuses, those in the board's first column that holds any In progress status go to In progress, and those in a later column go to In review. The board names statuses by id only, so DevHub also reads every status's category from `/rest/api/3/status` (any user may). It keeps that list between syncs and asks again only when the board shows a status it doesn't know. A board that's gone or hidden from you (404, or a plain 403) isn't a failure: every In progress ticket is In progress, and In review stays empty.

## The cache

The sprint is one JSON record in `cache.db`, in its own part (`jira_sprint`), next to Home's tools: the sprint's name, end and project, and its tickets in rank order, with titles and metadata only. No description or comment is ever asked for, and `sprintRecord()` copies only the fields it names, so one a proxy sent anyway never lands (`inbox/no-leaks.test.ts`). Each ticket's session isn't kept: `read()` joins the newest session on each ticket from the session store, unless that one was stopped. The part keeps its own last sync and problem, so a failed sprint read shows 007's quiet line on Tickets and leaves Home alone. Disconnecting Jira and Clear cache take it away.

The project key in the page bar ("PROJ · ends 24 Oct") comes from the sprint's issue keys: one project gives its key, several give none.

## In the browser

- `ticket-words.ts` writes every word from data with the laptop's calendar, the way Home writes its dates ("Mon", "28 Oct", "Overdue · 2 d"), with a spoken form ("Due Monday") for screen readers. The calendar helpers are shared with Home in `packages/app/src/words/`.
- The filters live in the address (`/tickets?assignee=anyone&due=week&type=bug`), so a reload keeps them. Only a filter that differs from the default is written, and an address DevHub can't read opens the defaults. The search text is held by react-hook-form and isn't kept. Board or List is a persisted zustand preference (`devhub.tickets`).
- Due this week and the card's amber date are one rule (`dueText(...).soon`): not Done, and due within 6 days or overdue.
- When a sync takes the focused card away, the board hands focus on: to the same ticket in its new column, else the next card, the one before, or the board itself. Focus that left the board on purpose is never taken back.
- Under 768 px the search field moves from the page bar to the start of the toolbar, so the page bar stays one line. `useWide()` moves it, so only one search field exists at a time; restyling stays in CSS.

## Testing

- `sprint-map.ts`, `ticket-words.ts` and `filters.ts` are pure and tested with plain data and a fixed local clock (Saturday 17 Oct 2026).
- `client.ts`, the service and the route run against MSW standing in for Jira (`test/fake-jira.ts`: the field list, your sprints, the board, the sprint's pages and the status list) and the real cache.
- The screen tests render the real app with `test/tickets.ts`, the design's nine-ticket Sprint 42, and fake only the network, the clock's `Date`, and two browser features jsdom lacks (`matchMedia`, `scrollIntoView`).
