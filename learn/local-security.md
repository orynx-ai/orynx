<!-- learn-sources: packages/core/src/plugins/local-only.ts apps/server/src/runtime-file.ts apps/web/vite.config.ts packages/api-client/src/client.ts packages/api-client/src/endpoints/repositories.ts packages/core/src/folder-picker/folder-picker.ts packages/core/src/routes/folder-picker.ts packages/api-client/src/endpoints/files.ts packages/core/src/routes/files.ts packages/core/src/files/file-paths.ts packages/core/src/skills/skills-reader.ts packages/core/src/routes/skills.ts packages/contracts/src/secret-names.ts packages/core/src/create-server.ts packages/core/src/agents/agent-environment.ts packages/core/src/agents/claude/claude-adapter.ts packages/core/src/agents/claude/tool-decision.ts packages/core/src/sessions/worktrees.ts packages/core/src/sessions/branch-git.ts packages/core/src/sessions/secret-files.ts packages/core/src/skills/skill-store.ts packages/core/src/routes/orynx-skills.ts -->

# Local security: why only this tab can call the server

DevHub's server runs on the developer's laptop and holds that person's Jira, GitHub and Slack access. Any web page the developer visits can try to send requests to `http://127.0.0.1:4317`. Three checks make sure only DevHub's own page gets answers.

## 1. Listen on 127.0.0.1 only

`apps/server` binds `127.0.0.1`, never `0.0.0.0`, so other machines on the network cannot reach the port at all.

## 2. A session token in the page

That alone is not enough: a page on `evil.example` running in the developer's browser is _on_ the laptop, and the browser will happily send it to `127.0.0.1:4317`. So every `/api` request must carry a secret that other pages cannot know.

1. On **every start**, `apps/server/src/runtime-file.ts` makes a fresh random token and writes `{ port, token, pid }` to `<DEVHUB_HOME>/runtime.json` (default `~/.devhub/runtime.json`) with file mode `0600`, so only the developer's user can read it.
2. The page receives the token in `<meta name="devhub-token">`:
   - `pnpm start`: the server injects it into `index.html` when it serves the page.
   - `pnpm dev`: Vite serves the page, so a small plugin in `apps/web/vite.config.ts` reads `runtime.json` and injects the same tag. Vite proxies `/api` to the server. It finds `DEVHUB_HOME` and the server's port the way the server does (the shell, then the repo-root `.env`), so it always reads the running server's file. From `.env` it keeps only those settings, never a token.
3. `packages/api-client/src/client.ts` reads nothing from the page itself; the host passes the token to `createApiClient({ baseURL, token })`, and the axios instance sends it as `x-devhub-token` on every request (`status()`, `sessions()`, the Jira and GitHub connection calls, Settings' preferences and folders, the inbox, Tickets' sprint, search's index, Claude's login and Check again, one session and its start, stop and discard (`session()`, `startSession()`, `stopSession()`, `discardSession()`, spec 011), and every endpoint added after them share that one instance, which waits up to 20 s, longer than the server's slowest check). Choose folder's request (spec 020) and File from this computer's (spec 022) alone set no time limit, because the server answers only once you've picked or pressed Cancel. When the server answers 401 (for example after it restarted with a new token), `onUnauthorized` lets the host reload the page to pick up the new one.
4. `EventSource` cannot set headers, so the event stream (`/api/events`) is the one route that accepts `?token=`.
5. `packages/core/src/plugins/local-only.ts` compares the token in constant time and answers 401 when it is missing or wrong, with words the page can show: "Orynx restarted or this page is out of date. Reload the page."
6. It decides whether a request is an `/api` request from the path the router matches, not only the raw URL. The router decodes `GET /%61pi/sessions` to `/api/sessions`, so a check on the raw text alone would let that request skip the token. The hook needs the token if the raw path, the decoded path or the matched route is under `/api`, and `create-server.test.ts` sends four such encodings.

**Why per start?** A token that never changes would live forever in old tabs, logs and screenshots. A new token on every start means a leaked one stops working the next time DevHub restarts, and stopping the server is always a full reset.

**Why can't another page read the token?** The browser's same-origin policy stops `evil.example` from reading the HTML of `http://127.0.0.1:4317`, so it cannot see the meta tag. Which leads to the third check.

**Request size.** Fastify refuses a body over 1 MiB on every route but one. `POST /api/sessions` takes up to 4 MiB, set when the composer's start (spec 015) carried five 100 KB files that JSON writes up to six times over. Since spec 022 a file goes as its path, so the most the composer sends is about 140 KB, well inside it. A body past a route's limit, or JSON Fastify can't read, is answered with Fastify's own 4xx status and `bad_request` (`create-server.ts`), never as a server error.

## 3. Check the Host header (DNS rebinding)

The same-origin policy compares _names_, not addresses. In a DNS-rebinding attack:

1. The developer opens `http://evil.example:4317`. The attacker's DNS first answers with the attacker's own server, which sends a page with a script.
2. The attacker then changes the DNS answer for `evil.example` to `127.0.0.1`.
3. The script fetches `http://evil.example:4317/`. The name is the same, so the browser treats it as same-origin, but the request now lands on **DevHub's** server, and the script could read the page and its token.

The browser still sends `Host: evil.example:4317`. So `local-only.ts` rejects (403) any request whose Host is not exactly `127.0.0.1:<port>` or `localhost:<port>`. The rebinding page never gets the HTML, so it never gets the token.

In dev, Vite's own `server.allowedHosts` check protects port 4318 the same way, and the proxy rewrites the Host it forwards to the server (`changeOrigin`).

## What this does not protect against

- Malware already running as the developer's user can read `runtime.json` and the keychain. That is outside DevHub's threat model.
- These checks are why there is no CORS configuration: no other origin is ever allowed to call the API.

## Where tokens for Jira, GitHub and Slack live

Not here. Those live in the OS keychain, are read only by `packages/core` (through `app.tokens`), and never reach the browser, a log line, an event or the inbox's `cache.db` (spec 007). The inbox routes (`/api/inbox`, its refresh and its cache) sit behind the same Host and session-token checks as every other `/api` route. See `learn/tokens-and-keychain.md`. The session token above only proves "this request came from DevHub's own page".

## The folder and file pickers (specs 020 and 022)

`POST /api/folder-picker` and `POST /api/file-picker` are the only routes that open a window on the computer. Settings' Choose folder and the composer's File from this computer ask the server to open the OS's own picker, because a browser never tells a page a folder's or a file's full path (`learn/settings-and-folders.md`, `learn/composer-and-context.md`). They're built to give a page that got past the checks above nothing to steer:

- **Only on your click.** Nothing in the server calls them on its own; the page sends one only when Choose folder or File from this computer is pressed.
- **Behind the same checks.** They're `/api` routes like any other, so the Host header and the session token are checked first.
- **A fixed command.** The programs and their arguments are written in `folder-picker.ts`: `osascript -e 'POSIX path of (choose folder)'`, `zenity` or `kdialog` for a folder; for files, `osascript -l JavaScript` with a fixed script, `zenity --file-selection --multiple` or `kdialog --getopenfilename --multiple`. The requests have no body, nothing the page sends reaches the command, and it runs through `execFile`, never a shell.
- **Found where gh is found.** `apps/server` looks for the program on the shell's `PATH`, never one written in `.env`, and only in absolute folders. Core's `createServer()` uses an empty search path when the host passes no picker, so no core test can open a real picker.
- **One at a time, and not forever.** A second request while one is open shares its answer, and a picker left open 10 minutes is killed.
- **Paths, whole.** Folder output that holds a line break inside it is refused rather than cut at the first line, so a folder planted with a newline in its name can't fill Folder with another, real folder. macOS's file picker answers JSON, so such a name stays one file; on Linux, where files come one a line, an answer with any line that isn't an absolute path is refused whole.
- **They read and save nothing.** A folder's answer is a path for the Folder field, and saving the folder checks it on disk as a typed path is checked. A file's answer is a path for a chip: the server never opens the file, and neither does the page. `POST /api/files/check`, for a typed path when no picker opens, only asks whether a file this process can read is there.

## Your skills' files (spec 023)

Settings › Skills writes files on the laptop, so the routes take nothing they could be steered with:

- **A folder name, never a path.** `/api/skills/orynx/:folder` takes only a name `SkillFolderSchema` allows (lowercase letters and digits joined by single hyphens), so `..`, `/` and capitals get 400 before the disk is touched. New names come from `folderFromName()`, which can't make anything else.
- **Inside `<DEVHUB_HOME>/plugin/skills` only.** Folders are 0700 and files 0600, written as a temporary file renamed into place. A link is skipped when listing and never written through or deleted through (`lstat`, not `stat`).
- **No skill text in the log.** Logs and events carry folder names and counts, never a Name, a description or instructions (spec 023, AC-28).

## What a Claude session can reach (specs 011 and 012)

A session runs Claude Code on the laptop, so it starts with as little as it needs. It gets only the allow-listed environment (`agents/agent-environment.ts`), so no `DEVHUB_*` variable, `.env` token or session token reaches it. It loads no settings files (`settingSources: []`), runs no hooks, and may use only Read, Glob, Grep, Edit, Write, NotebookEdit, TodoWrite and Bash. Every command runs in Claude Code's sandbox (spec 012): it can't read `runtime.json` or anything else under `DEVHUB_HOME` but its worktree, can't reach the network (Orynx on 127.0.0.1 included), so it can't call `/api` to approve its own request, and asks you before it runs unless the mode and the allow list let it. Every path a tool names is checked to stay inside the session's worktree, but for the reads below (spec 022). Reading its changes (spec 013) writes nothing: git runs with the index left alone (`diff.autoRefreshIndex=false`), hooks off and a time limit, the diff route reads only a path git lists as changed (so `../../runtime.json` is a 404), a new file is read only when it's a regular file inside the worktree, and the request log shows `?path=` as `[redacted]`. The git that makes, fetches and removes the worktree runs with the repository's hooks off (`core.hooksPath=/dev/null`) and no prompts (`GIT_TERMINAL_PROMPT=0`). See `learn/sessions-and-worktrees.md`.

## What Claude may read outside the worktree, and skills (spec 022)

The composer can name files from anywhere on the computer and skills from `.claude` folders. Each is a way out of the worktree, so each is as narrow as it can be:

- **Exactly what you named, read only.** At Send the server takes the real path of each file you picked (every symlink followed), and of each skill's folder or command's file your message names, and saves them as the session's `reads`. `tool-decision.ts` lets `Read`, `Glob` and `Grep` reach exactly those files and inside those folders, compared after following every symlink, as the worktree check is. An edit there, a file beside a picked one, a `..` route that ends elsewhere, or a folder whose name only starts the same stays refused. `reads` changes nothing for commands: the sandbox's rules stay as spec 012 set them.
- **No secrets.** A file whose name looks like a secret (`.env`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`) is refused by the contract (`contracts/src/secret-names.ts`), so it never reaches `reads`, whatever the page sends.
- **Orynx reads no file you pick.** The server only checks there's a file it can read there (`files/file-paths.ts`), at Send and for a typed path. Its contents go to Claude through Claude Code's own Read, never through Orynx, the brief, a log or an event.
- **Skills bring their words, nothing else.** `GET /api/skills` reads only the file names and the frontmatter (`name`, `description`, from the first 64 KB) under the folder's `.claude` and `~/.claude`, and writes nothing. Its `repositoryId` must be a folder Settings › Repositories holds, else 404, so a page can't point it at another folder. At Send a named skill's file (up to 256 KB) goes into the brief, as you named it. Claude Code still loads no settings (`settingSources: []`), hooks or MCP servers, so a skill's `allowed-tools`, hooks and allow rules never apply.
- **Nothing in the log.** A file's contents and a skill's text never reach a log line or an event: `sessions/no-leaks.test.ts` runs a start with both through the real hub at trace level.

## Pushing and opening a pull request (spec 014)

Create pull request is the one place Orynx writes outside your laptop for a session, so it waits for your press in its dialog, and nothing else starts it: not Claude finishing, a follow-up or a restart.

- **Behind the same checks.** The four routes (`/api/sessions/:id/pull-request/draft`, `/pull-request`, `/push/draft`, `/push`) are `/api` routes like any other, behind the Host header and the session token.
- **The draft reads nothing it shouldn't.** Claude drafts with no tools at all, in an empty temporary folder, and nothing of the call is saved. It gets the ticket as it was sent, Claude's summaries, the changed files and their diff, the PR template and the base's commit subjects: nothing from `DEVHUB_HOME`, the keychain or your other repositories.
- **Your own git login.** The push uses the SSH agent or credential helper your git already has, never asking for a password (`GIT_TERMINAL_PROMPT=0`), and the PR uses the GitHub connection's token through `client.ts`. Neither token reaches the page, the log or an event.
- **No hooks.** The commit and the push run with `core.hooksPath=/dev/null`: a hook would be a program from the worktree, which Claude can write, running outside the sandbox.
- **No secrets pushed.** A new file that looks like one (`.env`, `.env.*` other than `.env.example`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`) stops the commit before git writes anything.
- **git's words stay in the server.** They're read only to name a problem, then dropped, because an https remote's address can hold a password. The log names the session, the ticket, how it ended and the PR's number.
