# Tasks: Review with Claude

One task is one commit. Test first, then code. Tick a task only when its Check passes.

**Contracts and GitHub**

- [x] Task 1: The review on a session, its comments, the `commented` step, and `review: true` on a composer start, allowed only for an Ask with one pull request (AC-2, AC-8, AC-12)
      Check: pnpm test packages/contracts/src/session.test.ts; pnpm typecheck
      Files: packages/contracts/src/session.ts, packages/contracts/src/testing.ts, packages/contracts/src/session.test.ts
- [x] Task 2: The review endpoints' shapes: a comment's change, the status (commits pushed since), posting and its answer; their routes (AC-12, AC-16, AC-18, AC-19, AC-20)
      Check: pnpm test packages/contracts/src/review.test.ts; pnpm typecheck
      Files: packages/contracts/src/review.ts, packages/contracts/src/review.test.ts, packages/contracts/src/routes.ts, packages/contracts/src/index.ts, packages/contracts/src/testing.ts
- [x] Task 3: The GitHub client posts a review in one call, and `commitsBetween` says how many commits were pushed after the one Claude read (GitHub's compare); 403, SSO, rate limit, 422 and no network each map to a problem (AC-16, AC-19, AC-20)
      Check: pnpm test packages/core/src/integrations/github/client.test.ts
      Files: packages/core/src/integrations/github/client.ts, packages/core/src/integrations/github/client.test.ts, packages/core/src/test/fake-github.ts

**Core**

- [x] Task 4: `worktrees.review()` fetches `pull/<n>/head` and the base, adds a detached worktree at the head, and returns the head and the merge base; a fork's PR works, and no branch or remote ref is left (AC-4, AC-5)
      Check: pnpm test packages/core/src/sessions/worktrees.test.ts
      Files: packages/core/src/sessions/worktrees.ts, packages/core/src/sessions/worktrees.test.ts
- [x] Task 5: `review_comment` checks the line against the diff, refuses the 21st, and saves; `readVerdict` reads and drops the summary's last line (AC-8, AC-9, AC-10)
      Check: pnpm test packages/core/src/sessions/review-tools.test.ts
      Files: packages/core/src/sessions/review-tools.ts, packages/core/src/sessions/review-tools.test.ts
- [x] Task 6: A composer start with `review` makes a review session: folder by the PR's origin, `existing` for the PR's live review unless `another`, the title "Review web-app #2841" (AC-2, AC-3)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/compose.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/compose.ts, packages/core/src/sessions/session-store.ts, their tests
- [x] Task 7: A review's run makes the checkout, saves the merge base as its start, and runs Claude read-only in it with the review note in the brief; the Changes tab lists the PR's files (AC-4, AC-7)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/brief.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/brief.ts, their tests
- [x] Task 8: Diff only: with no folder or a failed fetch, the first step says why, GitHub's diff is saved, and Changes and a file's diff come from it; a review with no checkout posts on the latest commit, so `not_read` goes (AC-6)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts packages/core/src/sessions/changes.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/changes.ts, packages/core/src/sessions/file-session-store.ts, their tests
- [x] Task 9: `review_comment` is wired into a review's run as a step; the last answer becomes the summary and its verdict; comments stay after Stop; every `mode === 'ask'` check is reviewed for a review session (AC-8, AC-11, AC-13, AC-22)
      Check: pnpm test packages/core/src/sessions/session-service.test.ts
      Files: packages/core/src/sessions/session-service.ts, packages/core/src/sessions/session-service.test.ts
- [x] Task 10: `review.ts`: change a comment (keep, text), the status from the PR's head, and post one review with the kept, unposted comments, marking them posted; errors leave nothing marked (AC-12, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21)
      Check: pnpm test packages/core/src/sessions/review.test.ts
      Files: packages/core/src/sessions/review.ts, packages/core/src/sessions/review.test.ts, packages/core/src/sessions/pull-requests.ts (shared error mapping)
- [ ] Task 11: The routes: PATCH a comment, GET the status, POST the review, against the real server with the fake GitHub (AC-12, AC-16, AC-17)
      Check: pnpm test packages/core/src/routes/sessions.test.ts
      Files: packages/core/src/routes/sessions.ts, packages/core/src/routes/sessions.test.ts, packages/core/src/create-server.ts (only if wiring needs it)

**api-client**

- [ ] Task 12: `patchReviewComment`, `getReviewStatus` and `postReview`, with query options and keys (AC-12, AC-16, AC-18)
      Check: pnpm test packages/api-client/src/endpoints/sessions.test.ts
      Files: packages/api-client/src/endpoints/sessions.ts, packages/api-client/src/endpoints/sessions.test.ts, packages/api-client/src/query-keys.ts, packages/api-client/src/index.ts

**ui**

- [ ] Task 13: `DiffNote`: the reviewer's note box from `session-review.html` (mark, author line, body, optional footer), with stories for Claude's draft, kept, dropped, editing and posted (AC-8, AC-25)
      Check: pnpm test packages/ui/src/components/diff-note.test.tsx; pnpm gate component-coverage
      Files: packages/ui/src/components/diff-note.tsx, .stories.tsx, .test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 14: `DiffView` takes a note under a line, and `FileList` an optional count beside a file's +/− (AC-8, AC-25)
      Check: pnpm test packages/ui/src/components/diff-view.test.tsx packages/ui/src/components/file-list.test.tsx
      Files: packages/ui/src/components/diff-view.tsx, file-list.tsx, their stories and tests

**app**

- [ ] Task 15: Home's Review requested row on someone else's PR gets Review with Claude, which starts the review and opens it; a live review shows spec 047's callout (AC-1, AC-2, AC-3)
      Check: pnpm test packages/app/src/features/home/inbox-words.test.ts packages/app/src/features/home/components/attention-panel.test.tsx
      Files: packages/app/src/features/home/inbox-words.ts, packages/app/src/features/home/components/attention-panel.tsx, the composer words for the callout, their tests
- [ ] Task 16: A review session shows the Changes tab with each comment as a note under its line, Keep and Edit (react-hook-form), and the file list's counts (AC-8, AC-12, AC-24)
      Check: pnpm test packages/app/src/features/sessions/components/changes-panel.test.tsx packages/app/src/features/sessions/components/session-details.test.tsx
      Files: packages/app/src/features/sessions/components/changes-panel.tsx, session-details.tsx, components/review-note.tsx, review-words.ts, schemas.ts, queries.ts, their tests
- [ ] Task 17: The next-move bar for a review: "Claude left 6 comments", "Claude found nothing to comment on.", after Stop, and "Review posted" with Open on GitHub (AC-11, AC-13, AC-21, AC-22)
      Check: pnpm test packages/app/src/features/sessions/components/next-move.test.tsx
      Files: packages/app/src/features/sessions/components/next-move.tsx, review-words.ts, its test
- [ ] Task 18: The Post review dialog: summary, the verdict starting on Comment, Claude's recommendation, the count, the pushed-since line, the summary error, GitHub's errors, Posting…, and focus back on close (AC-14, AC-15, AC-16, AC-18, AC-19, AC-20, AC-24)
      Check: pnpm test packages/app/src/features/sessions/components/post-review.test.tsx
      Files: packages/app/src/features/sessions/components/post-review.tsx, post-review.test.tsx, review-words.ts, schemas.ts, the session screen's `Design:` note

**End to end and docs**

- [ ] Task 19: e2e: from Home's row to a posted review on the fake GitHub, nothing written before the press, axe clean at 360 and 1280 px in light and dark (AC-1, AC-2, AC-16, AC-17, AC-25)
      Check: pnpm exec playwright test e2e/review-with-claude.spec.ts
      Files: e2e/review-with-claude.spec.ts, the e2e hub's fake GitHub (review request, pull head, reviews)
- [ ] Task 20: Docs: a review session's checkout and posting in `learn/sessions-and-worktrees.md` and `learn/connecting-github.md`, and the agent-runtime skill's Ask rule
      Check: pnpm gate learn-freshness; pnpm gate handbook-size
      Files: learn/sessions-and-worktrees.md, learn/connecting-github.md, .claude/skills/agent-runtime/SKILL.md, .claude/skills/integration-adapter/SKILL.md
- [ ] Task 21: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
