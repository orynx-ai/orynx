<!-- learn-sources: packages/contracts/src/preferences.ts packages/contracts/src/repositories.ts packages/core/src/settings/settings-store.ts packages/core/src/preferences/preferences-service.ts packages/core/src/repositories/folder-check.ts packages/core/src/repositories/repository-service.ts packages/core/src/routes/preferences.ts packages/core/src/routes/repositories.ts packages/core/src/folder-picker/folder-picker.ts packages/core/src/routes/folder-picker.ts packages/core/src/test/fake-picker.ts packages/app/src/features/settings/queries.ts packages/app/src/features/settings/settings-screen.tsx packages/app/src/stores/ui-store.ts packages/app/src/features/settings/components/coding-agent-panel.tsx packages/app/src/features/settings/components/allowed-commands.tsx packages/contracts/src/commands.ts packages/app/src/features/settings/components/inbox-rules-panel.tsx packages/app/src/features/settings/components/repositories-panel.tsx packages/app/src/features/settings/components/repository-row.tsx packages/app/src/features/settings/components/folder-dialog.tsx packages/ui/src/components/combobox.tsx packages/app/src/features/settings/components/editor-choice.tsx -->

# Settings: how a change saves, and how a folder is checked

Spec 005 added three Settings tabs: Coding agent (what Claude may do without asking; spec 010 put the Claude and "More agents" cards above the modes, `learn/checking-claude.md`), Repositories (the folders Claude may work in, each with a Jira project) and Inbox rules (what counts as "needs you" on Home). None of them has a Save button. A change saves the moment you make it. Spec 020 put a folder's actions in a menu, opened adding and editing in a dialog, and let Choose folder open the computer's own folder picker.

## Where it lives

Everything goes in `<DEVHUB_HOME>/settings.json`, next to Jira's site and email and GitHub's way of connecting:

```json
{
  "agent": {
    "permissionMode": "edit_and_run_allowed",
    "allowedCommands": ["npm test", "npm run lint"],
    "editor": "cursor"
  },
  "inbox": { "rules": { "checks_failing": false } },
  "repositories": [{ "id": "3f9c0a6d2b1e4f57", "path": "/Users/dev/code/intranet-web", "jiraProject": "PROJ" }],
  "tickets": { "projectKey": "WEB", "sprintId": null }
}
```

- Only what you changed is written. A rule you never touched isn't in the file, and `PreferencesService.read()` fills it in from `defaultPreferences` in contracts. So when Slack's rule arrives in spec 016, it starts on for everyone without a migration.
- `settings-store.ts` keeps `agent`, `inbox`, `repositories` and `tickets` (the sprint Tickets shows, spec 020, `learn/the-tickets-board.md`) as they were written. The services take what they can read (`PermissionModeSchema.safeParse`, booleans only for rules, `SavedRepositorySchema` per folder, `TicketsChoiceSchema`) and keep everything else through every save. So a value a newer DevHub wrote, such as a new rule or a folder in a new shape, survives this version, and one bad value can't make Orynx treat the whole file as broken and forget Jira's settings next to it.
- A folder's name and its `~` path aren't stored. They're worked out on every read from the real path and the real home folder.

## One change, end to end

```
click a mode ─▶ useChangePreferences().mutate({ permissionMode })
                 │ onMutate: cancel a refetch on its way, show the new value in the cache at once
                 ▼
              PATCH /api/preferences { permissionMode }      only the field that changed
                 │
              PreferencesService.change ─▶ settings.update(…)   one change at a time, file 0600
                 │                     └─▶ events.publish({ type: 'settings.changed' })
                 ▼
              every open tab: LiveUpdates invalidates preferences and repositories
```

- **Instant, then confirmed.** The control moves before the server answers (spec 005: "the control shows the new value straight away"). If the save fails, `onError` takes back that change alone: each value it set goes back to what the server holds (the value from before the first change still on its way, moved forward each time one of them is saved), unless a later change has set it again. `SaveError` says so under the group until the next change.
- **Quick changes don't undo each other.** Each PATCH carries only what changed (`{ inboxRules: { checks_failing: false } }`), and the server applies changes one at a time. The client refetches only when the last pending change settles (`refetchAfterLast`), and `LiveUpdates` ignores `settings.changed` for data with a change still on its way, so neither an early answer nor an early event can flip a later change back on screen.
- **Delete works the same way.** Each folder ends in More actions (⋮), an `IconButton` named "More actions for intranet-web", kept to the row's end (`ms-auto`) when a narrow window wraps it onto a line of its own. Its menu holds Edit, Duplicate and Delete, whose line says "The folder stays on disk." There's no confirm step, since nothing on disk changes. The action runs once the menu has closed and let go of focus. `useRemoveRepository()` takes the row away at once and moves focus to the next row's More actions (or to Add local folder, whose plus is Hugeicons' `PlusSignIcon` through `<Icon>`, as every icon is since 18 Oct 2026). "Removed intranet-web." is said in the panel's polite live region once the server agrees. Each removal keeps its own outcome, so two quick removals each get theirs. A sentence leaves the live region only once it has been on screen: two answers that land together are said together ("Removed intranet-web. Removed mobile."), and an answer that lands just as you delete the next folder is still said. A failure puts back that row alone, at its place, and focus returns to its More actions unless you've moved on.
- **Adding and editing wait for the server**, because only the server can look at the disk. They're the next section.

## The folder dialog (spec 020)

Add local folder, Edit and Duplicate all open one dialog, `folder-dialog.tsx`, told what it's for by a `FolderTask`:

| Task        | Title                    | Filled in with                                             | Saves with                    |
| ----------- | ------------------------ | ---------------------------------------------------------- | ----------------------------- |
| `add`       | "Add a folder"           | nothing, or the ticket's project when Ship's menu opens it | `POST /api/repositories`      |
| `edit`      | "Edit intranet-web"      | the folder's path and Jira project                         | `PATCH /api/repositories/:id` |
| `duplicate` | "Duplicate intranet-web" | the folder's path and Jira project, as a new entry         | `POST /api/repositories`      |

- **Edit changes the folder in place.** `RepositoryService.update()` checks the new path exactly as `add()` checks a new one, keeps the folder's id and its place in the list, and publishes `settings.changed`. A folder another tab removed first answers 404 ("This folder is no longer in the list."). `useEditRepository()` puts the server's answer in the cache, then refetches after the last change.
- **One folder, two projects.** A repository can serve two Jira projects, so the same folder may be listed again with another project. The same folder with the same project is refused: "This folder is already in the list for PROJ." (`refuseTwice()` in `repository-service.ts`, spec 020 Q3). That's what makes Duplicate useful.
- **The dialog stays open while a save is on its way.** Escape, a click outside and Cancel do nothing then (Cancel stays focusable), so the server's answer always has a place to show. A refused folder puts its reason under Folder and focus in it; any other failure shows one line over the buttons. Once saved, the dialog closes and focus goes back to what opened it: Add local folder, or the folder's More actions.
- **Actions sit at the dialog's end**, Cancel first and the primary action last ("Add folder" or "Save changes"), as Discard changes draws them (the user's call, 18 Oct 2026).
- Each task gets a fresh form (a `key` per task), so a closed dialog never leaves its values behind. The form is react-hook-form with `addFolderFormSchema`.

## Choose folder: the computer's own picker (spec 020)

A browser never tells a page a folder's full path, so a file input can't fill Folder. Choose folder asks the local server instead: `POST /api/folder-picker`. The server opens the OS's own picker, waits for you, and answers the path with `~` for your home folder (`displayPath`), or null when you pressed Cancel. The path fills Folder as typed text, and the server still checks it when you save. Cancel leaves Folder as it was.

`folder-picker.ts` tries each picker the OS has, in order:

| OS    | Program     | Command                                                                   |
| ----- | ----------- | ------------------------------------------------------------------------- |
| macOS | `osascript` | `-e 'POSIX path of (choose folder)'`; Cancel says "User canceled. (-128)" |
| Linux | `zenity`    | `--file-selection --directory`; Cancel is exit 1, GTK's notes aside       |
| Linux | `kdialog`   | `--getexistingdirectory`                                                  |

- **It finds the program on the host's search path.** `apps/server` passes the shell's `PATH`, as it does for gh. Only absolute folders are searched, and the file must be a program it may run. Left out, as in core's tests, the search path is empty, so no test can open a real picker on the screen.
- **A fixed command.** The program and its arguments are written in the file. Nothing the page sends reaches them, and the request has no body. It runs through `execFile`, never a shell.
- **One at a time.** A second press while the picker is open waits for the same answer. A picker left open for 10 minutes is killed and counts as Cancel. Its output must be one full path: a folder whose name holds a line break is refused, never cut down to another folder. On Linux, a Cancel is exit 1 with nothing on stderr but GTK's own notes (`Gtk-Message`, `Gtk-WARNING`), which zenity often writes.
- **Windows has none yet.** A folder's path in Orynx starts with `/` or `~` (`RepositoryPathSchema`), which a Windows path never does, so on Windows the button says no picker can open.
- **When none can open** (Linux without zenity or kdialog, no screen, or a picker that fails with words on stderr), the server answers 503 `picker_unavailable`, and the dialog says "Orynx can't open a folder picker on this computer. Type the folder's path instead." Folder still takes a typed path.

Security notes for the picker are in `learn/local-security.md`. The e2e run puts fake pickers that always cancel in `e2e/fake-gh/`, first on every hub's `PATH`, so no run can open a real dialog.

## The allow list (spec 012)

Under the modes, Coding agent shows "Allowed commands": the commands that run without asking in "Edit files and run allowed commands". It shows in every mode, so you can fill it before you switch. An entry is one command, read by contracts' `AllowedCommandSchema`, the same reading a session uses (`readCommand` in `commands.ts`): words a single space apart, no `&&`, `;` or `|`, and nothing that always asks (`git push`, `curl …`, a delete outside the worktree). The Add form refuses those, and an entry already on the list, with the line that says why, before anything is sent.

Adding and removing send one entry each (`{ allowCommand }`, `{ disallowCommand }`), so two quick changes can't undo each other, and both show at once through `useChangePreferences`; a failed one is taken back alone, at its place. Remove moves focus to the next row's Remove, or to the field. Always allow in a session's callout adds through the same service, and `settings.changed` brings it to every open tab.

## The editor (spec 013)

Coding agent ends with "Editor": VS Code or Cursor, two choice cards built like Appearance's, VS Code by default. It's where the Session screen's Open in opens a session's worktree, as a `vscode://file/…` or `cursor://file/…` link, so Orynx never runs the editor itself. A pick sends `{ editor }` and shows at once through `useChangePreferences`; a failed save shows `SaveError` and puts the old pick back. `settings.changed` turns every open Session screen's button into "Open in Cursor" with no reload. The arrow keys move between the two, as native radios do. An `editor` the file holds but this version doesn't know reads as VS Code and is kept until you pick.

## Clear cache

The Inbox rules tab ends with Clear cache (spec 002 Q3, spec 007 Q7): a line on what the cache is for and a small secondary button. `useClearInboxCache()` sends `DELETE /api/inbox/cache`; the server empties `cache.db` (never tokens, settings, sessions or worktrees), says `inbox.changed` and syncs again, so the mutation touches no cached query. The button is described by the line above it (`aria-describedby`), shows its spinner while the request is on its way, and a screen reader then hears "Cache cleared." from a status region that is there from the start; a failure says so under the button. See `learn/the-inbox.md`.

## The local-first note

"Everything stays on this computer" sits above the tabs. Its close button ("Hide this note", an `IconButton` inside `Callout`) hides it for good in this browser (spec 020). The choice is a UI-only preference, `localFirstNoteHidden` in the persisted ui store (`devhub.ui`, next to the sidebar's width), so it is never sent to the server. Another browser, or one whose site data was cleared, shows it once more. The button goes with the note, so focus moves to the open tab first.

## How a folder is checked

`folder-check.ts` takes the typed path and uses the file system only. It never runs git or a script in the folder, because a repository's own config can make git run commands.

1. Empty, holding a line break or NUL, or not a full path (`/…`, `~` or `~/…`; `~someone` isn't supported): refused before the disk is read.
2. `realpath` resolves `~`, `..` and symlinks. Nothing there, a file in the middle of the path, a symlink loop or a name too long for the disk: "Nothing is at this path."
3. A file: "This is a file. Pick its folder."
4. Inside DevHub's own folder, where the session worktrees live: refused. This compares the folders' identities on disk (device and inode) up the path, not their spelling: macOS reaches every folder under `/private` also through `/System/Volumes/Data/…`, and `realpath` keeps whichever spelling it was given.
5. Can't read it: "Orynx can't read this folder."
6. Holds `.git` (a folder in a clone, a file in a worktree): accepted, saved as the real path.
7. Otherwise Orynx walks up the parents. A `.git` above means "inside the repository at ~/code/x", which names the folder to add instead. No `.git` anywhere means "not a git repository".

An edited folder goes through the same steps. The "already in the list" check and the 100-folder limit run inside `settings.update`, so two tabs adding the same folder for the same project at once can't both win. The same folder is also found by identity on disk, so a symlink or a second spelling of a folder already in the list counts as that folder; that comparison runs just before the save, so two tabs adding one folder under two spellings in the same instant could both succeed.

The dialog checks the first two cases itself with `RepositoryPathSchema`, the same schema the route validates with. The server's answer for the rest is `422 folder_rejected`, and the dialog puts its message under Folder.

## The Jira project field

The field is a `Combobox` from `@devhub/ui` (spec 020): drawn like Select, it opens a list with a search box. Typing narrows the projects by key or name, ↓ and ↑ move, Enter picks, and Escape closes. "No Jira project" is always first. The list opens on the pick, and stays on it when the projects arrive after it opened, until you move or type. Its listbox holds options alone, as ARIA asks: the loading rows (with the listbox `aria-busy`) and "No projects match" sit beside it. When the dialog opens with Jira connected, it asks `GET /api/jira/projects` (see `learn/connecting-jira.md`). The query is never cached (`gcTime: 0`, `staleTime: 0`), so the list lives only while something on screen needs it: this dialog, or Tickets' Project picker. Not connected: the field is off and its help says how to connect. The list failed: the field is off on "No Jira project", and the folder can still be added. A folder's own project is offered even before the list arrives, so editing one never shows it blank.

## The loading look

While a tab's values load, it draws its real controls with nothing picked and turned off: three radios, five checkboxes, or the Repositories header with the list's frame one row tall below it. Nothing above the list moves when the values arrive, and the radios and checkboxes keep their exact shape. The e2e run measures this (CLS 0 on each tab).

## Testing

- `folder-check.test.ts` and `repository-service.test.ts` build real folders under the OS's temporary folder, behind its `/var` → `/private/var` symlink on macOS: a clone, a worktree, a plain folder, a file, a symlink, a locked folder, DevHub's own folder.
- `folder-picker.test.ts` never opens a real picker. `test/fake-picker.ts` puts real programs named `osascript`, `zenity` or `kdialog` in a temporary folder, all links to one shell script (`test/fake-picker/picker`) that logs how it was run and picks, cancels, fails or hangs as the test says. The picker finds and starts them as it would the real ones.
- Route tests use `createServer({ userHome, dataDir })` with a temporary home. Left out, both default to the OS's home folder and `~/.devhub`.
- The app tests render the real app with MSW standing in for the server, and hold answers back to prove the change shows before the save returns.
- `e2e/settings.spec.ts` drives the real server at 360 and 1280 px. The desktop and phone runs share one `settings.json`, so each test changes only what it owns: its own folder, its own rule, and the mode on desktop alone.
