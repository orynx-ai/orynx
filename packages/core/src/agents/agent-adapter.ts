/**
 * The slot every coding agent plugs into (spec: "Agent adapter"). Claude is the first
 * implementation (roadmap 010, @anthropic-ai/claude-agent-sdk); screens only ever talk
 * to this interface, so another agent can follow without changing them.
 *
 * Safety rules every adapter must keep (CLAUDE.md rule 11, .claude/skills/agent-runtime):
 * work only inside the session worktree, never push or open a PR on its own, and ask
 * before network calls, pushes and deletes outside the worktree whatever the mode.
 */
import type { SessionState, SessionStep } from '@devhub/contracts';

export type PermissionMode = 'ask_everything' | 'edit_freely_ask_commands' | 'edit_and_run_allowed';

export interface AgentPermissions {
  mode: PermissionMode;
  /** Commands that run without asking in `edit_and_run_allowed`, e.g. "npm test". */
  allowedCommands: readonly string[];
}

export interface AgentBrief {
  /** What the user typed in the composer. */
  message: string;
  /** Exactly the context chips the user added: nothing else is sent. */
  context: readonly { kind: 'jira' | 'pull_request' | 'slack_thread' | 'file'; title: string; body: string }[];
}

export type ApprovalDecision = 'allow' | 'deny' | 'always';

export type AgentEvent =
  | { type: 'step'; sessionId: string; step: SessionStep; title: string; detail: string | null }
  | { type: 'file_changed'; sessionId: string; path: string; added: number; removed: number }
  | { type: 'approval_requested'; sessionId: string; approvalId: string; command: string }
  | { type: 'state'; sessionId: string; state: SessionState }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; sessionId: string; message: string };

export interface AgentAdapter {
  readonly id: 'claude';
  startSession(brief: AgentBrief, worktreePath: string, permissions: AgentPermissions): Promise<string>;
  /** Returns a function that removes the handler. */
  onEvent(sessionId: string, handler: (event: AgentEvent) => void): () => void;
  respond(sessionId: string, approvalId: string, decision: ApprovalDecision): Promise<void>;
  sendMessage(sessionId: string, text: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
}
