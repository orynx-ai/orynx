# Tasks: Settings › Connections redesign

One task is one commit. Test first, then code. Tick a task only when its Check passes.

- [x] Task 1: Script the people-owned files: unzip "10" into `docs/design/screens/connections/` and "10a" into `docs/design/screens/connection-dialog/`, add their new CSS (`dh-conn`, `dh-conn-mark`, `dh-status-btn`, `dh-kv`, `dh-flow-num`, `dh-dialog-foot`) and a Connections section to `design-system.md`. The user runs it, checks `git diff` and commits it (Q1)
      Check: sh -n specs/030-connections-redesign/people-files.sh; the script run on a scratch copy of the repo changes only docs/design/**
      Files: specs/030-connections-redesign/people-files.sh
- [x] Task 2: `IntegrationStatus` gains optional `account` and `checkedAt`; `ConnectionCheckSchema` (`status`, `ms`) and the two check paths (AC-7, AC-8)
      Check: pnpm test packages/contracts/src/status.test.ts; pnpm typecheck
      Files: packages/contracts/src/status.ts, packages/contracts/src/status.test.ts, packages/contracts/src/routes.ts
- [x] Task 3: `CheckedStatus.checkedAt()`, kept out of the compared answer; Jira's status names the account and when it was checked; `jira.checkNow()` timed, refused when nothing is saved; `POST /api/jira/connection/check` (AC-8, AC-9)
      Check: pnpm test packages/core/src/integrations/checked-status.test.ts packages/core/src/integrations/jira/connection-status.test.ts packages/core/src/routes/jira.test.ts
      Files: packages/core/src/integrations/checked-status.ts, packages/core/src/integrations/jira/connection.ts, packages/core/src/routes/jira.ts, and their tests
- [x] Task 4: The same for GitHub: the login as the account when connected, `github.checkNow()`, `POST /api/github/connection/check` (AC-15, AC-17, AC-18)
      Check: pnpm test packages/core/src/integrations/github/connection-status.test.ts packages/core/src/routes/github.test.ts
      Files: packages/core/src/integrations/github/connection.ts, packages/core/src/routes/github.ts, and their tests
- [ ] Task 5: `api.checkJiraConnection()` and `api.checkGitHubConnection()`, parsed with the contract (AC-8, AC-17)
      Check: pnpm test packages/api-client/src/jira.test.ts packages/api-client/src/github.test.ts
      Files: packages/api-client/src/endpoints/jira.ts, packages/api-client/src/endpoints/github.ts, packages/api-client/src/client.ts, and their tests
- [ ] Task 6: `StatusButton` (36 px, round, Connected · Needs reconnecting · Not connected looks, tooltip and name) and `StatusSign`, its 20 px look for the key; stories for each look; design-map rows (AC-3, AC-4)
      Check: pnpm test packages/ui/src/components/status-button.test.tsx; pnpm gate component-coverage icon-buttons style-policy
      Files: packages/ui/src/components/status-button.tsx, .stories.tsx, .test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 7: `DetailList` (a `dl` grid, terms muted) and `DialogContent size="narrow"` (520 px, the 16 px gutter under 768 px); stories; design-map rows, and the Dialog row's one exception: Disconnect alone at the foot's start (Q6) (AC-7, AC-25)
      Check: pnpm test packages/ui/src/components/detail-list.test.tsx packages/ui/src/components/dialog.test.tsx; pnpm gate component-coverage style-policy
      Files: packages/ui/src/components/detail-list.tsx, .stories.tsx, .test.tsx, packages/ui/src/components/dialog.tsx, dialog.stories.tsx, dialog.test.tsx, packages/ui/src/index.ts, docs/design-map.md
- [ ] Task 8: `ConnectionDialog`, Connected: the head (mark, name, pill, Close), the line, the details (Site, Account, Signed in with, Orynx reads and writes, Last checked), Disconnect · Cancel · Test connection · Done; Test busy, then "Working. Jira answered in N ms." and Test again; a failed test turns the pill and shows the reason; Done, Cancel, Close and Escape return focus (AC-7, AC-8, AC-9, AC-10, AC-26)
      Check: pnpm test packages/app/src/features/settings/components/connection-dialog.test.tsx
      Files: packages/app/src/features/settings/components/connection-dialog.tsx, connection-dialog.test.tsx, connection-words.ts, packages/app/src/features/settings/queries.ts
- [ ] Task 9: Confirm disconnect: the red alert with what goes and what stays, Keep connected · Disconnect, focus on Keep connected, the running-sessions line for Jira; Disconnect shuts the dialog and hands the panel its message (AC-11, AC-12, AC-13, AC-14)
      Check: pnpm test packages/app/src/features/settings/components/connection-dialog.test.tsx
      Files: packages/app/src/features/settings/components/connection-dialog.tsx, connection-dialog.test.tsx, connection-words.ts
- [ ] Task 10: Needs reconnecting through gh: the amber callout with the server's reason, `gh auth login` with Copy, Reconnect busy with "Checking your gh login…", success shuts the dialog with "GitHub reconnected. Your inbox is refreshing.", failure shows the new reason; Cancel mid-check still lands the message (AC-15, AC-16, AC-17, AC-18)
      Check: pnpm test packages/app/src/features/settings/components/connection-dialog.test.tsx
      Files: packages/app/src/features/settings/components/connection-dialog.tsx, connection-dialog.test.tsx, connection-words.ts
- [ ] Task 11: Needs reconnecting with a token (Jira, or GitHub by token): one token field with its Create link inside the callout, Reconnect saves it through today's PUT, empty re-checks the saved one (Q3) (AC-19)
      Check: pnpm test packages/app/src/features/settings/components/connection-dialog.test.tsx packages/app/src/features/settings/components/reconnect-token-form.test.tsx
      Files: packages/app/src/features/settings/components/reconnect-token-form.tsx, reconnect-token-form.test.tsx, connection-dialog.tsx, connection-dialog.test.tsx, packages/app/src/features/settings/schemas.ts
- [ ] Task 12: Not connected: today's Jira and GitHub forms in the dialog's body with Cancel · Connect in its foot (`form` attribute), their own Disconnect and button rows gone; Slack: the line, step 1 and Copy request for your admin (Q4), Close (AC-20, AC-21, AC-22)
      Check: pnpm test packages/app/src/features/settings/components/jira-connection-form.test.tsx packages/app/src/features/settings/components/github-connection-form.test.tsx packages/app/src/features/settings/components/connection-dialog.test.tsx
      Files: jira-connection-form.tsx, github-connection-form.tsx, connection-dialog.tsx, slack-setup.tsx, and their tests, in packages/app/src/features/settings/components/
- [ ] Task 13: The panel swap (after the user has run Task 1's script): "Your tools", one row per tool with its mark, name, detail and `StatusButton` opening the dialog, the key, the green page message, the loading rows (Q7), the page bar's "N of 3 connected · N needs attention", the `// Design:` note; the old row components and their tests go (AC-1, AC-2, AC-3, AC-5, AC-6, AC-14, AC-26)
      Check: pnpm test packages/app/src/features/settings; pnpm gate design-source style-policy component-coverage
      Files: connections-panel.tsx, connections-panel.test.tsx, connections-summary.tsx, settings-screen.tsx; removes connection-row, managed-connection-row, jira-connection-row, github-connection-row (.tsx and .test.tsx)
- [ ] Task 14: e2e: connect-jira and connect-github rewritten for the dialog; connected, failed-test and reconnect states faked with `page.route`; keyboard only, no layout shift while loading, 360 and 1280 px, axe in light and dark for the page and each dialog state; smoke's "Not connected" count still scoped to the list (AC-5, AC-23, AC-24, AC-25)
      Check: pnpm test:e2e e2e/connect-jira.spec.ts e2e/connect-github.spec.ts e2e/smoke.spec.ts
      Files: e2e/connect-jira.spec.ts, e2e/connect-github.spec.ts, e2e/smoke.spec.ts
- [ ] Task 15: STOP and run /review
      Check: the review stamp matches the branch (pnpm review:stamp verify)
