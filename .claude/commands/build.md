---
description: Do the next unchecked task of a spec — failing test first, then code, then one commit
argument-hint: <spec folder, e.g. 007-home-inbox>
---

Build the next task of `specs/$ARGUMENTS/`.

1. Open `specs/$ARGUMENTS/tasks.md` and take the **first unchecked task only**. If it is the "STOP and run /review" task, stop and tell the user to run `/review`.
2. Read the task's Files and the skills that match the work (`.claude/skills/*/SKILL.md`).
3. **Test first.** Write the test that proves the task's acceptance criteria. Put the ID in the test name (`it("AC-2: …")`). Run it and watch it fail for the right reason:

   ```sh
   pnpm test <the test file>
   ```

4. **Code.** Write the smallest change that makes the test pass, following `CLAUDE.md`. If you hit anything on the "Stop and ask" list, stop and ask.
5. **Check.** Run the task's Check, the tests for the files you touched, and the gates that cover them:

   ```sh
   pnpm test <paths you touched>
   pnpm gate style-policy      # UI changes
   pnpm gate design-source     # new or changed screens
   pnpm gate boundaries        # new imports
   pnpm typecheck
   ```

   For UI, open it in a real browser (`pnpm dev`) at 360 px and 1280 px, light and dark.

6. Tick the task in `tasks.md` (`- [x]`).
7. Commit once, Conventional Commits with a scope, and mention the spec:

   ```
   feat(app): show the inbox tabs with counts

   Spec: 007-home-inbox (task 3, AC-2, AC-3)
   ```

8. Report in two lines what changed and which task is next. Do not start the next task unless the user asked you to build several.
