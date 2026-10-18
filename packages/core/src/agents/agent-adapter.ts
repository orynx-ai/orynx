/**
 * The slot every coding agent plugs into (spec: "Agent adapter"). Claude is the first
 * implementation (spec 011, @anthropic-ai/claude-agent-sdk); screens only ever talk
 * to this interface, so another agent can follow without changing them.
 *
 * Safety rules every adapter must keep (CLAUDE.md rule 11, .claude/skills/agent-runtime):
 * work only inside the session worktree, never push or open a PR on its own, and ask
 * before network calls, pushes and deletes outside the worktree whatever the mode.
 */
import type { AlwaysAskReason, ChangeLine, PermissionMode } from '@devhub/contracts';

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

/** Your answer to a waiting call. `always` runs the call as `allow` does; the session saves the entry first. */
export type ApprovalDecision = 'allow' | 'deny' | 'always';

/** A call waiting for your answer (spec 012): a command, or an edit while Ask before everything is on. */
export type AgentAsk =
  | {
      kind: 'command';
      command: string;
      /** The agent's own line about the command, when it gave one. */
      description: string | null;
      /** Why it asks in every mode; null when it asks only because of the mode or the list. */
      alwaysAsk: AlwaysAskReason | null;
      /** The entry Always allow would save, when it's offered (Q1, Q4). */
      alwaysAllow: string | null;
    }
  | { kind: 'edit'; path: string; creates: boolean; lines: ChangeLine[]; moreLines: number };

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
  /** A command is running now: allowed by the list, or by you (spec 012). */
  | { kind: 'command'; command: string }
  /** You denied a waiting call; `text` is the command, or the edit's path. */
  | { kind: 'denied'; about: 'command' | 'edit'; text: string }
  /** The agent can't run commands in this session: there's no sandbox on this computer (spec 012, Q2b). */
  | { kind: 'no_commands' }
  /** The agent ended its turn, with its own summary. */
  | { kind: 'finished'; summary: string };

/** Why a session stopped with an error: the login, a usage or capacity limit, or anything else. */
/** `resume` is a follow-up the agent couldn't carry on: it no longer has the session's conversation (spec 013). */
export type AgentProblemKind = 'login' | 'limit' | 'resume' | 'other';

export type AgentEvent =
  /** The agent's own session began; `loaded` is logged by count only. */
  | {
      type: 'started';
      sessionId: string;
      agentSessionId: string;
      loaded: { tools: number; mcpServers: number; plugins: number };
    }
  | { type: 'work'; sessionId: string; work: AgentWork }
  /** A call waits for your answer until `respond()`, Stop, or the agent drops it (spec 012). */
  | { type: 'approval'; sessionId: string; approvalId: string; ask: AgentAsk }
  /** An edit or a command ended, so the worktree's files may have changed (spec 013, AC-2). */
  | { type: 'files_changed'; sessionId: string }
  /** A waiting call ended: `allowed` only when you allowed it. Comes before the work it lets happen. */
  | { type: 'answered'; sessionId: string; approvalId: string; allowed: boolean }
  /** `code` is safe to log; it never holds the agent's own words. */
  | { type: 'problem'; sessionId: string; kind: AgentProblemKind; code: string }
  /** The agent's program has ended, however it ended. Always the last event. */
  | { type: 'ended'; sessionId: string };

export interface AgentAdapter {
  readonly id: 'claude';
  /** Whether a session's agent can run commands here: only inside a sandbox (spec 012, Q2b). */
  readonly runsCommands: boolean;
  /**
   * Starts the agent in `worktreePath` with the brief. `instructions` go into the agent's system prompt
   * (spec 011, Q5). With `resume`, the agent carries on its own earlier session, given as the `agentSessionId`
   * it said when it started, and the brief is your follow-up (spec 013). Events that come before a handler is
   * added are kept for the first one.
   */
  startSession(
    brief: AgentBrief,
    worktreePath: string,
    /** Read on every call, so a change in Settings applies from the agent's next call (spec 012, AC-11). */
    permissions: () => Promise<AgentPermissions>,
    instructions: string,
    resuming?: { resume: string },
  ): Promise<string>;
  /** Returns a function that removes the handler. */
  onEvent(sessionId: string, handler: (event: AgentEvent) => void): () => void;
  /** Answers a waiting call; false when no such call is waiting (answered already, or never asked). */
  respond(sessionId: string, approvalId: string, decision: ApprovalDecision): Promise<boolean>;
  /**
   * Gives a running agent your message, read after its current step (spec 013, AC-12). False when it can't take
   * one: it has finished, is stopping, or was never started. Then the session resumes it instead.
   */
  sendMessage(sessionId: string, text: string): Promise<boolean>;
  /** Asks the agent to stop, and ends its program if it hasn't stopped soon after; resolves once it has ended. */
  stop(sessionId: string): Promise<void>;
}
