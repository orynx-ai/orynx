---
description: Decide go or no-go for merging this branch, with three specialist reviewers and an undo plan
argument-hint: '[optional notes for the reviewers]'
model: claude-opus-5-5
---

Decide whether this branch is ready to ship. $ARGUMENTS

1. Check the basics first. If any fails, the answer is **NO-GO** and you say why:
   - the spec's status is `approved` and every task in `tasks.md` is checked,
   - `pnpm review:stamp verify` passes (if not, tell the user to run `/review`),
   - `pnpm verify` passes.

2. Run three reviewers **in parallel** with the Agent tool, each with the diff range (`$(git merge-base origin/main HEAD)..HEAD`) and the spec path:
   - `code-reviewer`: correctness and structure,
   - `security-auditor`: tokens, local-only server checks, agent safety rules,
   - `test-engineer`: are the acceptance criteria proven by honest tests, and are all four states covered?

   Helper agents never call other helper agents.

3. Decide:
   - **GO** when no reviewer has a critical finding and the basics pass.
   - **NO-GO** otherwise, with the list of blockers.

4. Write the answer:

   ```
   GO | NO-GO
   Blockers: …            (NO-GO only)
   Risks: …               what could still go wrong in use
   Undo plan: …           how to back it out (revert commit range, data or settings to clean up in ~/.devhub)
   PR summary: …          5 lines for the reviewer, with the spec link and screenshots to attach
   ```

5. **Never push, open a PR or merge** without the user's explicit OK. When they say go, push the branch and give them the PR link (or open it if they asked).
