import { terminalLimits, type ClaudeCommand } from '@devhub/contracts';
import type { AgentWork } from '../agents/agent-adapter.ts';
import { lastLines } from '../terminal/output.ts';

/**
 * The Terminal's Claude tab (spec 036): every command Claude ran, oldest first, with its output, kept in
 * `session.json` beside the approvals. Pure, so every rule here is tested as a table.
 */
// shortcut: no cap on the number of commands, as Claude's progress has none; cap it if session.json grows too big.
export type CommandLog = ClaudeCommand[];

/** An id for a line with no call of its own: its place in the log, which only grows. */
function placeId(log: CommandLog, kind: 'denied' | 'refused'): string {
  return `${kind}-${String(log.length + 1)}`;
}

/** Adds a command Claude was let run, one you denied, or one Orynx refused. Other work isn't a command. */
export function logWork(log: CommandLog, work: AgentWork): CommandLog {
  switch (work.kind) {
    case 'command':
      return [...log, { id: work.id, state: 'running', command: work.command }];
    case 'denied':
      return work.about === 'command'
        ? [...log, { id: placeId(log, 'denied'), state: 'denied', command: work.text }]
        : log;
    case 'refused': {
      const { access, reason, path } = work.refusal;
      return access === 'run'
        ? [...log, { id: placeId(log, 'refused'), state: 'refused', command: path, reason }]
        : log;
    }
    default:
      return log;
  }
}

/** A running command's end: the last lines of its output, colour codes removed, and its time. */
export function logEnd(log: CommandLog, end: { id: string; output: string; failed: boolean; ms: number }): CommandLog {
  return log.map((entry) =>
    entry.id === end.id && entry.state === 'running'
      ? {
          id: entry.id,
          command: entry.command,
          state: end.failed ? 'failed' : 'done',
          ...lastLines(end.output, terminalLimits.claudeLines),
          ms: Math.round(end.ms),
        }
      : entry,
  );
}

/** Claude's run ended with a command still going (Stop, a problem, or Orynx closing): it never ends now. */
export function logRunEnded(log: CommandLog): CommandLog {
  return log.map((entry) =>
    entry.state === 'running' ? { id: entry.id, command: entry.command, state: 'stopped' } : entry,
  );
}
