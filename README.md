# Orynx

One local workspace for the Jira tickets, GitHub pull requests and Slack messages that need you, plus a place to hand a ticket to Claude and watch it build the change in a separate git worktree, approving each risky step.

Everything runs on your laptop. There is no Orynx cloud: tokens stay in your OS keychain and the cache is a local file.

Inside the repo the code name is DevHub: the `@devhub/*` packages, the `DEVHUB_*` settings, the `~/.devhub` folder and the keychain item keep that name, so saved tokens and settings carry over.

## Quick start

```sh
nvm use            # Node 24 (see .nvmrc)
corepack enable    # pnpm 10, pinned in package.json
pnpm install
pnpm dev           # server on 127.0.0.1:4317, web app on http://localhost:4318
```

To run it the way a user does (one production build, one port):

```sh
pnpm start         # http://127.0.0.1:4317
```

## Repo map

| Path                  | What it is                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/web`            | Browser host: Vite, `index.html`, the web `Platform`                                                                    |
| `apps/server`         | Node host: env config, session token, serves the web app in production                                                  |
| `apps/landing`        | The public landing page: static Vite site; `pnpm --filter @devhub/landing dev` serves it on localhost:4319              |
| `packages/contracts`  | zod schemas for every HTTP body and server event                                                                        |
| `packages/api-client` | axios client, typed endpoints, TanStack Query options, event stream                                                     |
| `packages/ui`         | The DevHub design system: tokens, Tailwind theme, shadcn-based components, Storybook                                    |
| `packages/app`        | The product UI: shell, routes, features, zustand stores                                                                 |
| `packages/core`       | The local server's logic: Fastify routes, integrations, agent runtime, storage                                          |
| `specs/`              | One folder per feature: spec, plan, tasks                                                                               |
| `docs/`               | Product spec, roadmap, design system, screens, architecture, rules                                                      |
| `learn/`              | Explainer pages: how a request flows, local security, live updates, tokens and the keychain, connecting Jira and GitHub |
| `scripts/`            | Gates (one rule each), the gate runner, Claude hooks                                                                    |
| `.claude/`            | Agent kit: settings and hooks, skills, slash commands, helper agents                                                    |

The packages are split so a desktop app can be a third host later without a rewrite. See `docs/architecture.md`.

## How work gets done here

This repo is agent-first: Claude writes the code, people decide what to build and approve the result. Every rule that matters is checked by a program.

1. **A person picks the next spec** from `docs/product/roadmap.md` and runs `/spec <number>`. Claude writes `specs/<NNN-slug>/spec.md` with its assumptions, Given/When/Then acceptance criteria and open questions, then stops.
2. **A person answers the open questions.** This is the main human job: decisions, wording, design gaps.
3. **`/plan`** splits the spec into small tasks, each with the check that proves it.
4. **`/build`** does one task at a time: failing test first, then the code, then one commit. Gates and hooks catch broken rules as it goes, and their messages say how to fix them.
5. **`/review`** reads the whole branch with helper agents (code, security, design) and writes a review stamp that fits only that exact change. The pre-push gate blocks a push without it.
6. **A person reviews the PR** (summary, screenshots, CI) and merges.

People still decide what to build, answer the spec's questions, design the screens, approve user-visible wording, approve the pull request, and accept any skipped rule.

## Commands

| Command                         | What it does                                                             |
| ------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                      | Server and web app with hot reload                                       |
| `pnpm start`                    | Production build, served on 127.0.0.1:4317                               |
| `pnpm verify`                   | Everything a push needs: gates, typecheck, lint, tests                   |
| `pnpm test [path]`              | Vitest; pass a path to run only what you touched                         |
| `pnpm test:changed`             | Tests related to files changed since `origin/main`                       |
| `pnpm test:coverage`            | Full suite with the 90% coverage thresholds                              |
| `pnpm test:e2e`                 | Playwright against the real server and web app                           |
| `pnpm gates` / `pnpm gate <id>` | Every gate at once, or one gate                                          |
| `pnpm gates:test`               | The gates' own tests                                                     |
| `pnpm storybook`                | The design system gallery                                                |
| `pnpm agent-rules`              | Regenerate `AGENTS.md` and the Copilot and Cursor rules from `CLAUDE.md` |
| `pnpm lint` / `pnpm format`     | ESLint / Prettier                                                        |

## Troubleshooting

- **A port is taken.** Set `DEVHUB_PORT` (server) or `DEVHUB_WEB_PORT` (Vite) for one run, for example `DEVHUB_PORT=4417 pnpm dev`. Every setting is listed in `.env.example`.
- **The page says "Orynx restarted".** The server makes a new session token on every start, so reload the page.
- **`pnpm exec playwright install` fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`.** A proxy on your network re-signs TLS. Let Node trust the macOS keychain: `NODE_OPTIONS=--use-system-ca pnpm exec playwright install chromium`.
- **Settings says "Can't reach your-team.atlassian.net".** Check the VPN first. The terminal's warn line names the cause; `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` means a proxy re-signs TLS with a root your OS doesn't trust either. See `learn/connecting-jira.md`.
- **Settings says "Orynx can't find the gh command".** Orynx looks for gh on the PATH of the terminal that started it. Run `which gh` there, or connect with a personal access token. See `learn/connecting-github.md`.
- **Trying things without touching your real data.** Point `DEVHUB_HOME` at a temporary folder: `DEVHUB_HOME=$(mktemp -d) pnpm dev`.

## Read next

- `CLAUDE.md` — the handbook every agent session starts with (rules, workflow, done checklist)
- `docs/product/spec.md` and `docs/product/roadmap.md` — what DevHub is and the build order
- `docs/design/design-system.md` and `docs/design/screens/` — how it looks
- `docs/architecture.md`, `docs/feature-layout.md`, `docs/design-map.md`, `docs/engineering-rules.md` — how the code is built
