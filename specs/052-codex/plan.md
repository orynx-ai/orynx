# Plan: Codex, a second coding agent beside Claude

Spec: `specs/052-codex/spec.md`

## What the protocol research found (3 Nov 2026, Codex `rust-v0.166.0`)

The source is `codex-rs/app-server-protocol` and `codex-rs/core` at the tag `rust-v0.166.0`. Nothing has run against a real Codex yet: it isn't installed on this laptop.

- `codex app-server` speaks JSON-RPC 2.0 over stdio, one JSON message per line. Orynx calls `initialize` (with `capabilities.experimentalApi: true` for `dynamicTools`), `thread/start`, `thread/resume`, `turn/start`, `turn/steer`, `turn/interrupt`, `model/list` and `account/read`.
- Codex asks the client through server requests:
  - `item/commandExecution/requestApproval` gets `{ command, cwd, reason, additionalPermissions }`, answered `accept` or `decline`.
  - `item/fileChange/requestApproval` gets `{ itemId, reason }`, answered `accept` or `decline`. The diff is on the `fileChange` item that `item/started` sent first (`changes: [{ path, kind, diff }]`).
  - `item/tool/call` carries one of Orynx's dynamic tools, answered with `{ contentItems: [{ type: 'inputText', text }], success }`.
- Under `approval_policy = "untrusted"`, every command that no exec-policy rule allows prompts (`exec_policy.rs`, `render_decision_for_unmatched_command`), and every patch prompts (`safety.rs`).
- A sandbox with any denied-read path can't be left. `unsandboxed_execution_allowed()` is false, so an approved escalation runs in `EscalatedSandboxWithRestrictions`, and a command the sandbox denied is never retried outside it (`orchestrator.rs`, `sandboxing.rs`). Orynx's profile always denies `DEVHUB_HOME`, so no Codex command ever runs unsandboxed.
- The sandbox is a named permission profile passed as `-c` overrides: `default_permissions = "orynx"`, and `[permissions.orynx]` with `filesystem = { ":root" = "read", "<DEVHUB_HOME>" = "deny", "<worktree>" = "write", "<tmp>" = "write" }` and `network.enabled = false`. The more specific entry wins, so the worktree under `DEVHUB_HOME` is writable.
- Further overrides: `mcp_servers = {}`, `hooks` off, `analytics.enabled = false` and `otel.metrics_exporter = "none"`. User exec-policy rules in `~/.codex/rules/` can't be switched off from the client (spec, part C, last change).
- `model/list` gives `{ id, displayName, description, hidden, isDefault, supportedReasoningEfforts[].reasoningEffort }`. `account/read` gives `account: null | { type: 'apiKey' } | { type: 'chatgpt', email } | …`.
- A turn's errors carry `codexErrorInfo`: `Unauthorized` is the login problem, `UsageLimitExceeded` and `RateLimitExceeded` are the limit problem, and anything else is `other`.

## Order of work

1. **Contracts first.** Add the agent id, Codex's login, both agents in `/api/status`, the agent on a choice and on a session, and the models route by agent. Everything else builds on these types.
2. **The Codex connection, faked at its boundary.** `app-server.ts` is the only file that spawns Codex, and its tests drive it through a fake process (two streams). Then come finding Codex and its login, the launch overrides (pure), and mapping items to steps (pure). Each is tested alone, before the adapter.
3. **The adapter, in five slices.** (a) run, steps and Stop. (b) command approvals through Claude's own `decideToolUse`, as `Bash`. (c) edit approvals as `Write` or `Edit`, with the ask's lines from `parseUnifiedDiff`. (d) dynamic tools. (e) follow-ups, resume, problems and `write()`. The shared decision code stays where it is, in `agents/claude/`, and is imported from there.
4. **The session service picks the adapter by the session's agent.** `adapter` becomes `adapters`, the `claude` gate becomes one per agent, and `claudeSessionId` keeps its name on disk and gains `agent` beside it. The brief note and the commit trailer depend on the agent.
5. **Wiring.** Routes, `createServer`, and `apps/server` config (`DEVHUB_CODEX`) and `main.ts`.
6. **api-client, then the app.** The Codex card, then the picker's groups, then the words in three slices.
7. **e2e last.** A fake `codex` program speaking app-server JSON-RPC, as `e2e/fake-claude/claude` stands in for Claude Code. Then the docs.

## Risks

| Risk                                                                                             | How we will notice early                                                                                                                                        | What we do                                                                                            |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| The installed Codex isn't 0.166, and an experimental field (`dynamicTools`, `permissions`) moved | `codex --version` is read before anything else. Every message Orynx reads is parsed with zod, so a changed shape fails one session with `other`, never silently | Below 0.166 counts as not installed. Newer versions run. A real-Codex check is in `/review` (Task 22) |
| The sandbox profile is wrong, and a command reads `~/.devhub/runtime.json`                       | The launch test asserts the exact overrides. The manual check in Task 22 runs `cat ~/.devhub/runtime.json` through a real Codex                                 | A failed check blocks the branch. Q6: with no safe sandbox, Codex gets no commands                    |
| An edit lands without asking (Edit files on Ask first)                                           | Adapter test AC-13: the fake answers `item/fileChange/requestApproval`, and nothing is accepted until `respond()`                                               | `untrusted` makes every patch ask. Q6: if a real Codex skips the ask, Codex isn't offered             |
| User `~/.codex/rules` auto-run commands                                                          | The step still shows (`item/started` commandExecution)                                                                                                          | Accepted in the spec. The sandbox bounds them                                                         |
| `~/.codex` profiles or `[projects]` trust override Orynx's `-c` flags                            | AC-16 in the adapter test checks the args. Task 22 checks a real Codex with a hostile `config.toml` in a temp `CODEX_HOME`                                      | `-c` flags are the highest user-level layer. If one leaks, add it to the overrides                    |
| About 119 words lines change, and tests that read "Claude" break                                 | Each words task runs its feature's tests                                                                                                                        | Split into composer, session and Settings slices. Every Claude session reads as before                |
| Session store migration                                                                          | A record saved before has no `agent`                                                                                                                            | The schema defaults to `'claude'` (AC-23)                                                             |

## Touches

- Packages: contracts, core, api-client, app, server (config, main), e2e, docs and learn. Nothing in `ui`: the card and the groups use existing components (Q7), and the icon is a Hugeicons glyph.
- Gates that check this work: boundaries, env-policy (`DEVHUB_CODEX` in `config.ts` and `.env.example`), test-policy, style-policy, design-source, icon-buttons, secrets, specs, handbook-size.
- Skills to follow: `.claude/skills/agent-runtime/SKILL.md`, `add-api-endpoint`, `server-state`, `client-state`, `honest-tests`, `build-a-screen`, `clean-ui`.
- No dependency is added: Orynx speaks the protocol with its own zod schemas and runs the user's `codex`.
