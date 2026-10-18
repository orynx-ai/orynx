# Plan: Search

Spec: `specs/009-search/spec.md`

## Order of work

1. **Contract first.** `@devhub/contracts` gets `search.ts`: the ticket, pull request and session results, each tool's state (reusing 007's `InboxToolStateSchema`) and each result's link (reusing 007's `InboxTargetSchema`, so search can only send you to Jira, github.com or a session). The server and the client both build on it.
2. **The server, from the data up.**
   - GitHub's map keeps every open pull request the sync already reads (Q1c), and records when each was opened for the newest-first order. Home doesn't change, because `pullRequestRow` already gives no row to a pull request that needs nothing from you.
   - `InboxService` gains `records()`: the connected tools' records and states, without the inbox rules. `read()` builds on it.
   - A search service puts tickets, pull requests and sessions in their order and gives each ticket its session or its Jira link.
   - Then `GET /api/search`, with the local-only checks and a leak test.
3. **The api-client.** `search()` and `searchQueryOptions`, parsed with the contract.
4. **The `@devhub/ui` parts, apart from the app.** `Dialog`, then the result row and group label, then the search palette: the head's combobox, the listbox, and the arrow keys and Enter. Each part has stories for its states and a test, so its look and keyboard use are settled before the app uses it.
5. **The app, in three steps a person can try.** The matching rule first moves out of Home into a shared function, so both lists match the same way. Then:
   - ⌘K and the Search button open an empty dialog, and it closes again.
   - Results appear as you type, and opening one works.
   - The loading, empty, syncing and error states.
6. **End to end and docs.** An e2e run with Jira and GitHub faked, then `docs/architecture.md` and a `learn/` page.
7. **Wait for 008.** Move onto `main` once 008 merges, take 008's `SearchField`, then add the sprint's tickets (Q1d).
8. **The real browser check,** at 360 and 1280 px in light and dark, after the sprint is in. Then `/review`.

## Risks

| Risk                                                                                                                                                          | How we will notice early                                                         | What we do                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 008 merges with changes to the same files: `SearchField`, `live-updates.tsx`, contracts `index.ts`, `routes.ts` and `testing.ts`, and the inbox cache's parts | Task 16's rebase                                                                 | Keep this branch's edits to shared files small and additive, take 008's `SearchField`, and run `pnpm verify` after the rebase |
| The browser keeps ⌘K or Ctrl+K: Chrome and Firefox focus their own search on Ctrl+K                                                                           | The e2e run presses the key in Chromium. Task 18 tries it in a real browser      | Listen in the capture phase and call `preventDefault`, as ⌘N does. If a browser still takes it, stop and ask                  |
| Radix Dialog's scroll lock takes the page's scrollbar away and the page jumps sideways (AC-1, AC-29)                                                          | Task 18 measures layout shift while it opens                                     | Turn off Radix's scroll lock: there's no backdrop, and the page behind may scroll                                             |
| Focus doesn't come back to a text field when ⌘K opened the dialog with no trigger (AC-3)                                                                      | Task 11's test types in Home's search box, presses ⌘K, then Esc                  | Radix's focus scope gives focus back to what had it before. If that fails, remember the element when the dialog opens         |
| Adding when a pull request was opened to its record changes the cache's shape                                                                                 | Task 2's test reads a record written before the change                           | Make the field default to null for older records, so nothing is dropped. The next sync fills it                               |
| The combobox's `aria-activedescendant` across grouped options fails axe, or a screen reader doesn't read the active row                                       | Task 9's axe test and stories                                                    | Follow the WAI-ARIA combobox pattern with `role="group"` for each group and an `aria-labelledby` group label                  |
| Opening a Jira or GitHub link from Enter is blocked as a pop-up                                                                                               | Task 12's test, through the platform's `openExternal`. Task 18 in a real browser | Call `openExternal` inside the keydown handler, which counts as the user's own action                                         |
| Core edits restart the `pnpm dev` server, and its in-memory keychain loses the tokens you connected                                                           | Each server task                                                                 | Tell the user before tasks 2 to 5 and 17, so they can connect again afterwards                                                |

## Touches

- Packages: contracts, core, api-client, ui, app, plus `e2e/`, `docs/architecture.md`, `docs/design-map.md` and `learn/`
- Gates that check this work: boundaries, style-policy, component-coverage, test-policy, specs, learn-freshness, secrets. Also `pnpm typecheck`, `pnpm lint`, Storybook a11y and coverage of 90% or more
- Skills to follow: `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/integration-adapter/SKILL.md`, `.claude/skills/add-ui-component/SKILL.md`, `.claude/skills/server-state/SKILL.md`, `.claude/skills/client-state/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`, `.claude/skills/clean-ui/SKILL.md`
