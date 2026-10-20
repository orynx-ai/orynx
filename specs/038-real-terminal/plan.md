# Plan: Real terminal

Spec: `specs/038-real-terminal/spec.md`

## Order of work

1. Contracts: a tab is its id and number; input, size and the output stream's frames are schemas. Everything else builds on them.
2. Core: one pseudo-terminal per tab, its output kept for a replay, and the routes, with the token allowed in the output stream's URL.
3. API client: input, size, and the output stream through EventSource.
4. UI: `TerminalView` in `@devhub/ui`, with a story and a test.
5. App: the shell tab on `TerminalView`, Terminal in More actions, and × to close.
6. e2e and docs.

## Risks

| Risk                                            | How we will notice early                                                                  | What we do                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| node-pty doesn't load in the packed desktop app | Run it under Electron's own Node (`ELECTRON_RUN_AS_NODE=1`), then `pnpm test:e2e:desktop` | Use the prebuilt Node-API binaries; the hub's `node_modules` already sit beside `app.asar` as plain files |
| Keys arrive out of order                        | The app test of typing a line, and the e2e `read` test                                    | Send one request at a time, keys typed meanwhile in the next                                              |
| Esc closes the dialog while you're in vim       | The app test of Esc in your shell                                                         | The dialog ignores Esc from the shell's textarea                                                          |

## Touches

- Packages: contracts, core, api-client, ui, app, server
- Gates that check this work: boundaries, style-policy, component-coverage, icon-buttons, test-policy, env-policy, design-source
- Skills to follow: `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/add-ui-component/SKILL.md`, `.claude/skills/agent-runtime/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`
