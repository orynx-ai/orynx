<!-- learn-sources: packages/contracts/src/claude.ts packages/core/src/agents/agent-environment.ts packages/core/src/agents/claude/claude-code.ts packages/core/src/agents/claude/map.ts packages/core/src/agents/claude/claude-login.ts packages/core/src/routes/claude.ts packages/core/src/test/fake-claude.ts apps/server/src/config.ts apps/server/src/main.ts e2e/fake-claude/claude e2e/fake-claude/config.ts packages/app/src/features/settings/components/claude-card.tsx turbo.json -->

# Checking Claude: the login Claude Code already has

There is nothing to connect for Claude. Claude Code owns the login ("Already done if Claude Code works on your laptop", product spec), so DevHub only checks it and shows the answer: in the sidebar footer ("Claude connected · runs locally") and on the Claude card in Settings › Coding agent. DevHub never signs you in or out, and saves nothing about it. Spec 010 built it.

## The path of one check

```
GET /api/status or GET /api/claude/login        (or POST /api/claude/login/check: Check again)
  └─ claude-login.ts        the last answer, if it's under 2 minutes old; else one check, shared
       └─ claude-code.ts    <the SDK's claude> auth status --json
            │                 the short environment, in <DEVHUB_HOME>/claude-check, 10 s at most
            └─ map.ts       its JSON → signed in (how, email, organisation) · signed out
                            anything else → a problem: missing · failed (exit code) · unreadable · timeout
  ← the card's login; the footer's `connected`; status.changed when the answer changed
```

## Which Claude Code

`@anthropic-ai/claude-agent-sdk` installs the Claude Code build for your platform in a package beside itself (`@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`, about 270 MB). `findSdkClaudeCode()` looks it up the way the SDK does, from the SDK's own folder, because pnpm keeps the platform package there and not beside core. It never runs the program to find it. A `claude` on your PATH is never used (spec 010, Q2c), so your terminal's Claude Code and DevHub's can be different versions. Sessions (spec 011) use the SDK's copy too.

`apps/server` lists the SDK as well as `packages/core`: its bundle keeps npm packages external, and at run time the lookup starts from `apps/server/dist`.

## What the program sees

- **Exactly `auth status --json`.** It reads the login on this computer and prints JSON. It sends no prompt and uses no quota. It exits 0 when signed in and 1 when signed out, and prints the JSON either way.
- **The short environment** (`agents/agent-environment.ts`): `HOME`, `USER`, `LOGNAME`, `PATH`, `SHELL`, `TMPDIR`, `LANG`, `LC_*`, Claude's own settings (`CLAUDE_*`, `ANTHROPIC_*`), the cloud logins Claude Code can use (`AWS_*`, `GOOGLE_*`, `CLOUD_ML_REGION`), and proxy and certificate settings. It's an allow list, so no `DEVHUB_*` variable, `.env` token or session token gets through unless someone adds it to the list. Of `CLAUDE_*`, the variables a Claude Code session sets for the programs it starts (`CLAUDE_CODE_SESSION_*`, `CLAUDE_CODE_MESSAGING_*`, `CLAUDE_PID` and a few more) stay out: when you start Orynx from a Claude Code terminal, what Orynx starts isn't part of that session. `apps/server/src/config.ts` builds it from the shell's environment, never from `.env`. Under `pnpm dev`, turbo hands each task only the variables `turbo.json` lists: `DEVHUB_CLAUDE_CODE` with the other `DEVHUB_*` settings in `globalPassThroughEnv`, and the allow list's names in the `@devhub/server#dev` task's `passThroughEnv`, so Vite, Storybook and the builds never get cloud logins. Change the list and that task together.
- **`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`.** Otherwise the pinned build's `auth status` records an analytics event, and DevHub checks every 2 minutes.
- **Its own working folder,** `<DEVHUB_HOME>/claude-check`, made with mode 0700, so no repository's `.claude` settings change the answer. Never a shared folder such as `/tmp`, where another account on the computer could leave `.claude/settings.json` (an `apiKeyHelper`, say) and make the card say the wrong login.

## Reading the answer

The JSON isn't part of the SDK's typed API, so the SDK is pinned to one exact version and `map.ts` checks every field it reads with zod: `loggedIn`, `authMethod`, `apiProvider`, `email` and `orgName`. Bedrock and Vertex are named by `apiProvider`, a claude.ai login by its account, and an API key (`api_key`, `api_key_helper`) by the way only. Any other way is "Signed in". An answer whose exit code disagrees with `loggedIn`, or that isn't the JSON, is never read as signed in.

The email and organisation stay in memory, in the last answer, and go only to the card. `/api/status` carries just `connected`, and `status.changed` carries nothing.

## When it checks

`claude-login.ts` puts the program behind `integrations/checked-status.ts`, the same code that asks Jira and GitHub at most every 2 minutes: the first request waits for a check, everyone asking during a check shares it, and after 2 minutes a request answers at once with the last result while a re-check runs. Check again is `checkNow()`: it checks at once, or shares the check that's already running, so a second press starts nothing. A changed answer publishes `status.changed`, which refreshes the footer and the card in every open tab (`learn/live-updates.md`).

## When it fails

A failed check is the card's **Error**, never a failed request, and the rest of DevHub keeps working. The terminal says which of the four it was, and the exit code, but never the program's output:

```
WARN  Claude Code's login check failed   claude: { kind: "failed", exitCode: 3 }
```

| `kind`       | What happened                                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing`    | No program at the path, or one the system can't start: not runnable, no `#!` line, another processor's build, or no SDK build for this platform |
| `failed`     | It exited with an error and printed no answer, or ended by a signal or its work folder couldn't be made (`exitCode: null`)                      |
| `unreadable` | It exited 0 but printed something that isn't the expected JSON, or more than 64 KB                                                              |
| `timeout`    | It ran longer than 10 seconds and was stopped                                                                                                   |

If the card says Not signed in while `claude` works in your terminal, the two may not share a login: check that `CLAUDE_CONFIG_DIR` is the same in the terminal that started DevHub, then press Check again.

## Testing

- Tests never run the real Claude Code. `packages/core/src/test/fake-claude.ts` is a real script in a temp folder that DevHub starts like the real one. It writes down its arguments and the environment it got, which is how `claude-code.test.ts` proves the allow list. `createServer()` without a `claudeCode` finds no program and starts nothing.
- `agents/claude/no-leaks.test.ts` runs the real hub at trace level through every answer and searches the log and the events for the account and the program's output.
- The e2e run names `e2e/fake-claude/claude` with `DEVHUB_CLAUDE_CODE`, which `config.ts` reads from the shell only, like gh's `PATH`: a file must not decide which program DevHub starts. The first hub's fake is always signed out, as `shell.spec.ts` expects. The second hub's answers what `coding-agent.spec.ts` writes into its `CLAUDE_CONFIG_DIR`, in the desktop project only, because one answer file serves the whole hub.
- To see the signed-out card with your own Claude Code, start DevHub with `CLAUDE_CONFIG_DIR` pointing at an empty temporary folder. Your real login is untouched.
