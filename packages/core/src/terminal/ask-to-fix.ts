import { mostMessageCharacters, terminalLimits, type SendMessageAnswer, type TerminalBlock } from '@devhub/contracts';
import type { SessionService } from '../sessions/session-service.ts';
import type { TerminalService } from './terminal-service.ts';

type FailedBlock = Extract<TerminalBlock, { state: 'failed' }>;

/** Backticks longer than any run of them in `text`, so the text can't end its own code. */
function fenceFor(text: string, least: number): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  return '`'.repeat(Math.max(least, longest + 1));
}

function linesSaid(count: number, all: boolean): string {
  if (count === 0) return 'It printed nothing.';
  if (all) return 'Its output:';
  return count === 1 ? 'The last line of its output:' : `The last ${String(count)} lines of its output:`;
}

/**
 * What Ask Claude to fix sends (spec 036, Q8f): the command, its exit code, and the last 50 lines of its output,
 * fewer when they don't fit in a follow-up. Built from the server's own copy of the block, never the page's.
 */
export function fixMessage(block: FailedBlock): string {
  const tick = fenceFor(block.command, 1);
  const command = tick.length === 1 ? `${tick}${block.command}${tick}` : `${tick} ${block.command} ${tick}`;
  const said = `I ran ${command} in the worktree and it failed with exit ${String(block.exitCode)}.`;
  for (let lines = block.output.slice(-terminalLimits.fixLines); ; lines = lines.slice(1)) {
    const all = !block.cut && lines.length === block.output.length;
    const fence = fenceFor(lines.join('\n'), 3);
    const output = lines.length === 0 ? [] : [fence, ...lines, fence];
    const message = [`${said} ${linesSaid(lines.length, all)}`, ...output, 'Fix it.'].join('\n');
    if (message.length <= mostMessageCharacters || lines.length === 0) return message;
  }
}

/**
 * Ask Claude to fix (AC-17): sends a failed block to Claude as a follow-up, into the running Claude or resuming it,
 * then notes it in the Claude tab. Null when the block isn't there or didn't fail, or the session isn't.
 */
export async function askToFix(
  { terminal, sessions }: { terminal: Pick<TerminalService, 'block'>; sessions: Pick<SessionService, 'send' | 'note'> },
  sessionId: string,
  tabId: string,
  blockId: string,
): Promise<SendMessageAnswer | null> {
  const block = terminal.block(sessionId, tabId, blockId);
  if (block?.state !== 'failed') return null;
  const answer = await sessions.send(sessionId, fixMessage(block));
  if (answer.result === 'not_found') return null;
  // After the send: Claude's next command takes a model call, so the note is in the log first.
  if (answer.result === 'sent') await sessions.note(sessionId, block.command);
  return answer;
}
