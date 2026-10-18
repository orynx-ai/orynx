<!-- learn-sources: packages/contracts/src/preferences.ts packages/contracts/src/repositories.ts packages/core/src/settings/settings-store.ts packages/core/src/preferences/preferences-service.ts packages/core/src/repositories/folder-check.ts packages/core/src/repositories/repository-service.ts packages/core/src/routes/preferences.ts packages/core/src/routes/repositories.ts packages/app/src/features/settings/queries.ts packages/app/src/features/settings/components/coding-agent-panel.tsx packages/app/src/features/settings/components/inbox-rules-panel.tsx packages/app/src/features/settings/components/repositories-panel.tsx packages/app/src/features/settings/components/add-folder-form.tsx -->

# Settings: how a change saves, and how a folder is checked

Spec 005 added three Settings tabs: Coding agent (what Claude may do without asking; spec 010 put the Claude and "More agents" cards above the modes, `learn/checking-claude.md`), Repositories (the folders Claude may work in, each with a Jira project) and Inbox rules (what counts as "needs you" on Home). None of them has a Save button. A change saves the moment you make it.

## Where it lives

Everything goes in `<DEVHUB_HOME>/settings.json`, next to Jira's site and email and GitHub's way of connecting:

```json
{
  "agent": { "permissionMode": "ask_everything" },
  "inbox": { "rules": { "checks_failing": false } },
  "repositories": [{ "id": "3f9c0a6d2b1e4f57", "path": "/Users/dev/code/intranet-web", "jiraProject": "PROJ" }]
}
```

- Only what you changed is written. A rule you never touched isn't in the file, and `PreferencesService.read()` fills it in from `defaultPreferences` in contracts. So when Slack's rule arrives in spec 016, it starts on for everyone without a migration.
- `settings-store.ts` keeps `agent`, `inbox` and `repositories` as they were written. The services take what they can read (`PermissionModeSchema.safeParse`, booleans only for rules, `SavedRepositorySchema` per folder) and keep everything else through every save. So a value a newer DevHub wrote, such as a new rule or a folder in a new shape, survives this version, and one bad value can't make DevHub treat the whole file as broken and forget Jira's settings next to it.
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
- **Remove works the same way.** `useRemoveRepository()` takes the row away at once and moves focus to the next row's Remove (or to Add local folder, whose plus is Hugeicons' `PlusSignIcon` through `<Icon>`, as every icon is since 18 Oct 2026). "Removed intranet-web." is said in the panel's polite live region once the server agrees. Each removal keeps its own outcome, so two quick removals each get theirs. A failure puts back that row alone, at its place, and focus returns to its Remove unless you've moved on. A held-down Enter removes one folder, not one after another.
- **Add waits for the server**, because only the server can look at the disk. The new row goes into the cache from the answer, and the list refetches after. While a folder is on its way, Add local folder can't close the form, so the answer always has a place to show.

## Clear cache

The Inbox rules tab ends with Clear cache (spec 002 Q3, spec 007 Q7): a line on what the cache is for and a small secondary button. `useClearInboxCache()` sends `DELETE /api/inbox/cache`; the server empties `cache.db` (never tokens, settings, sessions or worktrees), says `inbox.changed` and syncs again, so the mutation touches no cached query. The button is described by the line above it (`aria-describedby`), shows its spinner while the request is on its way, and a screen reader then hears "Cache cleared." from a status region that is there from the start; a failure says so under the button. See `learn/the-inbox.md`.

## How a folder is checked

`folder-check.ts` takes the typed path and uses the file system only. It never runs git or a script in the folder, because a repository's own config can make git run commands.

1. Empty, holding a line break or NUL, or not a full path (`/…`, `~` or `~/…`; `~someone` isn't supported): refused before the disk is read.
2. `realpath` resolves `~`, `..` and symlinks. Nothing there, a file in the middle of the path, a symlink loop or a name too long for the disk: "Nothing is at this path."
3. A file: "This is a file. Pick its folder."
4. Inside DevHub's own folder, where the session worktrees live: refused. This compares the folders' identities on disk (device and inode) up the path, not their spelling: macOS reaches every folder under `/private` also through `/System/Volumes/Data/…`, and `realpath` keeps whichever spelling it was given.
5. Can't read it: "Orynx can't read this folder."
6. Holds `.git` (a folder in a clone, a file in a worktree): accepted, saved as the real path.
7. Otherwise DevHub walks up the parents. A `.git` above means "inside the repository at ~/code/x", which names the folder to add instead. No `.git` anywhere means "not a git repository".

The same-path check and the 100-folder limit run inside `settings.update`, so two tabs adding the same folder at once can't both win. Duplicates are also found by identity on disk, so a symlink or a second spelling of a folder already in the list counts as the same folder; that comparison runs just before the save, so two tabs adding one folder under two spellings in the same instant could both succeed.

The form checks the first two cases itself with `RepositoryPathSchema`, the same schema the route validates with. The server's answer for the rest is `422 folder_rejected`, and the form puts its message under Folder.

## The Jira project field

When the form opens with Jira connected, it asks `GET /api/jira/projects` (see `learn/connecting-jira.md`). The query is never cached (`gcTime: 0`, `staleTime: 0`), so the list lives only while the form is open. Not connected: the field is off and says how to connect. The list failed: only "No Jira project" is offered, and the folder can still be added.

## The loading look

While a tab's values load, it draws its real controls with nothing picked and turned off: three radios, five checkboxes, or the Repositories header with the list's frame one row tall below it. Nothing above the list moves when the values arrive, and the radios and checkboxes keep their exact shape. The e2e run measures this (CLS 0 on each tab).

## Testing

- `folder-check.test.ts` and `repository-service.test.ts` build real folders under the OS's temporary folder, behind its `/var` → `/private/var` symlink on macOS: a clone, a worktree, a plain folder, a file, a symlink, a locked folder, DevHub's own folder.
- Route tests use `createServer({ userHome, dataDir })` with a temporary home. Left out, both default to the OS's home folder and `~/.devhub`.
- The app tests render the real app with MSW standing in for the server, and hold answers back to prove the change shows before the save returns.
- `e2e/settings.spec.ts` drives the real server at 360 and 1280 px. The desktop and phone runs share one `settings.json`, so each test changes only what it owns: its own folder, its own rule, and the mode on desktop alone.
