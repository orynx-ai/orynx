<!-- learn-sources: packages/contracts/src/preferences.ts packages/contracts/src/repositories.ts packages/core/src/settings/settings-store.ts packages/core/src/preferences/preferences-service.ts packages/core/src/repositories/folder-check.ts packages/core/src/repositories/repository-service.ts packages/core/src/routes/preferences.ts packages/core/src/routes/repositories.ts packages/app/src/features/settings/queries.ts packages/app/src/features/settings/components/coding-agent-panel.tsx packages/app/src/features/settings/components/inbox-rules-panel.tsx packages/app/src/features/settings/components/repositories-panel.tsx packages/app/src/features/settings/components/add-folder-form.tsx -->

# Settings: how a change saves, and how a folder is checked

Spec 005 added three Settings tabs: Coding agent (what Claude may do without asking), Repositories (the folders Claude may work in, each with a Jira project) and Inbox rules (what counts as "needs you" on Home). None of them has a Save button. A change saves the moment you make it.

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
- `settings-store.ts` reads each new key leniently. A value this version can't read counts as never chosen (`.catch(undefined)`), and a folder it can't read is skipped. One bad key can't make DevHub treat the whole file as broken and forget Jira's settings next to it.
- Rule names this version doesn't know are kept when it saves, so a newer DevHub's rules survive an older one.
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

- **Instant, then confirmed.** The control moves before the server answers (spec 005: "the control shows the new value straight away"). If the save fails, `onError` puts back what was there, and `SaveError` says so under the group until the next change.
- **Quick changes don't undo each other.** Each PATCH carries only what changed (`{ inboxRules: { checks_failing: false } }`), and the server applies changes one at a time. The client refetches only when the last pending change settles (`isMutating(…) === 1`), so an early answer can't flip a later change back on screen.
- **Remove works the same way.** `useRemoveRepository()` takes the row away at once, moves focus to the next row's Remove (or to Add local folder), and says "Removed intranet-web." in the panel's polite live region. A failure brings the row back.
- **Add waits for the server**, because only the server can look at the disk. The new row goes into the cache from the answer, and `settings.changed` confirms it.

## How a folder is checked

`folder-check.ts` takes the typed path and uses the file system only. It never runs git or a script in the folder, because a repository's own config can make git run commands.

1. Empty, holding a line break or NUL, or not a full path (`/…`, `~` or `~/…`; `~someone` isn't supported): refused before the disk is read.
2. `realpath` resolves `~`, `..` and symlinks. Nothing there, or a file in the middle of the path: "Nothing is at this path."
3. A file: "This is a file. Pick its folder."
4. Inside DevHub's own folder, where the session worktrees live: refused.
5. Can't read it: "DevHub can't read this folder."
6. Holds `.git` (a folder in a clone, a file in a worktree): accepted, saved as the real path.
7. Otherwise DevHub walks up the parents. A `.git` above means "inside the repository at ~/code/x", which names the folder to add instead. No `.git` anywhere means "not a git repository".

The duplicate check and the 100-folder limit run inside `settings.update`, so two tabs adding the same folder at once can't both win. Comparing real paths means a symlink to a folder already in the list counts as a duplicate.

The form checks the first two cases itself with `RepositoryPathSchema`, the same schema the route validates with. The server's answer for the rest is `422 folder_rejected`, and the form puts its message under Folder.

## The Jira project field

When the form opens with Jira connected, it asks `GET /api/jira/projects` (see `learn/connecting-jira.md`). The query is never cached (`gcTime: 0`, `staleTime: 0`), so the list lives only while the form is open. Not connected: the field is off and says how to connect. The list failed: only "No Jira project" is offered, and the folder can still be added.

## The loading look

While a tab's values load, it draws its real controls with nothing picked and turned off: three radios, five checkboxes, or the Repositories header with an empty space below. The loaded tab has the same shape, so nothing moves when the values arrive. The e2e run measures this (CLS 0 on each tab).

## Testing

- `folder-check.test.ts` and `repository-service.test.ts` build real folders under the OS's temporary folder, behind its `/var` → `/private/var` symlink on macOS: a clone, a worktree, a plain folder, a file, a symlink, a locked folder, DevHub's own folder.
- Route tests use `createServer({ userHome, dataDir })` with a temporary home. Left out, both default to the OS's home folder and `~/.devhub`.
- The app tests render the real app with MSW standing in for the server, and hold answers back to prove the change shows before the save returns.
- `e2e/settings.spec.ts` drives the real server at 360 and 1280 px. The desktop and phone runs share one `settings.json`, so each test changes only what it owns: its own folder, its own rule, and the mode on desktop alone.
