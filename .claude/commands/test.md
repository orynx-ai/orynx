---
description: Fix a bug the honest way — a test that fails because of the bug, then the fix
argument-hint: <what is wrong, ideally with steps to reproduce>
---

Fix this bug: $ARGUMENTS

1. **Reproduce.** Find the smallest situation that shows the bug. Read the code involved. If you cannot reproduce it, say what you tried and stop.
2. **Write a failing test** that fails because of the bug, at the lowest level that shows it (a pure function test beats a screen test; a screen test beats e2e). Follow `.claude/skills/honest-tests/SKILL.md`: real components, only the network faked, find by role, label or text. Name it after the behaviour: `it("keeps the Slack wait at 2 h after a refresh")`.
3. Run it and confirm it fails **for the reason the bug describes**, not for a setup mistake:

   ```sh
   pnpm test <the test file>
   ```

4. **Fix the code**, not the test. Keep the change as small as the bug.
5. Run the test again (green), then the tests for everything you touched and the matching gates.
6. If the bug slipped past a rule that a program could check, say so and suggest a gate (`.claude/skills/write-a-gate/SKILL.md`). If it was a surprise about a tool, write it to memory.
7. Commit once: `fix(<scope>): <what now works>`.
