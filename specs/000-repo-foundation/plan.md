# Plan: Repo foundation

Spec: `specs/000-repo-foundation/spec.md`

## Order of work

1. Root tooling first (pnpm workspace, Turborepo, strict `tsconfig.base.json`, ESLint, Prettier), because every package inherits it.
2. The handbook and the decision docs (`CLAUDE.md`, `docs/architecture.md`, `docs/feature-layout.md`, `docs/design-map.md`), because they fix the names everything else uses.
3. `@devhub/contracts`, then `@devhub/core` and `apps/server`, then `@devhub/api-client`: the request path end to end, testable without a browser.
4. `@devhub/ui`: tokens copied verbatim from the design system, the Tailwind theme mapping, the first components with stories and tests.
5. `@devhub/app` and `apps/web`: the shell, the four routes, the status and event wiring.
6. The agent kit: gates with self-tests, Claude hooks, git hooks, CI, skills, commands, helper agents, specs, `learn/` pages.

## Risks

| Risk                                                | How we will notice early                     | What we do                                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool versions disagree (TypeScript 7, ESLint 10)    | Peer dependency warnings on install          | Pin TS 6.0 (typescript-eslint needs < 6.1); run ESLint 10 with jsx-a11y after checking its rules fire; record both in `docs/architecture.md` |
| shadcn's class names clash with DevHub's (`accent`) | A shadcn component turns indigo              | Leave the clashing names out of the theme so the style gate catches them                                                                     |
| The token handshake breaks in dev                   | 401s in the browser console under `pnpm dev` | A Vite plugin reads `runtime.json` and injects the meta tag                                                                                  |
| Gates are too slow, so people skip them             | Pre-push takes more than ~30 s               | Run every gate at once                                                                                                                       |

## Touches

- Packages: all seven.
- Gates: every gate is introduced here.
- Skills: all of `.claude/skills/` is introduced here.
