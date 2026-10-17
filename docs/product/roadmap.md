# Roadmap

How version 1 gets built: four phases, about nine weeks for one developer working part-time alongside Claude. Each phase ends at a gate, and the next phase starts only when its gate is met. Source: the build plan in `docs/product/spec.md`.

## Phases

| Phase                | Weeks | What ships                                                                                       | Gate to move on                       |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------ | ------------------------------------- |
| 1. Foundation        | 1–2   | Repo and one-command start; local server and keychain; Jira and GitHub connect; Settings screens | Inbox shows my real tickets and PRs   |
| 2. Inbox and tickets | 3–4   | Home attention list; Tickets board and list; the design system in React; search with ⌘K          | 3 devs use it daily for a week        |
| 3. Claude sessions   | 5–7   | Agent SDK adapter; worktrees and approvals; live diff and follow-ups; create pull request        | First PR merged from a DevHub session |
| 4. Slack and polish  | 8–9   | Slack inbox and context; dark mode and an accessibility pass; install guide; pilot with 5 devs   | Slack app approved, pilot feedback in |

Slack comes last because it needs Slack admin approval and can slip without blocking the rest. Send the admin request on day one.

## Specs, in build order

Each line becomes a folder `specs/<NNN>-<slug>/` when someone runs `/spec <NNN>`. The screen reference is the file in `docs/design/screens/` the spec builds from.

| #   | Spec                              | Scope                                                                                                                                                                                                                                         | Screen reference                                      |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 000 | `000-repo-foundation`             | Done. Monorepo, agent kit, tokens and first components, shell, local server with Host and token checks, status endpoint and event stream                                                                                                      | `home.html` (shell only)                              |
| 001 | `001-app-shell-and-navigation`    | Sidebar collapse, New task (⌘N), Search button, session list from the server, skip link, narrow-window stacking, keyboard rules                                                                                                               | all four (sidebar, page bar)                          |
| 002 | `002-secrets-and-keychain`        | OS keychain store for tokens (@napi-rs/keyring), opt-in `.env` fallback, "Clear cache"                                                                                                                                                        | none (server only)                                    |
| 003 | `003-connect-jira`                | Jira site + email + API token, checked with Jira before saving; connection state. Reading issues moved to 007 and 008 (spec 003 Q1)                                                                                                           | `settings.html` (Jira row)                            |
| 004 | `004-connect-github`              | Reuse the `gh` login or a PAT, checked with GitHub before saving; connection state. Reading review requests, my PRs, checks and comments moved to 007 (spec 004 Q1)                                                                           | `settings.html` (GitHub row)                          |
| 005 | `005-settings-screens`            | Settings tabs: Connections, Coding agent (permission modes), Repositories (folder → Jira project), Inbox rules, Appearance; save as you change                                                                                                | `settings.html`                                       |
| 006 | `006-design-system-components`    | The remaining components: SegmentedControl, Stepper, Menu, Composer, WorkItemCard, AttentionRow, FileList, DiffView, Choice card, Resume banner                                                                                               | `docs/design/design-system.md`                        |
| 007 | `007-home-inbox`                  | "Needs your attention" list with All · Jira · Pull requests · Slack tabs, reasons with wait times, actions, 2-minute refresh, SQLite cache; reads assigned Jira issues (from 003) and review requests, my PRs, checks and comments (from 004) | `home.html` (attention list, page bar)                |
| 008 | `008-tickets-board-and-list`      | Sprint board by status category, list view, filters and count, cards with priority, due and agent state, new-ticket form; reads the current sprint (from 003)                                                                                 | `tickets.html`                                        |
| 009 | `009-search`                      | ⌘K search across tickets, PRs, messages and sessions                                                                                                                                                                                          | none — stop and ask for a design                      |
| 010 | `010-agent-adapter`               | `AgentAdapter` with the Claude Agent SDK, company login, event stream to the app                                                                                                                                                              | none (server only)                                    |
| 011 | `011-sessions-and-worktrees`      | Branch + worktree under `~/.devhub/worktrees/`, the brief, the Session screen with progress and stepper, Stop and Discard                                                                                                                     | `session.html`                                        |
| 012 | `012-approvals`                   | Permission modes, allow list, always-ask rules, the inline approval callout, Allow once / Always allow / Deny                                                                                                                                 | `session.html` (approval callout)                     |
| 013 | `013-live-changes-and-follow-ups` | Changes tab with file list and live diff, Ticket tab, follow-up box                                                                                                                                                                           | `session.html` (Changes, follow-up)                   |
| 014 | `014-create-pull-request`         | Push the branch and open the PR only on the user's click, Claude-drafted title and description, "PR open" state                                                                                                                               | `session.html` (Create pull request)                  |
| 015 | `015-home-composer-and-context`   | Home composer, + Add context menu (repo, ticket, PR, Slack thread, file), chips, quick starts, waiting banner                                                                                                                                 | `home.html` (composer, quick starts, banner)          |
| 016 | `016-slack`                       | Slack user token, mentions and DMs with the 2 h wait, Slack thread as context                                                                                                                                                                 | `home.html` (Slack rows), `settings.html` (Slack row) |
| 017 | `017-polish-dark-mode-a11y`       | Full dark-mode and accessibility pass across every screen, reduced motion, contrast check                                                                                                                                                     | all four                                              |
| 018 | `018-install-guide`               | Install guide for any team: clone, connect, first session                                                                                                                                                                                     | none (docs)                                           |

## The session lifecycle

Every Claude session (specs 010–014) moves through five steps. Claude moves on its own between them. It stops for the user at two kinds of point.

```
Plan ──▶ Build ──▶ Test ──▶ Review ──▶ Pull request
reads    edits     runs      you check   you click
brief    files     commands  the diff    Create
                    │  ▲        │
       risky command│  │allowed │ you ask for changes
                    ▼  │        ▼
                 Needs you    back to Build
               (allow / deny)
```

- **Test ↔ Needs you**: a risky command waits for Allow once, Always allow, or Deny; an allowed command runs.
- **Review → Build**: when the user asks for changes in the follow-up box.
- **Pull request**: always the user's click.
- **Stop** works at any step; changes stay in the worktree until the user discards them.
