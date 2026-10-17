# Plan: App shell and navigation

Spec: `specs/001-app-shell-and-navigation/spec.md`

## Order of work

1. **Contracts** for the session list, the `sessions.changed` event and the person's name in the status. Everything else is typed by them, so they come first.
2. **Core**: an in-memory session store behind a `SessionStore` interface, `GET /api/sessions?limit=` with the local-only checks, and a once-per-start `git config` read for the name. Each is tested with `app.inject()`, without the browser.
3. **API client**: `sessions()` parses with the contract. The `sessionsQueryOptions` keys all start with `["sessions"]`, so one event invalidates every list.
4. **UI**: `SessionItem` in `@devhub/ui` (icon shape, word and colour for all five states, and the current look), with a story per state. The sidebar and the View all page both use it, so it belongs in the design system and not in the shell.
5. **App, data**: the sidebar session list in its four states, the live-update mapping, `/sessions/$sessionId` and the View all list.
6. **App, footer**: name and initials from the status.
7. **App, keyboard**: `Platform.os`, the New task shortcut (⌥⌘N / Ctrl+Alt+N, ⌘N on desktop), focus moving to the main region, and the skip link moving focus.
8. **App, layout**: the collapsed rail's tooltips, then the compact top bar under 768 px. Layout comes last because it reshapes markup the earlier tasks have already proven.
9. **e2e** in a real Chromium: the shortcut really reaches the page, CLS is 0 when reloading with the sidebar collapsed, and the 360 px layout has no horizontal scroll.

## Risks

| Risk                                                                            | How we will notice early                                                | What we do                                                                          |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ⌥⌘N is also taken by a browser or by macOS                                      | The e2e test presses it in real Chromium and checks that Home has focus | Fall back to another key and tell the person                                        |
| jsdom applies no CSS, so phone-only and desktop-only markup both show in tests  | Duplicate role matches in the component tests                           | One set of elements, restyled per breakpoint, plus at most one phone-only link      |
| The persisted collapsed state loads after the first paint and the sidebar jumps | The e2e test measures `layout-shift` entries after a reload             | zustand `persist` with sync `localStorage` hydrates before render; keep it that way |
| `git config` is slow or missing on a machine                                    | The core test runs a missing binary and an empty config file            | A 2 s timeout, any failure means "no name", and the read happens once per start     |
| The design's 11 px mono key is below the 12 px minimum                          | style-policy and the design-system rule "Nothing smaller than 12px"     | Use 12 px (`text-label` with the mono font) and note it in the review               |

## Touches

- Packages: contracts, core, api-client, ui, app, web
- Gates that check this work: boundaries, style-policy, design-source, component-coverage, test-policy, env-policy, specs
- Skills to follow: `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/server-state/SKILL.md`, `.claude/skills/client-state/SKILL.md`, `.claude/skills/add-ui-component/SKILL.md`, `.claude/skills/build-a-screen/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`
