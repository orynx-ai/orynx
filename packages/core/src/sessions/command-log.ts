import { terminalLimits, type ClaudeCommand } from '@devhub/contracts';
import type { AgentWork } from '../agents/agent-adapter.ts';
import { lastLines } from '../terminal/output.ts';

/**
 * The Terminal's Claude tab (spec 036): every command Claude ran, oldest first, with its output, kept in
 * `session.json` beside the approvals. Pure, so every rule here is tested as a table.
 */
export type CommandLog = ClaudeCommand[];

/** An id for a line with no call of its own: its place among every command, counting the `dropped` ones. */
function placeId(log: CommandLog, dropped: number, kind: 'denied' | 'refused'): string {
  return `${kind}-${String(dropped + log.length + 1)}`;
}

/**
 * Adds a command Claude was let run, one you denied, or one Orynx refused. Other work isn't a command. `dropped` is how
 * many fell off the front, so an id never repeats.
 */
export function logWork(log: CommandLog, work: AgentWork, dropped = 0): CommandLog {
  switch (work.kind) {
    case 'command':
      return [...log, { id: work.id, state: 'running', command: work.command }];
    case 'denied':
      return work.about === 'command'
        ? [...log, { id: placeId(log, dropped, 'denied'), state: 'denied', command: work.text }]
        : log;
    case 'refused': {
      const { access, reason, path } = work.refusal;
      return access === 'run'
        ? [...log, { id: placeId(log, dropped, 'refused'), state: 'refused', command: path, reason }]
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

/**
 * The log as `session.json` keeps it (spec 049): its last `terminalLimits.claudeCommands`, each with its last 200 lines,
 * so a long session stays a few MB; and how many in all fell off the front.
 */
export function keepLast(log: CommandLog, dropped: number): { commandLog: CommandLog; commandsDropped: number } {
  const over = Math.max(0, log.length - terminalLimits.claudeCommands);
  return { commandLog: over === 0 ? log : log.slice(over), commandsDropped: dropped + over };
}
