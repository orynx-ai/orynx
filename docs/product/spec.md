# DevHub – Product Spec

Oct 16, 2026 · @Unknown

## Overview

DevHub is one local web app where a developer sees everything that needs them (Jira, GitHub, Slack) and hands a ticket to Claude to build, watching the change happen and approving each risky step. It runs on the developer's own computer: clone the repo, run one command, open `localhost:4317`.

**The problem.** A developer's day is split across four tabs. Jira says what to build, GitHub says what to review, Slack says who is waiting, and the coding agent lives in a terminal. Nothing connects them, so work waits and context gets lost.

**Goals for version 1**

- One list of what needs me, with the reason and how long it has waited.
- Start Claude on a ticket in one click, with the ticket, repo and related thread as its brief.
- See Claude's steps and the code changes live, approve commands, and open a pull request only when I say so.
- Nothing stored in any company cloud: tokens and cache stay on the laptop.

**Not in version 1**

- Team dashboards, manager views or analytics.
- Agents other than Claude (the design leaves a slot for them).
- Editing Jira tickets or writing Slack replies from inside DevHub (we link out instead).
- A hosted or shared server version.

## Who it is for and how it should feel

The first user is an individual developer who already has a company Claude login, a Jira account, GitHub access and Slack. Later, any team can clone and run it.

| Principle | What it means in the product |
| --- | --- |
| Calm by default | Warm grey chrome; colour only for status, source, selection and focus. |
| One next step per screen | Each screen has one filled button: Send, Review, Create pull request. |
| Always know where you are | Sidebar for places, breadcrumb for depth, tabs for views inside a place. |
| Say why | Every inbox item says why it is there and how long it waited ("No reply · 3 h"). |
| Nothing happens without you | Claude never pushes code or opens a PR by itself; risky commands need approval. |
| Local first | Runs on your laptop; talks only to Jira, GitHub, Slack and Claude directly. |

## How it runs

DevHub is a web page and a small server, both on your laptop, started with `npm install && npm start`. The server talks to Jira, GitHub, Slack and Claude with your own logins; there is no DevHub cloud.

&#91;embedded content: DevHub architecture · 4 parts on the laptop, 4 outside services\]

The local server is the hub: the web page asks it for data and gets live updates back, it calls each service with your tokens, and it runs Claude through the Agent SDK inside a separate git worktree.

**Tech choices**: React + Vite for the web app, Node + TypeScript (Fastify) for the server, server-sent events for live updates, SQLite for the cache, `@anthropic-ai/claude-agent-sdk` for Claude, `simple-git` for worktrees. One repo, one `npm start`.

## Navigation and screens

The app has four places, always reachable from the sidebar, and every screen uses the same frame: sidebar on the left, a 52 px page bar (breadcrumb on the left, page actions on the right), an optional filter toolbar, then the content.

| Screen | Breadcrumb | What you do there | Tabs or views |
| --- | --- | --- | --- |
| Home | Home | Start a task with Claude; clear the "Needs your attention" list | All · Jira · Pull requests · Slack |
| Tickets | Tickets / Sprint 42 | See your sprint, pick a ticket, start Claude on it | Board · List |
| Session | Tickets / Sprint 42 / PROJ-1423 | Watch Claude work, approve commands, review changes, create the PR | Changes · Ticket |
| Settings | Settings / Connections | Connect tools, choose the agent and permissions, add repos, set inbox rules, theme | Connections · Coding agent · Repositories · Inbox rules · Appearance |

**Sidebar, top to bottom**

1. Logo and a collapse button.
2. **New task** (⌘N) and **Search** (⌘K, searches tickets, PRs, messages and sessions).
3. Places: Home (count of items needing you), Tickets (count in sprint), Settings.
4. **Sessions**: the five most recent Claude sessions, each with a title, ticket key and state: Needs you, Working, Done, ready for PR, or Stopped. "View all" lists every session.
5. You: initials, name and "Claude connected · runs locally". Links to Settings.

**Keyboard**: a "Skip to content" link is the first Tab stop; arrow keys move inside tab lists and menus; Esc closes any menu and returns focus to its button.

## Home

Home answers two questions: "what should Claude build next?" and "who is waiting on me?". Top to bottom it shows:

1. **Waiting banner** (only when a session needs you): "Claude is waiting for your approval · PROJ-1423 · wants to run npm test" with a Review button that opens the session.
2. **Greeting**: "What should we build today?"
3. **Composer**: a text box, the **+ Add context** button, the repository picker, the agent picker (Claude) and Send. Send creates a session and opens it.
4. **Quick starts**: Pick up a ticket, Review a pull request, Fix failing checks, Draft a Slack reply. Each either opens a screen or filters the list below.
5. **Needs your attention**: one list with tabs All · Jira · Pull requests · Slack, oldest wait first. Each row shows the source, title, sub line, a reason pill and one action (Review, Reply, Open, Fix, Build).

**What counts as "needs you"** (each rule can be switched off in Settings › Inbox rules)

| Source | Rule | Reason shown | Action |
| --- | --- | --- | --- |
| Jira | Assigned to me and not Done | Due date, or "Bug" for high-priority bugs | Build with Claude |
| GitHub | My review is requested on an open PR | "Review · 2 d" | Review (opens GitHub) |
| GitHub | My PR has a failing check | "Checks failing" | Fix with Claude |
| GitHub | My PR has unresolved review comments | "2 new comments" | Open comments |
| Slack | I was @mentioned or DM'd and have not replied in 2 h | "No reply · 3 h" | Reply (opens Slack) |
| DevHub | A Claude session is waiting for approval | "Approve command" | Open session |

**Refresh**: lists refresh every 2 minutes in the background and on demand from the page bar ("Synced 2 min ago · Refresh"). Items disappear as soon as the rule no longer matches (you replied, reviewed or the ticket moved to Done).

## The + Add context menu

The + button in the composer tells Claude what to work from. It opens a menu of five kinds; each kind (except File) opens a searchable list in the same popup, with a Back button and a one-line note on what Claude will see.

| Kind | Search by | What picking it does | What Claude receives |
| --- | --- | --- | --- |
| Git repository | Folder name or path | Sets the repository picker (one repo per task) | The repo path; work happens in a new branch and worktree |
| Jira ticket | Key or title | Adds a chip, e.g. **PROJ-1423 ×** | Summary, description, acceptance criteria, comments, linked issues |
| Pull request | Repo, number or title | Adds a chip, e.g. **web-app #2836 ×** | Diff, failing checks with logs, review comments |
| Slack thread | Words, person or channel | Adds a chip with the sender and channel | Only that thread's messages |
| File from this computer | System file dialog | Adds a file chip | The file's text (PDF, Markdown, logs, images described) |

**Rules**

- A chip can be removed with its × before sending. Items already added show a check in the list.
- When a Jira ticket is added, the prompt changes to "What should Claude do with PROJ-1423?" and Send works even with the box empty (the ticket is the brief).
- Pasting a Jira key or a GitHub PR link into the text box adds the same chip automatically.
- If no repository is chosen, DevHub uses the repo mapped to the ticket's Jira project in Settings › Repositories; if none, it asks.
- Esc closes the menu; focus returns to the + button.

## Tickets

Tickets shows your current Jira sprint as a board or a list, and is the main place to start Claude on a ticket.

- **Page bar**: breadcrumb (Tickets / Sprint 42), sprint end date, search, Board / List switch.
- **Toolbar filters**: Assigned to me (on by default), Due this week, Bugs only, plus a live count ("9 tickets").
- **Columns** map to Jira status categories: To do, In progress, In review, Done. Each header has a status icon (dashed circle, half circle, three-quarter circle, check), a count and a + button.
- **Card**: key and type ("Bug" in red), title (two lines max), priority bars and word, due date (amber when due this week), your avatar, and on the right either Claude's state for that ticket (Needs you, Working, Ready for PR) or a sparkle button "Build PROJ-1377 with Claude".
- **List view**: the same tickets as a table with Key, Title, Status, Priority, Due and Agent columns.
- **Empty column**: says why ("Nothing in review" or "No tickets match these filters").

**Actions**

| Click | Result |
| --- | --- |
| Card title | Opens the session for that ticket if one exists, otherwise the ticket detail in a side panel |
| Sparkle (Build with Claude) | Creates a session with the ticket as context and its mapped repo, then opens it |
| Agent chip | Opens that ticket's session |
| Column + | Opens a small "New ticket" form (title, type, priority) that creates the issue in Jira in that status |

DevHub does not move tickets between columns by drag in version 1; status changes when Jira changes (for example when the PR opens, the ticket can move to In review through your existing Jira automation).

## Agent sessions

A session is one piece of work Claude does for you: one task, one repo, one branch. It moves through five steps (Plan, Build, Test, Review, Pull request) and you can stop it at any time.

&#91;embedded content: session lifecycle · 5 steps, 2 points where you decide\]

Claude moves on its own between steps; it stops for you when a command needs approval, and the pull request is always your click.

**What happens when you click Build with Claude or Send**

1. DevHub creates a branch named after the ticket (`feat/PROJ-1423`) in a separate git worktree under `~/.devhub/worktrees/`. Your main checkout is never touched.
2. It builds the brief: your message, plus every context chip (ticket text, PR diff, Slack thread, files).
3. It starts Claude through the Claude Agent SDK, using your company Claude login, with the worktree as its working folder.
4. Claude's messages stream to the Session screen: each step (read files, plan, edit, run) appears in "Claude's progress".
5. File edits are allowed inside the worktree. Shell commands follow your permission setting; when approval is needed, an amber prompt appears in place: Allow once, Always allow this command, or Deny.
6. Changes show live in the **Changes** tab: a file list with +/− counts and a diff of the selected file.
7. When Claude finishes, the session moves to Review. You read the diff, ask for changes in the follow-up box, or click **Create pull request**.
8. DevHub pushes the branch and opens the PR on GitHub with a title and description drafted by Claude, linking the Jira ticket. The session becomes "Done, ready for PR" and then "PR open".

**Session states** (shown in the sidebar with an icon, a word and a colour)

| State | Meaning | Icon |
| --- | --- | --- |
| Working | Claude is reading, editing or running an allowed command | Spinning arc, indigo |
| Needs you | Waiting for an approval or a question answered | "!", amber |
| Done, ready for PR | Claude finished; nothing pushed yet | Check, green |
| PR open | Pull request created | Branch icon |
| Stopped | You pressed Stop; the worktree keeps the changes | Square, grey |

**Session screen layout**: page bar (breadcrumb, "Started 4 min ago", Open in Jira, More), title with status and branch, the five-step progress bar, then two panes: Claude's progress (approval prompt on top, steps, follow-up box) and the Changes / Ticket tabs. Stop Claude and Create pull request sit next to the title.

**Cleaning up**: Discard changes deletes the worktree and branch after a confirm step. Merged or discarded sessions leave the sidebar after 7 days but stay under "View all".

## Integrations

Each integration is a small adapter on the local server. All of them use the developer's own account, so DevHub can never see more than that person already can.

| Tool | How you connect | What DevHub reads | What DevHub writes | Setup effort |
| --- | --- | --- | --- | --- |
| Jira | Site address + email + personal API token | Issues assigned to you, current sprint, issue details and comments | New issue from the column + button | 2 minutes |
| GitHub | Reuses the `gh` command-line login, or a personal access token | PRs where your review is requested, your PRs, checks, review comments | Pushes the session branch, opens the PR | 1 minute if `gh` is set up |
| Slack | Slack app with a user token (`search:read`, `channels:history`, `im:history`) | Mentions and DMs to you, and threads you add as context | Nothing in v1 (Reply opens Slack) | Needs Slack admin approval |
| Claude | Claude Agent SDK, signed in with your company Claude login | Nothing; it receives the brief you send | Edits files in the session worktree; runs allowed commands | Already done if Claude Code works on your laptop |

**Agent adapter.** Claude plugs in through one small interface so other agents can follow later without changing the screens:

```
startSession(brief, repoPath, permissions) -> sessionId
onEvent(sessionId, handler)   // step, file change, approval request, done, error
respond(sessionId, approvalId, allow | deny | always)
sendMessage(sessionId, text)
stop(sessionId)
```

**When a tool is down or not connected**: its tab and rows show a single line ("GitHub is not connected. Connect it in Settings.") and the rest of DevHub keeps working.

## Settings

Settings has five tabs; changes save as you make them.

| Tab | What you set | Defaults |
| --- | --- | --- |
| Connections | Connect or manage Jira, GitHub, Slack; see status (Connected, Needs admin approval, Error) | All off until connected |
| Coding agent | Which agent (Claude now, more later); what Claude may do without asking | "Edit files freely, ask before commands" |
| Repositories | Local folders Claude may work in, each mapped to a Jira project; Add local folder | None; added on first run |
| Inbox rules | Which rules feed "Needs your attention" and the Slack wait time | All on, Slack wait 2 h |
| Appearance | Match my computer, Light, Dark | Match my computer |

**Permission modes**

- **Ask before everything**: every file edit and every command needs a click.
- **Edit files freely, ask before commands** (recommended): edits stay inside the worktree; commands ask.
- **Edit files and run allowed commands**: commands on your allow list (for example `npm test`, `npm run lint`) run without asking; anything else asks. "Always allow" in a prompt adds to this list.

Commands that touch the network, delete outside the worktree, or push to git always ask, whatever the mode.

## Security, privacy and data

DevHub keeps everything on the developer's laptop and has no server of its own.

| Data | Where it lives | Notes |
| --- | --- | --- |
| Jira, GitHub and Slack tokens | OS keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux) | Never written to disk in plain text or to the repo; `.env` only as a fallback the user opts into |
| Cached tickets, PRs, messages | `~/.devhub/cache.db` (SQLite) | Refreshed every 2 min; "Clear cache" in Settings; holds titles and metadata, not full Slack history |
| Sessions and their logs | `~/.devhub/sessions/` | Brief, Claude's steps and approvals, for your own review |
| Code changes | Git worktrees in `~/.devhub/worktrees/` | Removed on Discard or after the PR merges |
| Claude login | Handled by the Claude Agent SDK | DevHub never sees the credentials |

**Safety rules built in**

- The web server listens on `127.0.0.1` only, with a random session token in the page, so other machines and other sites cannot call it.
- Claude's working folder is the worktree; it cannot edit your main checkout.
- Push, network calls and deletes outside the worktree always need approval.
- What is sent to Claude is exactly the brief shown in the composer chips; Slack data goes only when you add a thread.
- No telemetry in version 1.

## Design system and accessibility

All screens are built from the [DevHub design system](https://claude.ai/artifact/GEgRAWYbFkdw51YegajTTu): tokens plus about 20 components (sidebar, page header, tabs, breadcrumb, composer, menu, ticket card, inbox row, stepper, diff view, callout and more). The [screen designs](https://claude.ai/artifact/4LxEnbr4Tz9GT9RFxs1GCo) show them in use.

- **Look**: warm stone neutrals, one indigo accent for links and focus, green / amber / red only for status. Geist for UI, Geist Mono for code and keys, Newsreader for the Home greeting only.
- **Shape**: 4 px spacing scale; radius 6 for controls, 10 for cards, 16 for the composer; one soft shadow for menus.
- **Contrast**: every text and background pair passes 4.5:1 in light and dark; control borders and focus rings pass 3:1.
- **State is never colour alone**: icon shape + word + colour (for example "!" Needs you).
- **Keyboard and screen readers**: skip link, visible focus ring on everything, real buttons and links, `aria-current` in nav and breadcrumbs, tab lists with arrow keys, approval prompts announced with `role="alert"`, Claude's progress in a polite live region.
- **Motion**: none needed; respects "reduce motion".
- **Narrow windows**: sidebar stacks above content, wide tables and the board scroll inside their box.

## Build plan

A working version 1 takes about nine weeks for one developer, in four phases; each phase ends with something people can use, and the next phase starts only when its gate is met.

&#91;embedded content: build plan · 4 phases, 4 gates (estimated weeks)\]

Weeks are estimates for one developer working part-time alongside Claude; Slack can slip without blocking the rest, which is why it comes last.

## Open questions and risks

| Risk or question | Why it matters | Plan |
| --- | --- | --- |
| Slack app approval | Without it there is no Slack inbox | Ship Jira + GitHub first; send the admin request on day one |
| Claude login reuse | The Agent SDK must use the company login, not a personal API key | Confirm with IT how Claude Code is licensed; test on 2 laptops |
| Large repos | Worktrees for big monorepos take disk space and setup time | Reuse worktrees per ticket; show disk use in Settings |
| Cost and limits | Long sessions use more Claude quota | Show time and steps per session; let people stop early |
| Wrong edits | Claude may change files outside the task's intent | Worktree isolation, diff review before PR, Discard button |
| Jira variations | Teams use different workflows and fields | Map by status category, not status name; make acceptance-criteria field configurable |

- [ ] Which Jira field holds acceptance criteria in our projects?
- [ ] Is `gh` already installed on most developer laptops?
- [ ] Who approves the Slack app, and what scopes will they allow?
- [ ] Should sessions be shareable with a teammate (export the log) in v2?
