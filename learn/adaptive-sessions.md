<!-- learn-sources: packages/core/src/sessions/ask-reading.ts packages/core/src/sessions/branch-rules.ts packages/core/src/sessions/session-tools.ts packages/core/src/sessions/progress.ts packages/core/src/sessions/worktrees.ts packages/core/src/sessions/session-service.ts packages/core/src/ports/port-service.ts packages/core/src/ports/listeners.ts packages/core/src/terminal/terminal-service.ts packages/contracts/src/session.ts packages/contracts/src/ports.ts packages/app/src/features/sessions/components/ports-panel.tsx packages/app/src/features/sessions/components/session-details.tsx packages/ui/src/components/stepper.tsx e2e/fake-claude/session.ts -->

# Adaptive sessions: read the ask, name the branch, follow the work, show the ports

A Build session used to make `feat/<first five words>` and show the same five steps whatever you asked. Since spec 042, Orynx reads your ask first, makes a branch only when Claude edits, shows the steps Claude names, and lists the servers the session runs. It came from asking Orynx to "take a pull from latest develop and start the server": a branch nobody needed, Build and Test shown as skipped, and a server hidden in Python's `Popen`.

## The path of one start

```
POST /api/sessions                       (a Build; an Ask skips all of this)
  └─ session-service.ts run()
       ├─ readAsk()                      a "Reading your ask…" row
       │    ├─ worktrees.hints()         default base, origin's branch names, your 20 newest branches
       │    ├─ readBranchRules()         CLAUDE.md, AGENTS.md, CONTRIBUTING.md, skills: only the parts about branch names
       │    └─ adapter.write()           the composer's model, no tools, 30 s; readingFrom() checks every field
       ├─ worktrees.prepare()            the first free name; one you named on origin keeps its name
       ├─ worktrees.make(detach)         the worktree at the base, no branch; branchPlan keeps the name
       └─ startClaude()                  onEdit → makeBranch(), and the orynx tools: set_steps, start_server, stop_server
```

A read that fails, is slow or answers anything but the JSON asked for gives a "Couldn't read your ask" row and today's five steps. Nothing about it blocks a session.

## Branch names

First match wins: a name in your message; the repository's written rules; the shape of your own recent branches; then `feat/`, `fix/` or `chore/` and a few words. A ticket's key is always in it (acme-app's commit hook reads it from the branch). `usableBranch()` keeps out what git would refuse and anything over 60 characters; Orynx's own name takes its place, and the reading says so.

## Steps

`Session.steps` is a list of `{ kind, label }`: Claude's words, a kind Orynx moves by. An older session has none, and `stepsOf()` gives it the five it always had. `progress.ts` moves the stepper by kind in the session's own order (an edit to its `build`, a command before any edit to its `setup`, a listening port to its `run`, finishing to `review`, `answer` or the last step before a pull request). `changeSteps()` takes Claude's `set_steps` only whole and within the rules.

## Servers and ports

`start_server` asks you first, then `terminal-service.addServerTab()` runs it in a tab named after it, and the session waits up to 60 s for a port under that tab's shell. `port-service.ts` reads `lsof -iTCP -sTCP:LISTEN`, `lsof -d cwd` and `ps`, and keeps a port only when its process runs under one of the session's tabs or from inside its worktree; it asks each new server once whether it answers HTTPS, then HTTP. Stop reads them again and signals only what's still the session's: SIGTERM to it and its children, SIGKILL after 5 s. Delete stops them all before the worktree goes.

The Ports tab (`ports-panel.tsx`) asks every 3 s while open and 15 s for its count, never while the page is hidden. A run session opens on it; any other on Changes.

## Testing it

The quick read is answered by `fakeClaudeSdk`'s `reads` queue, so session scripts stay in order; the e2e fake answers any prompt that starts with "The ask:". Port tests start real servers and read real `lsof`, as the worktree tests use real git.
