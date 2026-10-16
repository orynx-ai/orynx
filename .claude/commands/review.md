---
description: Review the whole branch for correctness, clarity, structure, security and performance, then write the review stamp
argument-hint: '[optional focus, e.g. security]'
model: claude-opus-5-5
---

Review this branch. $ARGUMENTS

Run this at the highest effort. The stamp records the model and effort that signed off the code.

1. **Get the whole change.** Commit or stash nothing yet; just look:

   ```sh
   git fetch origin main
   git diff --stat $(git merge-base origin/main HEAD)
   git diff $(git merge-base origin/main HEAD)
   git status --short
   ```

   Also read the spec the branch implements (`specs/<NNN-slug>/`), so you review against its acceptance criteria.

2. **Get helper reviews** with the Agent tool. Give each the diff range and the spec path:
   - always: `code-reviewer`
   - when `packages/core/`, `apps/server/`, tokens, auth, the agent runtime or anything that runs commands changed: `security-auditor`
   - when a screen, `@devhub/ui` component or style changed: `design-reviewer`

   Run them in parallel. Helper agents never call other helper agents.

3. **Grade five things** yourself, using the helpers' findings:
   - **Correctness**: does it do what each AC says, including loading, empty and error states? Are there bugs?
   - **Clarity**: names, small functions, no comments that repeat the code, no loose types.
   - **Structure**: `docs/feature-layout.md`, the layering in `docs/architecture.md`, the rules in `CLAUDE.md`.
   - **Security**: no tokens in logs, the browser or git; 127.0.0.1, Host and token checks intact; Claude never pushes, opens a PR or runs a risky command without a click.
   - **Performance**: no request waterfalls, no refetch loops, no huge renders, nothing slow on the hot path.

   Sort findings into **critical** (must fix: bugs, broken rules, security), **important** (should fix) and **suggestion**, each with `file:line`.

4. **Run the checks**:

   ```sh
   pnpm verify
   ```

5. **If there is any critical finding, or `pnpm verify` fails:** the review fails. Fix the critical findings (and the important ones that are quick), commit the fixes, and start again from step 1.

6. **If it passes:** commit any pending changes so the working tree is clean, then write the stamp:

   ```sh
   pnpm review:stamp write --verdict pass --model claude-opus-5-5 --effort xhigh --critical 0 --important <n> --suggestion <n>
   pnpm review:stamp verify
   ```

   The stamp fits only this exact change: one more commit and the pre-push gate (`review-stamp`) asks for a fresh review.

7. Report: verdict, the findings table, what you fixed, and what is left as suggestions. Do not push. Pushing and the PR are the user's call.
