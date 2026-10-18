/**
 * The slot every coding agent plugs into (spec: "Agent adapter"). Claude is the first
 * implementation (spec 011, @anthropic-ai/claude-agent-sdk); screens only ever talk
 * to this interface, so another agent can follow without changing them.
 *
 * Safety rules every adapter must keep (CLAUDE.md rule 11, .claude/skills/agent-runtime):
 * work only inside the session worktree, never push or open a PR on its own, and ask
 * before network calls, pushes and deletes outside the worktree whatever the mode.
 */
import type { PermissionMode } from '@devhub/contracts';

/** Saved in Settings › Coding agent (spec 005); the schema lives in contracts. */
export type { PermissionMode };

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

/** A call the adapter refused, which the session shows as a step (spec 011 Q6, spec 012 Q7). */
export interface AgentRefusal {
  access: 'read' | 'edit' | 'run';
  reason: 'outside_worktree' | 'ask_everything' | 'push' | 'background';
  /** As the agent asked for it: relative to the worktree when it's inside, otherwise absolute; the command for a `run`. */
  path: string;
}

/** One piece of the agent's work, once it has happened (or been refused). */
export type AgentWork =
  /** A read (with its file) or a search (no single file). */
  | { kind: 'explore'; file: string | null }
  /** The agent's to-do list, which is its plan. */
  | { kind: 'plan'; items: readonly string[] }
  | { kind: 'edit'; file: string }
  | { kind: 'refused'; refusal: AgentRefusal }
  /** The agent ended its turn, with its own summary. */
  | { kind: 'finished'; summary: string };

/** Why a session stopped with an error: the login, a usage or capacity limit, or anything else. */
export type AgentProblemKind = 'login' | 'limit' | 'other';

export type AgentEvent =
  /** The agent's own session began; `loaded` is logged by count only. */
  | {
      type: 'started';
      sessionId: string;
      agentSessionId: string;
      loaded: { tools: number; mcpServers: number; plugins: number };
    }
  | { type: 'work'; sessionId: string; work: AgentWork }
  /** `code` is safe to log; it never holds the agent's own words. */
  | { type: 'problem'; sessionId: string; kind: AgentProblemKind; code: string }
  /** The agent's program has ended, however it ended. Always the last event. */
  | { type: 'ended'; sessionId: string };

export interface AgentAdapter {
  readonly id: 'claude';
  /**
   * Starts the agent in `worktreePath` with the brief. `instructions` go into the agent's system prompt
   * (spec 011, Q5). Events that come before a handler is added are kept for the first one.
   */
  startSession(
    brief: AgentBrief,
    worktreePath: string,
    permissions: AgentPermissions,
    instructions: string,
  ): Promise<string>;
  /** Returns a function that removes the handler. */
  onEvent(sessionId: string, handler: (event: AgentEvent) => void): () => void;
  respond(sessionId: string, approvalId: string, decision: ApprovalDecision): Promise<void>;
  sendMessage(sessionId: string, text: string): Promise<void>;
  /** Asks the agent to stop, and ends its program if it hasn't stopped soon after; resolves once it has ended. */
  stop(sessionId: string): Promise<void>;
}
