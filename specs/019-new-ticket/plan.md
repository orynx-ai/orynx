# Plan: New ticket in Jira

Spec: `specs/019-new-ticket/spec.md`

## Order of work

1. **Contracts.** `packages/contracts/src/jira-tickets.ts` has the project's types (each with its priorities, its default priority and whether it has a due date), the new ticket's request, and its answer: `made`, `made_but` (what Jira didn't do: `sprint` or `column`, and Jira's words), `refused` (Jira's words) or `unreachable`. It also adds two paths, `GET /api/tickets/jira/types?project=` and `POST /api/tickets/jira`, plus builders in `testing.ts`. These come first because every other step tests against them.
2. **Jira client.** `client.ts` gets the following, each tested with MSW:
   - `createTypes()`: the create metadata's types without sub-tasks, then each type's fields side by side (at most 20 types). This reads each type's priorities and whether the type has `duedate`, `description` and `assignee` on its create screen.
   - `createIssue()`: one POST. A 400 or 403 comes back as Jira's words, as `change()` does.
   - `addToSprint()`.
   - `transitions()` also gives the status id and category, and each target's id and category, for matching by id.

   This is the only file that talks to Jira. A small `fake-jira.ts` helper lets the service and route tests share the fake answers.

3. **Tickets service.** `TicketsService` gets `jiraTypes(project)` and `createJira(fields)`. They sit there so they can reuse `layoutOf()` and its cached status categories. `createJira` runs these steps:
   - read the credentials;
   - read `account()` and the type's screen side by side;
   - send only the fields on the screen;
   - add the issue to the sprint when one was named;
   - move the issue to the column, by a transition whose target status the board puts there (`columnOf()` with the sprint board's layout; with no sprint, by category alone). Nothing is retried or deleted.
4. **Routes.** Both routes go in `routes/tickets.ts`. A new ticket starts `inbox.sprintAfterChange()` (not awaited), so the board reads the sprint again. Route tests use `app.inject()`, cover a request without the token (401), and run a log check that no title, description or token reaches the hub's log (AC-18).
5. **API client.** `jiraTicketTypes(project)` and `createJiraTicket(fields)` both parse with the contract. `jiraTicketTypesQueryOptions` sits under `['jira', …]` so a sync never re-asks for it, with `gcTime: 0` so nothing is kept after the dialog closes.
6. **The form.** `TicketForm` takes an optional `jira` part: the project and sprint names, the types query, and the places on offer. Save in is a field of the same react-hook-form, so switching keeps the title and description (AC-5). On Jira, Type and Priority come from the types query:
   - while loading, `Skeleton`s the size of the selects show;
   - if the read fails, the AC-8 line shows with Try again;
   - Due date shows only for a type that has it.

   The form's schema lives in `features/tickets/schemas.ts`.

7. **The dialog and the screen.**
   - `NewTicketDialog` takes the Jira target and sends to `useCreateJiraTicket()`.
   - It shows `made_but` as AC-10's read-only view, with Open in Jira and Close.
   - It shows `refused` and `unreachable` in the problem line.
   - It invalidates `tickets` when a ticket is made.

   `tickets-screen.tsx` works out the target, in this order: the page bar's project, then the shown sprint's project; the shown sprint, or none for No sprint. It shows New and the column + when Orynx or Jira is on offer.

8. **e2e.** In `e2e/orynx-tickets.spec.ts`, open the dialog on Jira at 360 and 1280 px in light and dark, and run axe over each state (AC-16, AC-17).

## Risks

| Risk                                                                                                                                                                                                                                                            | How we will notice early                                | What we do                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spec AC-14/15 describe Save in as radios: one Tab stop, the arrow keys move, and a reader hears "selected, 1 of 2". Q6's answer picks `SegmentedControl`, which is toggle buttons with `aria-pressed`, each one a Tab stop (spec 006). The two sources disagree | Writing the form test for AC-14                         | Build with `SegmentedControl` as Q6 says, and test its real behaviour: a group named Save in, each place a pressed or unpressed button. A person must confirm, or amend, AC-14 and AC-15's wording                                         |
| A project leaves `assignee`, `priority` or `description` off its create screen, so Jira refuses the whole issue                                                                                                                                                 | The create metadata says which fields are on the screen | The server sends only the fields on the screen. Without `assignee` the issue is left unassigned (a commented shortcut)                                                                                                                     |
| A workflow has no way from its first status to the column (most often In review)                                                                                                                                                                                | The service test with the fake workflow                 | `made_but` with `column`. When Jira had no move at all, the words are Orynx's own: "there's no move there from To Do"                                                                                                                      |
| Read too early, the board doesn't hold the new card yet (it's read from the cache)                                                                                                                                                                              | The screen test for AC-3                                | The route starts a sprint pass. `inbox.changed` then reloads Tickets, and the app also invalidates `tickets` straight away                                                                                                                 |
| `createmeta` per type costs one call per type                                                                                                                                                                                                                   | The client test counts the calls                        | Side by side, at most 20 types, one 10 s wait shared by all of them                                                                                                                                                                        |
| Merging with spec 046, which runs on another branch at the same time                                                                                                                                                                                            | `git merge`                                             | This work touches only tickets, Jira, `contracts/jira-tickets.ts`, `contracts/routes.ts`, `contracts/index.ts`, `contracts/testing.ts`, api-client and its `client.ts`. 046 touches sessions and ui, so only the export lists can conflict |

## Touches

- Packages: contracts, core, api-client, app, e2e
- Gates that check this work: boundaries, test-policy, style-policy, design-source, icon-buttons, secrets, env-policy, specs; vitest coverage thresholds
- Skills to follow: `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/integration-adapter/SKILL.md`, `.claude/skills/server-state/SKILL.md`, `.claude/skills/forms/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`, `.claude/skills/build-a-screen/SKILL.md`, `.claude/skills/clean-ui/SKILL.md`
