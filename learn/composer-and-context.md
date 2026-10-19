<!-- learn-sources: packages/core/src/sessions/pull-request-text.ts packages/core/src/sessions/pull-requests.ts packages/contracts/src/session.ts packages/core/src/sessions/compose.ts packages/core/src/sessions/context-reader.ts packages/core/src/sessions/composer-names.ts packages/core/src/sessions/brief.ts packages/core/src/sessions/session-service.ts packages/core/src/routes/sessions.ts packages/core/src/integrations/jira/client.ts packages/core/src/integrations/github/client.ts packages/ui/src/components/context-picker.tsx packages/app/src/features/home/components/home-composer.tsx packages/app/src/features/home/components/add-context.tsx packages/app/src/features/home/components/folder-picker.tsx packages/app/src/features/home/components/agent-picker.tsx packages/app/src/features/home/components/waiting-banner.tsx packages/app/src/features/home/components/quick-starts.tsx packages/app/src/features/home/composer-rules.ts packages/app/src/features/home/composer-words.ts packages/app/src/features/home/store.ts e2e/composer.spec.ts -->

# The composer: your words and context, as Claude's brief

Home's composer starts a Claude session from what you type, without a ticket if you like. You can add context with the + button: a folder, a Jira ticket, a pull request or a text file. What Claude gets is exactly what the composer shows: your message, then each chip in the order you added it, and nothing else. Spec 015 built it, beside 011's Ship, which still starts Claude on a ticket in one click.

## The path of one Send

```
HomeComposer                                        (the page: features/home/components/home-composer.tsx)
  └─ POST /api/sessions { message, repositoryId?, context: [jira | pull_request | file] }   up to 4 MiB
       └─ session-service.ts start() → composeNow()   checks before anything exists:
            a live session on the ticket chip? → existing; the page says so, with Open session (Q9)
            Claude Code signed in?  fewer than 3 working?  the folder (compose.ts chooseFolder, Q7)?
            context-reader.ts: every chip at once
              jira          client.issueContext()   GET /rest/api/3/issue/{key} with comments and links
              pull_request  client.pullContext()    one GraphQL query: title, body, branches, failed
                                                    checks, unresolved threads, changed files
                            client.pullDiff()       GET /repos/{o}/{r}/pulls/{n} as a diff; 406 = too large
              file          as the browser read it
            a chip that failed → context_failed { chip, problem }; nothing is created
            compose.ts composerPlan(): the title, the branch name, the brief, the brief step
       ← started { sessionId }; the page clears its draft and opens /sessions/<id>
       └─ run() takes that plan from memory instead of reading the ticket (Ship's path), then as 011:
            the worktree on feat/<KEY> or feat/<slug>, brief.md, the brief step, Claude
```

## What the brief holds

`brief.ts` `composerBrief()` writes your message first, then each chip under its own title:

| Chip         | Title                                                             | Body                                                                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jira ticket  | `Jira ticket PROJ-1423 (Story): Add bulk archive`                 | The description as Markdown, then `## Comments` (the last 20) and `## Linked issues`                                                                                                                           |
| Pull request | `Pull request acme/web-app #2836: Lazy-load the people directory` | The branches, the description, `## Failing checks`, `## Unresolved review comments`, then `## Diff`: the first 2,000 lines, then every file's counts; or the counts alone when GitHub finds the diff too large |
| File         | `File notes.md`                                                   | Its text, as it is                                                                                                                                                                                             |

The same text is saved as the session's `brief.md` (0600). Claude's note says "Make the change the ticket asks for." only when the ticket alone is the brief. With your own words, it says "Do what the user asks in the brief." (Q8c). A follow-up keeps whichever the brief step shows.

A session with no ticket gets its title from your message's first line (80 characters, cut on a word), and its branch from the title's first five words in lower-case ASCII (`feat/add-a-csv-export-to`, or `feat/task` when nothing is left). Its `source` is null, so the Session screen says Sessions / its title and has no Ticket tab, and its inbox row leads with Orynx's own mark (`SourceMark source="orynx"`). Its pull request (spec 014) has no key in front of its title and no Jira line: `pull-requests.ts` gives such a session no ticket key, so the draft's prompt says "The task, as Claude got it", `draftInstructionsFor()` asks Claude for no key, and when Claude can't draft, the title is the session's own (AC-34).

## Limits, and why the route takes 4 MiB

`ComposerStartSchema` takes a message of at most 10,000 characters, 1 ticket (Q2: a second one replaces the first), 3 pull requests and 5 files of at most 100 KB of UTF-8 each. The page checks the same limits before it sends. A file is text when it decodes as UTF-8 and has no NUL byte (`composer-rules.ts` `fileChipFrom()`). JSON writes a control character six times over (`\u001b`, as in a coloured log), so five full files can take about 3 MB. `POST /api/sessions` is the one route with a 4 MiB body limit, and Fastify's own refusals, such as a 413 past it, are answered with their status rather than 500.

## On Home

- **The draft** lives in `features/home/store.ts` (zustand): the text, the chips in order, and the folder you picked. Leaving Home keeps it, and a reload or a sent task clears it. Only the last folder a task started in is kept on this computer (`devhub.home`). The text box is react-hook-form, and its value is mirrored into the store, as 013's follow-up box does.
- **+ Add context** is `@devhub/ui`'s `ContextPicker`: one Radix Popover. Its first view is a menu of kinds (arrow keys move between them, and Esc returns focus to +). Picking a kind shows that kind's list in the same popup, with Back, a count, a search box that is the ARIA combobox, and a note on what Claude gets. The Jira and Pull request lists filter 009's search index in the browser, so typing never asks the server. A key or pull request link the list doesn't hold shows as "Add PROJ-9999". Picking closes the popup and puts focus back in the box. File from this computer clicks a hidden `<input type="file" multiple>`, and the browser reads each file.
- **Pasting** exactly one Jira key or one github.com pull request link adds its chip instead of the text (Q6). Any other paste is pasted as text.
- **The folder picker** follows Q7: your pick, else the ticket project's only folder, else the folder you last used, else the only folder. Several folders for the project read "Choose folder", and none at all reads "Add a folder", which opens Settings' folder dialog. **The agent picker** shows Claude and whether it's signed in. Both pickers appear together, once both have loaded, in a row that is there from the first paint (their own row under 640 px), so the box never grows or moves while Home loads (AC-1).
- **The waiting banner** reads the session list and shows the `needs_you` session that has waited longest, with its first waiting call ("wants to run npm test") and how many more wait. `sessions.changed` keeps it live.
- **The quick starts** are Pick up a ticket (Tickets) and Review a pull request (the list's Pull requests tab, with focus on that tab). Fix failing checks and Draft a Slack reply wait for their own specs (Q12), as does Slack thread in the + menu.
- **New task** (⌥⌘N, or Ctrl+Alt+N elsewhere) opens Home with focus in the composer box (`shell/main-content.ts` `focusNewTask()`).

## Tests

`compose.test.ts` drives the real session service with real git repositories, Jira and GitHub faked by MSW, and the fake Claude SDK. It covers each refusal that makes nothing, and real starts with and without a ticket. `context-reader.test.ts` reads each chip through the real clients and connections. `no-leaks.test.ts` runs a composer start through the real hub at trace level, and none of the message, file text, description, comment, diff or tokens reaches a log line or an event. `e2e/composer.spec.ts` runs on its own hub (4388), where the fake Claude Code writes the brief it got to `last-brief.txt` in its folder, so the spec reads back exactly what Claude saw.
