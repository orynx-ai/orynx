# Plan: Review replies, five fixes, and faster tests

Spec: `specs/049-review-replies-and-fixes/spec.md`

## Order of work

1. **Test speed first** (part C, local half): the two flaky core tests, then `isolate: false` for the app (and the trial for `ui` and `core`). Every later task runs app tests, so it gains from these, and a flaky core test would otherwise blur the checks that follow.
2. **The five fixes** (part B), smallest and most independent first: Markdown → ADF (pure, core only), `search_jira` paging (core only), the command log cap (contracts → core → app), "ready for" from the worktree (contracts → core), the missing folder (contracts → core → app). Each stands alone and lands in its own commits.
3. **Reply to reviewers** (part A), by the endpoint order of `add-api-endpoint`: contracts → GitHub client (read threads, reply, resolve) → the core service (Claude's draft, then posting) and its routes → api-client → the dialog → the page-bar button → e2e on the pull requests hub. The GitHub client comes before the service, so the service's tests use the real client against MSW's fake GitHub (`packages/core/src/test/fake-github.ts`), which the e2e hub then reuses.
4. **CI** (part C, workflow half): app shards, then e2e shards and the Chromium cache. Last, so the branch's own pull request is the first run to measure them, and nothing earlier depends on them.
5. Docs: the GitHub row of "What DevHub may write" in the integration-adapter skill, and the browser check at 360 and 1280 px in both themes (AC-20).

## Risks

| Risk                                                                                                   | How we will notice early                                                                                             | What we do                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `isolate: false` lets one file's leftover state change another's result                                | 3 runs of the app suite with `--sequence.shuffle`, each with a new seed (Task 2), then every CI run                  | Reset what leaked in `src/test/setup.ts`; if a leak can't be found, keep isolation for that package and say so in the PR |
| Vitest's `--shard` with blob reports loses a shard's coverage, or the merge job passes without a shard | Task 4 runs both shards locally into blobs and merges them with coverage; the merge job's check lists shards by name | The check fails when a shard's blob is missing, as it does for a package today                                           |
| Claude's draft isn't the JSON we asked for                                                             | Core tests feed the fake adapter a broken answer                                                                     | Every box starts empty and unticked with the "couldn't draft" line (AC-4), as the PR draft falls back today              |
| A fine-grained token can read threads but not reply                                                    | The client maps GitHub's 403 and GraphQL `FORBIDDEN` to a refusal with GitHub's words                                | That thread shows "GitHub refused this: …" (AC-5); nothing else changes                                                  |
| Posting twice after a partial failure                                                                  | AC-5's core test presses Post twice and counts the fake GitHub's replies                                             | Threads that posted are dropped from the answer and the list                                                             |
| Checking the worktree at each turn end slows the session or races a running command                    | The check runs once, after the turn's result, read-only (`git status --porcelain`, `git diff --quiet <start>`)       | When git can't tell, `changed` stays as it was                                                                           |
| e2e shards each build and start every hub, so setup eats the saving                                    | The PR's CI run shows each shard's time                                                                              | Drop to 2 shards if setup dominates                                                                                      |

## Touches

- Packages: contracts, core, api-client, app; `.github/workflows/ci.yml`, `playwright.config.ts`, `e2e/`.
- Gates that check this work: test-policy, style-policy, design-source (no new screen), icon-buttons, boundaries, component-coverage (no new component), secrets, specs, learn-freshness; typecheck, lint, coverage thresholds.
- Skills to follow: `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/agent-runtime/SKILL.md` (the draft is `write()`, nothing posts without the click), `.claude/skills/integration-adapter/SKILL.md` (GitHub's network calls stay in `client.ts`), `.claude/skills/server-state/SKILL.md`, `.claude/skills/forms/SKILL.md` (the replies form), `.claude/skills/honest-tests/SKILL.md`, `.claude/skills/clean-ui/SKILL.md`.
