<!-- learn-sources: packages/contracts/src/codex.ts packages/core/src/agents/codex/app-server.ts packages/core/src/agents/codex/codex-program.ts packages/core/src/agents/codex/codex-login.ts packages/core/src/agents/codex/launch.ts packages/core/src/agents/codex/items.ts packages/core/src/agents/codex/plain-read.ts packages/core/src/agents/codex/codex-adapter.ts packages/core/src/agents/agent-environment.ts packages/core/src/routes/codex.ts packages/core/src/test/fake-codex.ts apps/server/src/config.ts apps/server/src/main.ts e2e/fake-codex/app-server.ts packages/app/src/features/settings/components/codex-card.tsx packages/app/src/words/agent-words.ts -->

# Codex: a second agent, run from the Codex you already have

Codex sits beside Claude behind the same `AgentAdapter` (spec 052). Pick a Codex model in the composer and the session runs on Codex, in its own worktree, with the same rows in Settings › Coding agent, the same callout and the same pull request. Orynx ships no Codex: it runs the `codex` already on this computer and only reads its login.

## Which Codex

`findCodex()` takes `DEVHUB_CODEX` when the shell sets it to an absolute path, or else the first `codex` on the PATH. The desktop app gives the hub your login shell's PATH, so a Homebrew or npm `codex` is found. It must say `codex-cli 0.166` or later to `--version`. That is the version whose `codex-rs/app-server-protocol` Orynx was written against; an older one counts as not installed.

## Talking to it

Everything goes through one `codex app-server` per use, over stdio, one JSON-RPC message per line with no `jsonrpc` field (`app-server.ts`). It starts with `initialize`, opting into the experimental API for `dynamicTools`. Codex's stderr is never read. Every message Orynx reads is parsed with zod, keeping fields it doesn't know, so a newer Codex that adds some still parses.

- **The login** (`codex-login.ts`): `account/read` in `<DEVHUB_HOME>/codex-check`, cached for 2 minutes and refreshed by Check again, as Claude's is (`learn/checking-claude.md`). ChatGPT, an API key, or another way; no account while OpenAI wants one is signed out.
- **The models**: `model/list` from an empty temporary folder, kept for 10 minutes. Effort levels Orynx doesn't name (`minimal`, `none`) are left out.
- **A session**: `config/read`, then `thread/start` (or `thread/resume` for a follow-up) in the worktree, then `turn/start` with the brief. The turn's end is the session's end. A follow-up while it works goes in with `turn/steer`; Stop is `turn/interrupt`, then the program is ended.
- **Text alone** (`write()`): an ephemeral thread in an empty folder the sandbox only reads, with every approval declined and no tools.

## What Codex may do

`launch.ts` starts every app-server with `-c` overrides, which sit above `~/.codex/config.toml`:

- `approval_policy = "untrusted"` and `approvals_reviewer = "user"`: every command no exec-policy rule allows, and every edit, asks Orynx first, and never Codex's own reviewer.
- The `orynx` permission profile: commands read anywhere but `DEVHUB_HOME`, the keychain folder and `~/.codex`; write only the worktree (more specific than `DEVHUB_HOME`, so it wins) and the temporary folder; no network. A profile that denies a read can't be left, so even an escalation Codex asks for stays sandboxed with those paths hidden. An Ask reads its folder only.
- No hooks, notify command, web search, sub-agents, analytics or update check. MCP servers merge instead of being replaced, so the adapter turns off each one `config/read` names for the thread.

Codex's requests are decided as Claude's are (`codex-adapter.ts`): a command through `decideToolUse('Bash')`, an edit through `decideToolUse('Write')` for each path, with the callout's lines from the diff Codex sent on `item/started`, and Orynx's own tools as dynamic tools through the same ticket and session decisions. Codex looks at code by running commands, so a plain read inside the worktree (`plain-read.ts`: `cat`, `rg`, `ls`, `git diff` and the like) is decided as Claude's Read is and doesn't wait for you. A command `~/.codex/rules` allows runs without asking Orynx; it still runs in the sandbox and shows as a step.

Codex gets `codexEnvironment()`: the same short list as Claude, with `OPENAI_*`, `CODEX_HOME` and `CODEX_API_KEY` in place of Claude's variables. Neither agent gets the other's login. Its commits carry no `Co-Authored-By` line, and its note tells it to read `AGENTS.md` and to ask for a decision in its summary.

## Words

A session's screens name its agent: `forAgent()` turns Claude's words into Codex's for a Codex session ("Codex wants to run a command"). The composer names the agent a start goes to, and Settings words that cover both say "the agent".

## Testing

Tests fake Codex at its program, never Orynx's own code. `packages/core/src/test/fake-codex.ts` writes a real program that passes its stdio to a socket where each test plays Codex's side, message by message. The e2e run's Codex hub runs `e2e/fake-codex/codex`, a scripted app-server; every other hub names a Codex that isn't there.

## Checking a real Codex

The fakes can't prove what Codex itself does. Before a release, with your OK (it uses your ChatGPT login), run a session on a real Codex 0.166 and check:

1. `cat ~/.devhub/runtime.json` and `curl https://example.com` fail inside a session's command.
2. With Edit files on Ask first, an edit waits in the callout and lands only after Allow.
3. A `~/.codex/config.toml` with its own MCP server and `approval_policy = "never"` changes none of the above.
4. Codex calls one of Orynx's tools (create a ticket) and the step shows.
