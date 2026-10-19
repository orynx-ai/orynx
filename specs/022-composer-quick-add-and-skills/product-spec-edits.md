# Spec 022: edits for docs/product/spec.md

You own `docs/product/spec.md`, so this branch leaves it alone. These are the edits spec 022 implies, top to bottom. Each "Before" is the text as it stands on `origin/main` on 19 Oct 2026; replace it with "After", then review it with `git diff docs/product/spec.md`.

Spec 020's `specs/020-first-use-feedback/product-spec-edits.sh` changes three of the same lines (edits 3, 7 and 8). Run it first if you still mean to: it stops without changing anything when a line it looks for is gone. Where it has run, the "Before" reads as each edit notes.

## 1. Home: the composer

Before:

```md
3. **Composer**: a text box, the **+ Add context** button, the repository picker, the agent picker (Claude) and Send. Send creates a session and opens it.
```

After:

```md
3. **Composer**: a text box, the **+ Add context** button, the repository picker, the agent picker (Claude) and Send. The first two context chips show, then a "+3" chip that opens every chip in a "Context for Claude" dialog, by kind. Typing `/` lists skills. Send creates a session and opens it.
```

## 2. Home: the rows' one action

Before:

```md
5. **Needs your attention**: one list with tabs All · Jira · Pull requests · Slack, oldest wait first. Each row shows the source, title, sub line, a reason pill and one action (Review, Reply, Open, Fix, Build).
```

After:

```md
5. **Needs your attention**: one list with tabs All · Jira · Pull requests · Slack, oldest wait first. Each row shows the source, title, sub line, a reason pill and one action: + Add to composer on a Jira or pull request row (once added, a check that takes it out again), Open session on a session's row, Reply on a Slack row. A Jira row's title opens the ticket dialog; a pull request row's title opens GitHub.
```

## 3. Home: "What counts as needs you", the Action column

Before (after spec 020's script, the Jira row ends `| Ship, Open in Jira (icons) |`):

```md
| Jira | Assigned to me and not Done | Due date, or "Bug" for high-priority bugs | Build with Claude |
| GitHub | My review is requested on an open PR | "Review · 2 d" | Review (opens GitHub) |
| GitHub | My PR has a failing check | "Checks failing" | Fix with Claude |
| GitHub | My PR has unresolved review comments | "2 new comments" | Open comments |
```

After:

```md
| Jira | Assigned to me and not Done | Due date, or "Bug" for high-priority bugs | + Add to composer |
| GitHub | My review is requested on an open PR | "Review · 2 d" | + Add to composer |
| GitHub | My PR has a failing check | "Checks failing" | + Add to composer |
| GitHub | My PR has unresolved review comments | "2 new comments" | + Add to composer |
```

The Slack and DevHub rows stay. The roadmap's `020-fix-a-failing-check` may give the failing-check row Fix with Claude again; that's its call.

## 4. The + Add context menu: File from this computer

Before:

```md
| File from this computer | System file dialog | Adds a file chip | The file's text (PDF, Markdown, logs, images described) |
```

After:

```md
| File from this computer | The computer's own file picker, several files at once; a typed path when no picker can open | Adds a chip per file, by its path | The file's path. Claude reads it where it is and never changes it. Any type and size; a name that looks like a secret (`.env`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`) is refused |
```

## 5. The + Add context menu: Rules

Before:

```md
- A chip can be removed with its × before sending. Items already added show a check in the list.
- When a Jira ticket is added, the prompt changes to "What should Claude do with PROJ-1423?" and Send works even with the box empty (the ticket is the brief).
- Pasting a Jira key or a GitHub PR link into the text box adds the same chip automatically.
- If no repository is chosen, DevHub uses the repo mapped to the ticket's Jira project in Settings › Repositories; if none, it asks.
```

After:

```md
- A chip can be removed with its × before sending, or with Remove in the "+3" dialog. Items already added show a check in the list.
- A session takes up to 10 tickets, 10 pull requests, 20 files and 5 skills. The first ticket added is the session's ticket: it names the branch and the session, picks the repository, and a live session on it stops Send. Every other ticket is context only. Removing the first makes the next one the session's ticket.
- When a Jira ticket is added, the prompt changes to "What should Claude do with PROJ-1423?" ("What should Claude do with these 3 tickets?" with several) and Send works even with the box empty (the ticket is the brief).
- Pasting a Jira key or a GitHub PR link into the text box adds the same chip automatically.
- A Home row's +, Ship on a Tickets card or row, and Add to composer in the ticket dialog add their chip after the ones already there.
- If no repository is chosen, DevHub uses the repo mapped to the first ticket's Jira project in Settings › Repositories; if none, it asks.
- Typing `/` at the start of the box, or after a space or a new line, lists skills: the repository's (`.claude/skills`, `.claude/commands`), then yours (`~/.claude`); the repository's wins on a shared name. Picking one puts `/name` in the box. At Send, each `/name` that is a skill adds that skill's text to the brief, and Claude may read, never change, the skill's folder. A skill brings no hooks, MCP servers or allow rules.
```

## 6. Tickets: the card

Spec 020 named the sparkle Ship; its script left this line as it was.

Before:

```md
- **Card**: key and type ("Bug" in red), title (two lines max), priority bars and word, due date (amber when due this week), your avatar, and on the right either Claude's state for that ticket (Needs you, Working, Ready for PR) or a sparkle button "Build PROJ-1377 with Claude".
```

After:

```md
- **Card**: key and type ("Bug" in red), title (two lines max), priority bars and word, due date (amber when due this week), your avatar, and on the right either Claude's state for that ticket (Needs you, Working, Ready for PR) or a sparkle button "Ship PROJ-1377".
```

## 7. Tickets: Actions

Before (after spec 020's script, the second row starts `| Sparkle (Ship) |`):

```md
| Card title | Opens the session for that ticket if one exists, otherwise the ticket detail in a side panel |
| Sparkle (Build with Claude) | Creates a session with the ticket as context and its mapped repo, then opens it |
```

After:

```md
| Card title | Opens the ticket in a dialog, read from Jira: its fields, description, linked issues and last 20 comments, with Open in Jira, Add to composer, and Open session when it has one. The list view's titles, Home's Jira rows and ⌘K's tickets open the same dialog |
| Sparkle (Ship) | Adds the ticket to Home's composer, after any chips there, and opens Home with focus in the box; Send starts the session |
```

## 8. Agent sessions: what Send does

Before (after spec 020's script, the heading reads `**What happens when you click Ship or Send**`):

```md
**What happens when you click Build with Claude or Send**

1. DevHub creates a branch named after the ticket (`feat/PROJ-1423`) in a separate git worktree under `~/.devhub/worktrees/`. Your main checkout is never touched.
2. It builds the brief: your message, plus every context chip (ticket text, PR diff, Slack thread, files).
```

After:

```md
**What happens when you click Send**

1. DevHub creates a branch named after the first ticket (`feat/PROJ-1423`) in a separate git worktree under `~/.devhub/worktrees/`. Your main checkout is never touched.
2. It builds the brief: your message, plus every context chip (ticket text, PR diff, Slack thread, each file's path), then each skill your message names. Claude may read those files and the skills' folders where they are, and change none of them.
```
