# Real terminal

Status: approved
Roadmap: not on the roadmap. The user's ask, 20 Oct 2026, after spec 036 shipped: "there are so many issues in terminal UI and functionality … the terminal should appear in … menu, only show one icon, left one. Unable to scroll in terminal, input area is too small, stdin stdout not working … it must be a fully functional terminal, also no cross icon to close terminal." It takes 038, the next free number (037 is Orynx tickets). The branch is `feat/038-real-terminal` in `../dev-hub-038`, from `origin/main` at PR #48.

## Goal

Your shell tabs in a session's Terminal are a real terminal, not one block per command. You type into your shell as in any terminal, programs that read the keyboard work, and the output scrolls. Terminal opens from the session's More actions menu, and the dialog closes with an × button.

## Assumptions

- Everything spec 036 says about the Terminal still holds, except what the open questions below change: who sees it (a Build session with a worktree, not on Windows), the Claude tab, five shell tabs, and that it runs as you outside Claude's sandbox.
- The header's Back to session button becomes an × icon button named "Close terminal". Esc closes the Terminal, except when your shell has focus: there Esc belongs to the shell (vim, a prompt). Focus goes back to More actions.
- Words nobody gave: "Close terminal" for the × button, and "Your shell ended. Press any key to start a new one." when the first tab's shell exits.

## Acceptance criteria

| ID   | Given                             | When                                                            | Then                                                                                                                                                           |
| ---- | --------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | A Build session with a worktree   | I pick Terminal in More actions, or press `` ⌃` ``              | The dialog opens on my shell: my login shell in the worktree, with `TERM=xterm-256color` and none of Orynx's settings, and it has focus                        |
| AC-2 | AC-1                              | I type a command that reads input, then my answer; or press Esc | The command gets what I typed; Esc goes to the shell and the dialog stays open                                                                                 |
| AC-3 | A command runs                    | I press ⌃C                                                      | It stops and the shell carries on. A `cd` carries over to the next command                                                                                     |
| AC-4 | AC-1                              | The dialog or the window changes size                           | The shell is told its new size in characters, so full-screen programs draw to fit                                                                              |
| AC-5 | Long output                       | I scroll up, or close and open the Terminal                     | I can scroll back through it, and the same screen comes back: the tab keeps its last 500,000 characters and draws them again                                   |
| AC-6 | AC-1                              | I press +, or Close on a tab                                    | + opens another shell, picked and focused, up to 5 (then + says why it does nothing); Close ends that shell and picks the tab before it. The first can't close |
| AC-7 | A shell tab                       | I type `exit`                                                   | The tab closes; in the first tab, the screen says the shell ended, and my next key starts a new one                                                            |
| AC-8 | The worktree isn't there any more | I open a shell tab                                              | No shell starts, and the tab says "Couldn't run this. The worktree isn't there any more."                                                                      |

## Out of scope

- Copy on ⌃C with text selected: ⌘C copies on a Mac, and ⌃C is the shell's, as in other terminals.
- Flow control for a flood of output (`yes`): ⌃C stops it, and the page catches up.
- Keeping shells across an Orynx restart.

## Open questions

| #   | Who decides | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Answer                                    |
| --- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Q1  | Product     | **What kind of terminal** (reverses spec 036 Q2). Recommended: a real one, with xterm.js in the page and a pseudo-terminal from node-pty on the server. That is three new dependencies: `@xterm/xterm`, `@xterm/addon-fit` and `@lydell/node-pty`, whose prebuilt Node-API binaries for macOS and Linux need no install script and load in Electron as built. Shell tabs lose their blocks, Rerun, Clear output and Ask Claude to fix; the Claude tab keeps its blocks. The other choice: keep the blocks and pass what you type to the running command's stdin. | Recommended answer accepted (20 Oct 2026) |
| Q2  | Product     | **Where Terminal opens.** The user's choice: an item in the page bar's More actions (…), its icon on the left, with no page-bar button. `` ⌃` `` still opens and closes it. The other choice: an icon-only button left of More actions.                                                                                                                                                                                                                                                                                                                          | Item in More actions (20 Oct 2026)        |
