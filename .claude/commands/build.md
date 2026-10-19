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
5. **Check, once, just before the commit.** Run each line once. After a fix, rerun only the line that failed.

   ```sh
   pnpm test <the task's test files and folders>
   pnpm typecheck                # turbo skips the packages you didn't touch
   pnpm gate style-policy        # UI changes
   pnpm gate design-source       # new or changed screens
   pnpm gate boundaries          # new imports
   pnpm gate component-coverage  # new components: each needs its own test file
   ```

   Leave these out of a task. Each one runs later, once per branch:
   - `pnpm lint`: the pre-commit hook lints the files you stage, and the pre-push hook lints everything.
   - A whole package (`pnpm test packages/app`), `pnpm verify` and coverage: `/review` and the pre-push hook run them.
   - `pnpm test:e2e`: run an e2e file only when this task changes it or its Check names it, and run only that file. `/review` runs the whole e2e suite.
   - The real-browser check (360 px and 1280 px, light and dark): do it once per screen, in the task that finishes it, or when the Check asks for it.

6. Tick the task in `tasks.md` (`- [x]`).
7. Commit once, Conventional Commits with a scope, and mention the spec:

   ```
   feat(app): show the inbox tabs with counts

   Spec: 007-home-inbox (task 3, AC-2, AC-3)
   ```

8. Report in two lines what changed and which task is next. Do not start the next task unless the user asked you to build several.
