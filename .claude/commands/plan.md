---
description: Turn an approved spec into an ordered plan and small, checkable tasks
argument-hint: <spec folder, e.g. 007-home-inbox>
---

Plan the spec in `specs/$ARGUMENTS/`.

1. Read `specs/$ARGUMENTS/spec.md`. If its status is not `approved`, or any open question has no answer, **stop** and say which ones are missing.
2. Read the code the spec touches and `docs/feature-layout.md`, and the skills that apply (`.claude/skills/*/SKILL.md`; open the ones whose description matches the work).
3. Write `plan.md`:
   - **Order of work**: contracts → core → api-client → ui components → app screen, or whatever order lets each step be tested on its own.
   - **Risks**: what could go wrong and how you will notice early.
   - **Touches**: the packages and the gates that will check the work.
4. Write `tasks.md` as small steps. Each task:
   - is about one commit's worth of work (usually under ~200 changed lines),
   - names the acceptance criteria it proves (`AC-2`),
   - has a **Check** (the exact test or gate that proves it) and **Files** (the paths it creates or changes). A Check names test files or a feature folder, never a whole package, `pnpm verify` or the whole e2e suite: those run once, in `/review`. Name an e2e file only in the task that writes or changes it.

   ```
   - [ ] Task 1: Add the inbox item schema and route path (AC-1)
         Check: pnpm test packages/contracts/src/inbox.test.ts; pnpm typecheck
         Files: packages/contracts/src/inbox.ts, packages/contracts/src/routes.ts
   ```

5. The last task is always:

   ```
   - [ ] Task N: STOP and run /review
         Check: the review stamp matches the branch (pnpm review:stamp verify)
   ```

6. Show the task list to the user in one short message, then wait for "go" or changes.
