# Engineering rules

The long form of the rules in `CLAUDE.md`: why each one exists, what right and wrong look like, and what checks it. `CLAUDE.md` holds the one-sentence rule and links here or to a skill. If the two ever disagree, `CLAUDE.md` wins and this file gets fixed.

One idea sits behind all of it: **if a rule matters, a program must check it.** A rule written only in a document will be broken sooner or later, because an agent juggles many rules and is trying to finish.

## 1. Imports flow one way

**Why.** The browser packages run in a page that anyone's link can open. If `@devhub/app` imports `@devhub/core`, server code (and whatever secrets it touches) can end up in the browser bundle. The same split is what lets a desktop app reuse `app` and `core` as they are.

| Package       | May import                             |
| ------------- | -------------------------------------- |
| `contracts`   | `zod` only                             |
| `ui`          | no `@devhub/*`                         |
| `api-client`  | `contracts`                            |
| `app`         | `contracts`, `api-client`, `ui`        |
| `core`        | `contracts`                            |
| `apps/web`    | `app`, `ui`, `api-client`, `contracts` |
| `apps/server` | `core`, `contracts`                    |

Browser packages never import `node:*`, Fastify, the Claude Agent SDK, simple-git, SQLite, keychain or integration SDKs.

```ts
// ✖ packages/app/src/features/settings/settings-screen.tsx
import { getStatus } from '@devhub/core';
// ✔
import { useStatus } from './queries';
```

**Checked by** `pnpm gate boundaries` (source imports and `package.json` dependencies).

## 2. Contracts first

**Why.** When the shape of a response lives in one zod schema, the server, the client and the tests cannot drift apart, and a bad response fails loudly at the boundary instead of deep inside a component.

```ts
// ✖ packages/api-client/src/endpoints/status.ts
interface StatusResponse {
  version: string;
}
const res = await http.get<StatusResponse>('/api/status');
return res.data;
// ✔
const res = await http.get(apiRoutes.status);
return StatusSchema.parse(res.data);
```

**Checked by** `pnpm typecheck`; `/review`. Guide: `.claude/skills/add-api-endpoint/SKILL.md`.

## 3. Server data in TanStack Query, UI state in zustand

**Why.** Two copies of the same data go stale. The query cache already handles loading, errors, refresh every 2 minutes and invalidation from server events.

```tsx
// ✖
const [status, setStatus] = useState<Status>();
useEffect(() => {
  void api.status().then(setStatus);
}, []);
// ✔
const status = useStatus();
```

**Checked by** `pnpm lint` (`@tanstack/eslint-plugin-query`, restricted imports), `/review`. Guides: `.claude/skills/server-state/SKILL.md`, `.claude/skills/client-state/SKILL.md`.

## 4. Design tokens only

**Why.** Each guessed value is small, but together they make a screen that looks almost right and wrong next to the rest of the product. Tailwind silently generates nothing for a class it does not know, so a typo looks valid and does nothing.

```tsx
// ✖
<span className="bg-[#eef1fd] text-sm text-gray-600 shadow-md dark:bg-slate-800">In review</span>
// ✔
<Pill tone="info">In review</Pill>
```

The theme leaves out Tailwind's default palette, sizes and shadows, and the shadcn names that clash with DevHub (`accent`, `secondary`, `destructive`). See `docs/design-map.md`.

**Checked by** `pnpm gate style-policy`, and the pre-tool hook while editing. One-line exceptions need a reason: `// style-policy-ignore-next-line: <reason>`.

## 5. Screens are built from `@devhub/ui`

**Why.** A component styled inside a feature gets copied, and the copies drift. One component with a story per state is reviewed once and reused everywhere.

**Checked by** `pnpm gate component-coverage` (every `@devhub/ui` component has a story and a test; every screen has a test). Guide: `.claude/skills/add-ui-component/SKILL.md`.

## 6. Say where the design came from

**Why.** Anyone can then tell whether a value was read from the design or made up.

```tsx
// Design: docs/design/screens/session.html — approval callout, Claude's progress
// Design: none — reuses the Settings page frame unchanged (spec 005)
```

**Checked by** `pnpm gate design-source`, and a hook that blocks a new screen without the note. Guide: `.claude/skills/build-a-screen/SKILL.md`.

## 7. Accessible by default

**Why.** The spec promises keyboard and screen-reader use, 4.5:1 contrast and state that is never colour alone. Retrofitting accessibility costs far more than building it in.

- Skip link first; a visible 2 px focus ring on everything.
- Real elements; `aria-label` on icon-only buttons; `aria-current` in nav and breadcrumbs.
- Tabs with arrow keys; approvals in `role="alert"`; agent output in `aria-live="polite"`.
- Hit targets 32 px in dense rows, 40 px elsewhere; text at least 12 px.

**Checked by** Storybook a11y with `test: "error"`, `expectNoAxeViolations` in component tests, the design-reviewer agent.

## 8. Honest tests

**Why.** An agent asked to hit a coverage number can write tests that pass without proving anything. Coverage is only worth something if the tests are real.

- Never `vi.mock` our own code or `@devhub/*`. Fake only the network (MSW), the clock and outside services.
- Find things by role, label or visible text. No `data-testid`. No snapshots.
- Name tests after the acceptance criterion: `it("AC-2: …")`.

**Checked by** `pnpm gate test-policy`, coverage thresholds. Guide: `.claude/skills/honest-tests/SKILL.md`.

## 9. Config through one door

**Why.** A setting read somewhere deep in the code, and missing from the example file, makes a new machine crash on start.

```ts
// ✖ packages/core/src/routes/status.ts
const port = Number(process.env.DEVHUB_PORT);
// ✔ apps/server/src/config.ts parses the env with zod; core receives typed options.
```

**Checked by** `pnpm gate env-policy`.

## 10. No secrets in git or the browser

**Why.** DevHub holds a developer's Jira, GitHub and Slack tokens. A leak gives someone else that person's access.

- Tokens live in the OS keychain; `.env` is an opt-in fallback, never committed.
- The server listens on 127.0.0.1 only, checks the Host header (DNS rebinding) and a per-start session token. See `learn/local-security.md`.
- Never log a token, a request's headers, or put a token in an error or event.

**Checked by** `pnpm gate secrets`, the pre-commit hook, the security-auditor agent.

## 11. Claude never acts for the user

**Why.** The product's promise: "Nothing happens without you." Claude works in a worktree, risky commands ask, and the pull request is always the user's click.

**Checked by** `/review` with the security-auditor agent. Guide: `.claude/skills/agent-runtime/SKILL.md`.

## 12. Forms use react-hook-form with a zod schema

**Why.** Every form validates the same way and shows errors the same way.

**Checked by** `/review` (a `form-policy` gate is planned). Guide: `.claude/skills/forms/SKILL.md`.

## Testing strategy

| Kind       | What it checks                                                      | Tools                                                                             | Where                            |
| ---------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------- |
| Unit       | Pure functions: mappers, inbox rules, permission decisions          | Vitest                                                                            | next to the code                 |
| Component  | `@devhub/ui` components and app screens, the way a person uses them | Vitest, Testing Library, `userEvent`, MSW                                         | `*.test.tsx`                     |
| Route      | Fastify routes, security plugin                                     | `createServer()` + `app.inject()`, MSW for outside APIs, temp `DEVHUB_HOME`       | `packages/core/src/**/*.test.ts` |
| Stories    | Every component in every state                                      | Storybook 10 + addon-a11y (`test: "error"`); theme and width are toolbar switches | `*.stories.tsx`                  |
| End to end | Real browser, real server, real web app                             | Playwright; names read "Given …, when …, then …"                                  | `e2e/`                           |

- **While working**, run only what you touched: `pnpm test <paths>` or `pnpm test:changed`.
- **Before you say done**, run `pnpm verify`.
- **On every PR**, CI runs the full suite with coverage and the e2e tests.

### Coverage

Every package keeps lines, branches, functions and statements at or above **90%**. Set from day one, because raising it later is painful.

Exclusions live in each package's `vitest.config.ts`, and each one has a one-line reason, for example: type-only files, stories, the host entry point (`apps/*/src/main.ts`, covered by e2e). Never exclude a file to make the number pass. If there is nothing worth testing, write down why.

## Commits, branches and pull requests

- **Trunk** is `main`. Work happens on `feat/<NNN-slug>` (or `fix/<slug>`), one branch per spec.
- **Commits** follow Conventional Commits with a scope: `feat(app): …`, `fix(core): …`, `chore(repo): …`, `docs(specs): …`. commitlint checks them. One task, one commit; add `Spec: <NNN-slug> (task n, AC-…)` in the body.
- **Before push**, the pre-push hook runs every gate (including the review stamp), the typecheck, lint and tests.
- **Pull requests** use `.github/pull_request_template.md`: spec link, what changed, screenshots for UI (light and dark, 360 and 1280 px), the done checklist, the review verdict. One "CI passed" check must be green before merge. A person approves and merges.
- **Skipping a rule** in a PR needs a written reason, and an engineer accepts it.

## Knowledge moves up

The agent forgets everything when a session ends, so anything it learns that the code does not already show must be written down.

1. A surprise one agent runs into goes into its **memory** (one fact per file, indexed in `MEMORY.md`).
2. If everyone needs it, it becomes a **skill** (`.claude/skills/`), a **doc** (`docs/`) or an explainer page (`learn/`, with a `learn-sources` line so `pnpm gate learn-freshness` warns when the code moves on).
3. If breaking it causes real damage, it becomes a **gate**, warning first and failing once old code is fixed, with the spec or ticket number in the gate.

Each week: when something broke that the checks missed, add a gate; see which checks people skip most, and fix or remove them.
