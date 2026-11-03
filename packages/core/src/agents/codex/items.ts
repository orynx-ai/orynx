import { isAbsolute, relative } from 'node:path';
import { z } from 'zod';
import type { TodoStatus } from '@devhub/contracts';
import type { AgentProblemKind, AgentWork } from '../agent-adapter.ts';

/**
 * Codex's notifications as the session's steps (spec 052), as `sdk-messages.ts` reads Claude's: reads and searches,
 * the plan, edits, commands with their output, and the last message as the summary. Its reasoning is never shown.
 */

export type CodexRead =
  | { type: 'work'; work: AgentWork }
  /** An edit or a command has ended, so the worktree's files may have changed. */
  | { type: 'files_changed' }
  | { type: 'command_ended'; id: string; output: string; failed: boolean; ms: number }
  /** `problem` says why a failed turn failed; `code` is Codex's error code, never its words. */
  | {
      type: 'turn_ended';
      status: 'completed' | 'interrupted' | 'failed';
      summary: string;
      problem: { kind: AgentProblemKind; code: string } | null;
    };

/** How Orynx answered a command's approval: as a plain read, as a command, or never asked (null). */
export type SeenCommand = 'read' | 'command';

const ActionSchema = z.looseObject({
  type: z.string(),
  path: z.string().nullish(),
});

const CommandItemSchema = z.looseObject({
  type: z.literal('commandExecution'),
  id: z.string(),
  command: z.string(),
  status: z.enum(['inProgress', 'completed', 'failed', 'declined']),
  commandActions: z.array(ActionSchema).default([]),
  aggregatedOutput: z.string().nullish(),
  exitCode: z.number().nullish(),
  durationMs: z.number().nullish(),
});

const FileChangeItemSchema = z.looseObject({
  type: z.literal('fileChange'),
  id: z.string(),
  changes: z.array(
    z.looseObject({
      path: z.string(),
      kind: z.looseObject({ type: z.string(), movePath: z.string().nullish() }),
      diff: z.string(),
    }),
  ),
  status: z.enum(['inProgress', 'completed', 'failed', 'declined']),
});

const MessageItemSchema = z.looseObject({ type: z.literal('agentMessage'), text: z.string() });

const ItemNotificationSchema = z.looseObject({ item: z.unknown() });

const PlanSchema = z.looseObject({
  plan: z.array(z.looseObject({ step: z.string(), status: z.enum(['pending', 'inProgress', 'completed']) })),
});

const TurnCompletedSchema = z.looseObject({
  turn: z.looseObject({
    status: z.enum(['completed', 'interrupted', 'failed', 'inProgress']),
    error: z.looseObject({ codexErrorInfo: z.unknown() }).nullish(),
  }),
});

const statusOf: Record<'pending' | 'inProgress' | 'completed', TodoStatus> = {
  pending: 'pending',
  inProgress: 'in_progress',
  completed: 'completed',
};

/** Codex's error code: a name, or the one key of an object that carries details. */
function errorCode(info: unknown): string {
  if (typeof info === 'string' && info !== '') return info;
  if (typeof info === 'object' && info !== null) return Object.keys(info)[0] ?? 'turn_failed';
  return 'turn_failed';
}

function problemKind(code: string): AgentProblemKind {
  if (code === 'unauthorized') return 'login';
  if (code === 'usageLimitExceeded' || code === 'rateLimitExceeded' || code === 'sessionBudgetExceeded') {
    return 'limit';
  }
  return 'other';
}

export interface CodexReaderOptions {
  worktree: string;
  /** What Orynx made of each command when it asked; null for one it never saw. */
  seen: (itemId: string) => SeenCommand | null;
}

export function createCodexReader({
  worktree,
  seen,
}: CodexReaderOptions): (method: string, params: unknown) => CodexRead[] {
  let lastMessage = '';

  /** A path inside the worktree as the session shows it, relative; anything else as Codex gave it. */
  function inWorktree(path: string): string {
    if (!isAbsolute(path)) return path;
    const inside = relative(worktree, path);
    return inside === '' || inside.startsWith('..') || isAbsolute(inside) ? path : inside;
  }

  function started(item: unknown): CodexRead[] {
    const run = CommandItemSchema.safeParse(item);
    // Orynx said the step of every command it allowed; one it never saw is said here.
    if (!run.success || seen(run.data.id) !== null) return [];
    return [{ type: 'work', work: { kind: 'command', id: run.data.id, command: run.data.command } }];
  }

  function completed(item: unknown): CodexRead[] {
    const message = MessageItemSchema.safeParse(item);
    if (message.success) {
      lastMessage = message.data.text;
      return [];
    }
    const run = CommandItemSchema.safeParse(item);
    if (run.success) {
      const { id, status, commandActions, aggregatedOutput, exitCode, durationMs } = run.data;
      if (status === 'declined' || status === 'inProgress') return [];
      if (seen(id) === 'read') {
        return commandActions.map((action): CodexRead => ({
          type: 'work',
          work: {
            kind: 'explore',
            file: action.type === 'read' && action.path != null ? inWorktree(action.path) : null,
          },
        }));
      }
      const failed = status === 'failed' || (exitCode != null && exitCode !== 0);
      return [
        { type: 'command_ended', id, output: aggregatedOutput ?? '', failed, ms: durationMs ?? 0 },
        // A command can write anything, even one that failed part way.
        { type: 'files_changed' },
      ];
    }
    const edit = FileChangeItemSchema.safeParse(item);
    if (edit.success && edit.data.status === 'completed') {
      return [
        ...edit.data.changes.map((change): CodexRead => ({
          type: 'work',
          work: { kind: 'edit', file: inWorktree(change.kind.movePath ?? change.path) },
        })),
        { type: 'files_changed' },
      ];
    }
    return [];
  }

  return (method, params) => {
    if (method === 'item/started' || method === 'item/completed') {
      const notification = ItemNotificationSchema.safeParse(params);
      if (!notification.success) return [];
      return method === 'item/started' ? started(notification.data.item) : completed(notification.data.item);
    }
    if (method === 'turn/plan/updated') {
      const plan = PlanSchema.safeParse(params);
      if (!plan.success) return [];
      const steps = plan.data.plan;
      return [
        {
          type: 'work',
          work: {
            kind: 'plan',
            items: steps.map((step) => step.step),
            statuses: steps.map((step) => statusOf[step.status]),
          },
        },
      ];
    }
    if (method === 'turn/completed') {
      const turn = TurnCompletedSchema.safeParse(params);
      if (!turn.success || turn.data.turn.status === 'inProgress') return [];
      const { status, error } = turn.data.turn;
      const summary = lastMessage;
      lastMessage = '';
      const code = errorCode(error?.codexErrorInfo);
      const problem = status === 'failed' ? { kind: problemKind(code), code } : null;
      return [{ type: 'turn_ended', status, summary, problem }];
    }
    return [];
  };
}
