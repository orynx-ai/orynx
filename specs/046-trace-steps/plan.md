# Plan: Trace steps — a running shimmer, steps that open in place, and failed and to-come steps

Spec: `specs/046-trace-steps/spec.md`

## Order of work

0. **The design system first (Q1a).** The new Activity step states go into `docs/design/design-system.md` (§3 Activity step, §4 the `dh-step*` and `dh-shimmer` CSS). A hook keeps agents out of `docs/design/**`, so the change is a patch the user reads and applies. `/build` starts only once it's on the branch.
1. **Contracts:** each command's result on the command step, and each to-do's status on the plan step. Both are optional and line up by index with `commands` and `items`, so a session saved before this spec still parses (AC-14).
2. **Core:** `TodoWrite`'s `status` goes through `ClaudeWork` into the plan step. The command step keeps each call's id, and `command_ended` marks that call failed or not. Each part is tested on its own with the progress reducer, before any UI.
3. **UI:** `ActivityStep` gets the running shimmer and the failed state, then opens in place (Radix `Collapsible`, as `ActivityGroup` and `HistoryRow` already do). Then a small to-do list with done, in-progress and to-come marks. Each has stories and a test, with no app code.
4. **App:** Claude's progress opens steps in place, and the `StepDetails` dialog goes. Then it uses the shimmer, the failed state, the command ticks and ×, and the plan's marks.
5. **e2e:** `e2e/sessions.spec.ts` opens a step in place and runs axe on it.

The contracts come first so core and app compile against the same shapes. The UI comes before the app so each look has a story before a screen uses it.

## Risks

| Risk                                                                                                                                                                         | How we will notice early                                                       | What we do                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The shimmer's `background-clip: text` with `color: transparent` hides the title where the gradient can't draw, or axe reads it as having no contrast                         | Storybook a11y on the running story; the 360/1280 light and dark check         | The shimmer applies only under `prefers-reduced-motion: no-preference`. If axe flags it, the band goes on a pseudo-element over plain text, so the title's own colour stays |
| Spec 046 was written before spec 048, whose `ActivityGroup` already opens in place. A step inside a closed group loses its open state, because Radix unmounts closed content | The app test that closes and reopens a group                                   | The spec accepts it: "Orynx forgets which steps were open when you leave". The test checks only that an open step stays open while the session updates (AC-8, AC-17)        |
| The `calls` and `statuses` arrays fall out of step with `commands` and `items`                                                                                               | The reducer tests add, end and re-plan in different orders                     | Only the reducer writes them, and it always appends to both arrays together. The UI treats a missing entry as "no mark"                                                     |
| Moving the dialog's bodies into the step breaks the brief's three states and the edit-to-Changes link                                                                        | `step-details.test.tsx`, moved to the new parts, keeps its AC-6 and AC-7 cases | Move the cases, don't rewrite them                                                                                                                                          |
| The merge with spec 019's work on the same branch                                                                                                                            | `git merge` of the 019 branch                                                  | 046 touches sessions, the activity step and the session contracts. 019 touches tickets, Jira and the ticket contracts. Only the barrel `index.ts` files may overlap         |

## Touches

- Packages: contracts, core, ui, app (no api-client: no new endpoint)
- Gates that check this work: style-policy, component-coverage, icon-buttons, design-source, test-policy, boundaries, typecheck, lint, Storybook a11y
- Skills to follow: `.claude/skills/add-ui-component/SKILL.md`, `.claude/skills/agent-runtime/SKILL.md`, `.claude/skills/clean-ui/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`
