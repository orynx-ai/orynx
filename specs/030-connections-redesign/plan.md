# Plan: Settings › Connections redesign

Spec: `specs/030-connections-redesign/spec.md`

## Order of work

1. **The designs first** (Q1). A script puts both exports in `docs/design/screens/` and their new CSS in `design-system.md`; the user runs and commits it. The screen's `// Design:` note can only name them once they are there (`pnpm gate design-source` checks the file exists), so the user runs it before the panel task (Task 13).
2. **Contracts → core → api-client** (Tasks 2–5). `IntegrationStatus` gains `account` and `checkedAt`, both optional so no fixture changes. One new endpoint per tool, `POST /api/<tool>/connection/check`, answers `{ status, ms }` through `CheckedStatus.checkNow`, which already exists for Claude's login. Reconnecting with a token reuses today's `PUT`; through gh it is the same check as Test. Nothing else on the server changes.
3. **`@devhub/ui` parts** (Tasks 6–7): `StatusButton` and its key look, `DetailList`, and a `narrow` `DialogContent`. Each has stories, a test and a `docs/design-map.md` row, so the app tasks only compose.
4. **The panel swap first** (Task 8). App tests render the whole app at a route (there is no harness for a lone component), so the dialog is tested through the page from the start. The new rows open `ConnectionDialog`, whose Not connected and Needs reconnecting states hold today's forms until their tasks, so connecting works at every commit (changed while building, 20 Oct 2026).
5. **The dialog, state by state** (Tasks 9–13): Test connection, Disconnect and the page message, Needs reconnecting (gh, then a token), then Not connected and Slack. Then the page-bar count and the `// Design:` note (Task 14).
6. **e2e** (Task 15): the two connect specs rewritten for the dialog, connected and reconnect states faked with `page.route` as `settings.spec.ts` already does, keyboard, 360 px, axe in both themes.

## Risks

| Risk                                                                                                                              | How we will notice early                                                   | What we do                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `checkedAt` inside the compared answer makes every 2-minute re-check publish `status.changed`, which also wakes the inbox sync    | A `checked-status` test: a re-check with the same answer publishes nothing | Keep `checkedAt` out of the stored answer; the service adds it from `CheckedStatus.checkedAt()`                                          |
| "Last checked" lags: a background re-check that finds nothing new sends no event                                                  | Seen in the browser check                                                  | Opening the dialog refetches status; the line shows what the server last answered, which is honest. `shortcut:` comment if it still lags |
| Cancel shuts the dialog mid-Reconnect, and `mutate()`'s own callbacks don't run once it unmounts, so the page message never shows | A dialog test that closes during a pending check                           | Page messages come from the mutation hooks' own `onSuccess` (they run unmounted), raised to the panel                                    |
| Today's forms carry their own buttons and Disconnect; in the dialog the buttons sit in its foot, outside the `<form>`             | Form tests submit with Enter and with Connect                              | Connect uses the `form` attribute; the forms lose Disconnect and their own button row                                                    |
| Focus: Radix moves focus on open, and the Jira form focuses its site field itself                                                 | Keyboard tests (AC-10, AC-11, AC-23)                                       | `onOpenAutoFocus` decides once per state; the forms' own focus effects go                                                                |
| jsdom can't see sizes: 36 px buttons, the 520 px dialog, the ellipsis                                                             | Browser check at 360 and 1280 px                                           | Measure in e2e (AC-25), never assert classes                                                                                             |
| Conflicts with `feat/notifications-shadcn-select` (settings-screen's page bar) and Slack's 016                                    | `git merge origin/main` before `/review`                                   | Merge early; Slack's step 2 stays 016's (Q4)                                                                                             |

## Touches

- Packages: contracts, core, api-client, ui, app; `e2e/`
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, icon-buttons, test-policy, specs
- Skills to follow: `add-api-endpoint`, `integration-adapter`, `add-ui-component`, `build-a-screen`, `clean-ui`, `server-state`, `forms`, `honest-tests`
