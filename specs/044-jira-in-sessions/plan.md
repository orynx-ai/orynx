# Plan: Jira in sessions

Spec: `specs/044-jira-in-sessions/spec.md`

## Order of work

1. The Jira client first (`integrations/jira/client.ts`): a free JQL search, then comment, transitions, transition and assign, each with Jira's own reason when it refuses (Q6, AC-18), and a small Markdown → ADF writer for comments, since spec 019 never wrote one. Everything else calls these, and they test on their own against the fake Jira.
2. The `jira` step kind in the contract, with its words in the app (Q4, Q10), so the tools have somewhere to land.
3. The read tools as `OrynxTool`s in `sessions/jira-tools.ts`, offered at the start of every run while Jira is connected, in Build and Ask sessions alike (AC-1 to AC-10).
4. The `jiraChanges` preference and the Coding agent row "Claude changes Jira" (Q8), off by default.
5. The `jira` approval kind, and a way for an Orynx tool to refuse a call without asking (a status the issue can't reach, AC-15).
6. The write tools: every write asks on the callout unless the row is on; Always allow turns the row on; Deny and Stop send nothing (AC-13 to AC-17, Q11).
7. The no-leaks test over a session that reads, writes and fails (AC-11, AC-19), then the docs and skills.

Writes go to Ask sessions too, always behind Allow or the row: the user's first report came from an Ask session.

## Risks

| Risk                                                                      | How we will notice early                                                    | What we do                                                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A write runs without Allow while the row is off                           | A session test with the row off: the fake Jira records no write until Allow | A write's `asks()` returns null only when the row reads on, read again for every call          |
| The token, email or Authorization header reaches Claude, a step or a file | The no-leaks test over every answer, step, event, log line and session file | Tools answer with display names and fields we pick, never Jira's raw objects                   |
| Every Jira-connected test session gets six more tools                     | `compose.test.ts`'s exact tool lists fail                                   | Update those lists in the task that offers the tools                                           |
| A transition lookup holds the session's other approval decisions          | A slow fake Jira in a test                                                  | It waits Jira's own 10 s at most, then refuses with "Jira took too long to answer."            |
| Matching a status by name across workflows                                | A test with two transitions to statuses of the same name in other workflows | Only this issue's own transitions, by the target status's name, then POST that transition's id |

## Touches

- Packages: contracts, core, app
- Gates that check this work: boundaries, test-policy, component-coverage, style-policy, secrets
- Skills to follow: `.claude/skills/integration-adapter/SKILL.md`, `.claude/skills/agent-runtime/SKILL.md`, `.claude/skills/add-api-endpoint/SKILL.md`, `.claude/skills/honest-tests/SKILL.md`, `.claude/skills/clean-ui/SKILL.md`
