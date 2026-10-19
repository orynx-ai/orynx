# DevHub — agent handbook

DevHub is a local web app plus a small local server, both on the developer's laptop. It shows the Jira, GitHub and Slack work that needs you, and runs Claude on a ticket in a separate git worktree while you watch and approve. People know it as **Orynx**: every word the user sees (screens, errors, terminal lines, the page title) says Orynx. DevHub stays the code name inside the repo: `@devhub/*` packages, `DEVHUB_*` settings, `~/.devhub` and the keychain item. Read these before building anything:

- Product: `docs/product/spec.md` (what and why) · `docs/product/roadmap.md` (build order)
- Design: `docs/design/design-system.md` (tokens, components, a11y) · `docs/design/screens/*.html|png` (the 4 screens) · `.claude/skills/clean-ui/SKILL.md` (layout, type scale, states, copy)
- Code: `docs/architecture.md` (packages, runtime, stack) · `docs/feature-layout.md` · `docs/design-map.md`

Keep this file under 10 KB (`pnpm gate handbook-size`). Put detail in the linked docs, not here.

## Run it

- Node 24 (`nvm use`), pnpm 10 (`corepack enable`), then `pnpm install`.
- `pnpm dev` — server on 127.0.0.1:4317, web (Vite) on localhost:4318. `pnpm start` — production build, one port: 4317. `pnpm --filter @devhub/desktop package --dir` packs the desktop app; `pnpm test:e2e:desktop` tests the packed app.
- `pnpm verify` — gates, typecheck, lint, all tests. It must pass before you say a branch is done; `/review` runs it, with the e2e suite.
- While working, and in each `/build` task, run only what you touched: `pnpm test <path>`, `pnpm gate <name>`, `pnpm storybook`. No whole-package runs, `pnpm lint` or e2e per commit: the git hooks and `/review` run them.

## Layout

`apps/web` (Vite host) · `apps/server` (Node host) · `apps/desktop` (Electron host) · `apps/landing` (public landing page, static, no tests) · `packages/contracts` (zod schemas) · `packages/api-client` (axios + query options) · `packages/ui` (design system) · `packages/app` (screens, routes, stores) · `packages/core` (Fastify routes, integrations, agent runtime). Each feature follows `docs/feature-layout.md`.

## Workflow

Trunk is `main`. One branch per spec: `feat/<NNN-slug>`. Work in this order: `/spec` → a person answers the open questions → `/plan` → `/build` (one task, test first, one commit) → `/review` → push → PR. Commits use Conventional Commits with a package or feature scope: `feat(app): show the inbox tabs`. `release` only fast-forwards to `main` (`git push origin main:release`, never a PR merge), and each push publishes the desktop app (`learn/desktop-app.md`).

<!-- agent-rules:start -->

## Rules

1. **Imports flow one way.** Browser packages (`ui`, `app`, `api-client`, `apps/web`) must never import `@devhub/core`, `apps/server`, `node:*` or server libraries. `contracts` imports only `zod`. `ui` imports no other `@devhub/*` package.
   Checked by: `pnpm gate boundaries` · Guide: `docs/architecture.md`
2. **Contracts first.** Every HTTP body and server event is a zod schema in `@devhub/contracts`. The server validates with it and `@devhub/api-client` parses with it. Never hand-write a response type.
   Checked by: `pnpm typecheck` · Guide: `.claude/skills/add-api-endpoint/SKILL.md`
3. **Server data lives in TanStack Query; UI-only state lives in zustand.** All HTTP goes through `@devhub/api-client` (axios). Never fetch in `useEffect`, never copy server data into zustand or `useState`.
   Checked by: `pnpm lint` · Guide: `.claude/skills/server-state/SKILL.md`, `.claude/skills/client-state/SKILL.md`
4. **Design tokens only.** Colours, type sizes, radii and shadows come from the theme classes in `docs/design-map.md`. Never raw hex/rgb, arbitrary values (`p-[13px]`), Tailwind's default palette or `dark:`.
   Checked by: `pnpm gate style-policy` (also a hook while you edit) · Guide: `.claude/skills/build-a-screen/SKILL.md`, `.claude/skills/clean-ui/SKILL.md`
5. **Screens are built from `@devhub/ui`.** If a component is missing, add it to `@devhub/ui` (shadcn, restyled to tokens) with a story and a test. Never style it ad hoc inside a feature.
   Checked by: `pnpm gate component-coverage` · Guide: `.claude/skills/add-ui-component/SKILL.md`
6. **Say where the design came from.** Every `*-screen.tsx` starts with `// Design: docs/design/screens/<file> — <part>` or `// Design: none — <reason>`.
   Checked by: `pnpm gate design-source` (also a hook) · Guide: `.claude/skills/build-a-screen/SKILL.md`
7. **Accessible by default.** Use real elements, draw icon-only buttons with `IconButton` (its `label` is the tooltip and the name) and put any other icon-only control in a `Tooltip`, put `aria-current` in nav, use `role="alert"` for approvals and never remove the focus ring. Stories must have no axe violations.
   Checked by: Storybook a11y (`test: "error"`), `pnpm gate icon-buttons` · Guide: `docs/design/design-system.md` (Accessibility rules)
8. **Honest tests.** Test real components the way a person uses them: by role, label or visible text. Never `vi.mock` your own code or `@devhub/*`. Fake only the network (MSW), the clock and outside services. No `data-testid`. Coverage stays at or above 90%.
   Checked by: `pnpm gate test-policy`, vitest thresholds · Guide: `.claude/skills/honest-tests/SKILL.md`
9. **Config through one door.** Only `apps/*/src/config.ts` reads `process.env`, validated with zod, and every key is listed in `.env.example`.
   Checked by: `pnpm gate env-policy`
10. **No secrets in git or the browser.** Tokens live in the OS keychain. Never commit `.env` or a token. The server listens on 127.0.0.1 only and checks the Host header and session token.
    Checked by: `pnpm gate secrets`, pre-commit · Guide: `learn/local-security.md`
11. **Claude acts only as far as the user allowed.** Product code must never push, open a PR or run a risky command unless the user clicked for it or turned that permission on in Settings › Coding agent (the defaults ask, or never push), and it must only edit inside the session worktree.
    Checked by: `/review` · Guide: `.claude/skills/agent-runtime/SKILL.md`
12. **Forms use react-hook-form with a zod schema.** Never keep input values in `useState`.
    Checked by: `/review` (gate planned) · Guide: `.claude/skills/forms/SKILL.md`

## Stop and ask a person when

- the design system lacks a component, option or colour you need (`tokens.css` comes from the design system, so do not invent tokens)
- a design uses a value that is not a named token, or two design sources (spec, screens, design system) disagree
- the design never shows a state you need (loading, empty, error)
- nobody has given the exact wording for text the user will see
- the change needs a dependency that `docs/architecture.md` does not list
- an action would push, open a PR, or touch the real `~/.devhub`, the OS keychain or a user's repo

For anything else, work it out from the code and the docs.

## Done checklist

- [ ] The spec is written and every open question has an answer
- [ ] New code has honest tests, and coverage holds
- [ ] Every new `@devhub/ui` component has a story for each state and a test
- [ ] Every new screen was opened in a real browser (`pnpm dev`) at 360 px and 1280 px, in light and dark, with no layout shift while it loads
- [ ] There are no accessibility violations
- [ ] Every value comes from a token, and every screen has its `Design:` note
- [ ] `pnpm verify` passes, and the `/review` stamp matches this exact change

<!-- agent-rules:end -->

## Files you must not edit by hand

- `AGENTS.md`, `.github/copilot-instructions.md`, `.cursor/rules/00-core.mdc` — run `pnpm agent-rules` to regenerate them from the rules above
- `pnpm-lock.yaml` — change it only through `pnpm add` or `pnpm remove`
- `packages/ui/src/styles/tokens.css`, `docs/design/**`, `docs/product/spec.md` — these come from people. Stop and ask.

## Memory

Write a surprise into memory. If everyone needs it, it becomes a skill, a doc or a `learn/` page. If breaking it causes real damage, it becomes a gate, warning first and failing later.
