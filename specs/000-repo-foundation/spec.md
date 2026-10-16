# Repo foundation

Status: done
Roadmap: Phase 1 — Foundation

## Assumptions

- One developer works on this repo alongside Claude, so the repo is set up for agents to write the code and a person to decide and approve.
- The first host is the browser; a desktop app comes later, so the code is split into packages a second host can reuse.
- English only in v1. All copy comes from `docs/product/spec.md` and `docs/design/screens/`.
- Node 24 and pnpm 10 are available on the developer's laptop.

## Goal

A developer can clone the repo, run `pnpm install && pnpm start`, and open DevHub at http://127.0.0.1:4317: the app shell with its four places, talking to a local server that only this browser tab can call. An agent opening the repo finds the rules, the guides, the specs and the checks it needs to build the rest of v1 on its own.

## Acceptance criteria

| ID    | Given                         | When                                                                              | Then                                                                                                                                                                                                           |
| ----- | ----------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | A fresh clone                 | I run `pnpm install && pnpm start`                                                | The server listens on 127.0.0.1:4317 and serves the built web app                                                                                                                                              |
| AC-2  | A fresh clone                 | I run `pnpm dev`                                                                  | The server runs on 127.0.0.1:4317 and Vite serves the web app on localhost:4318 with `/api` proxied                                                                                                            |
| AC-3  | The workspace                 | I list it                                                                         | It has `apps/web`, `apps/server`, `packages/contracts`, `packages/api-client`, `packages/ui`, `packages/app` and `packages/core`, all TypeScript with the strict base config                                   |
| AC-4  | The app is open               | I look at the sidebar                                                             | It shows the DevHub logo, New task, Search, Home, Tickets and Settings, a Sessions section and a "Claude" footer that says in words whether it is connected ("Not connected · runs locally" until roadmap 010) |
| AC-5  | The app is open               | I go to Home, Tickets, a session or Settings                                      | Each route shows the page bar with its breadcrumb, and the current place has `aria-current="page"`                                                                                                             |
| AC-6  | The server is running         | A request to `/api/status` has no session token                                   | The server answers 401                                                                                                                                                                                         |
| AC-7  | The server is running         | A request arrives with a Host other than `127.0.0.1:<port>` or `localhost:<port>` | The server answers 403                                                                                                                                                                                         |
| AC-8  | The app is open               | It loads                                                                          | It reads the token from `<meta name="devhub-token">`, calls `/api/status` through `@devhub/api-client`, and shows the connection state of Jira, GitHub and Slack in Settings                                   |
| AC-9  | The app is open               | The server publishes an event                                                     | The app receives it over `/api/events` and invalidates the matching queries                                                                                                                                    |
| AC-10 | The design system             | I open `@devhub/ui` in Storybook                                                  | Button, Kbd, Avatar, Pill, Breadcrumb, Tabs, EmptyState, Callout and SourceMark each have stories and tests, in light and dark, with no axe violations                                                         |
| AC-11 | Any change                    | I run `pnpm verify`                                                               | Every gate, the typecheck, lint and all tests run, and any failure says what to fix                                                                                                                            |
| AC-12 | A feature branch with commits | I push without a matching review stamp                                            | The pre-push `review-stamp` gate blocks the push and says to run `/review`                                                                                                                                     |
| AC-13 | An agent opens the repo       | It starts a session                                                               | It finds `CLAUDE.md` (under 10 KB), the skills, the `/spec` `/plan` `/build` `/test` `/review` `/ship` commands, the helper agents and `specs/_template/`                                                      |
| AC-14 | A pull request                | CI runs                                                                           | The same gates, typecheck, lint, tests with coverage, build and e2e run, summed up in one "CI passed" check                                                                                                    |

## Out of scope

- Real Jira, GitHub and Slack connections (specs 003, 004, 016).
- The OS keychain (spec 002).
- Claude sessions, worktrees and approvals (specs 010–014).
- The inbox, the tickets board and search (specs 007–009).
- A desktop app.

## Open questions

| #   | Who decides | Question                                             | Answer                                                                                           |
| --- | ----------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Q1  | Product     | Express or Fastify for the local server?             | Fastify, as the spec says: schema-first with zod, and `inject()` for route tests (16 Oct 2026)   |
| Q2  | Product     | npm or pnpm?                                         | pnpm workspaces with Turborepo; the one command is `pnpm install && pnpm start` (16 Oct 2026)    |
| Q3  | Product     | Translate the UI now?                                | No. English only in v1; copy comes from the spec and the screens (16 Oct 2026)                   |
| Q4  | Tech lead   | TypeScript 7 or 6?                                   | 6.0, because typescript-eslint does not support 7 yet (16 Oct 2026)                              |
| Q5  | Tech lead   | Load fonts from Google Fonts as the design CSS does? | No. Bundle them with @fontsource so the page talks to nothing but the local server (16 Oct 2026) |

## Design

`docs/design/screens/home.html` — sidebar and page bar only (the shell). The screen bodies are built in later specs.
