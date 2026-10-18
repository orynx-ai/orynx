import type { InboxToolState } from '@devhub/contracts';
import { clockText, day, hour, minute, plural } from './calendar.ts';

/** Spec 007 Q2c: "12 min", "3 h" or "9 d", never weeks; at least a minute. The spoken form says the words. */
export function waitText(ms: number): { short: string; spoken: string } {
  if (ms < hour) {
    const minutes = Math.max(1, Math.floor(ms / minute));
    return { short: `${String(minutes)} min`, spoken: plural(minutes, 'minute') };
  }
  if (ms < day) {
    const hours = Math.floor(ms / hour);
    return { short: `${String(hours)} h`, spoken: plural(hours, 'hour') };
  }
  const days = Math.floor(ms / day);
  return { short: `${String(days)} d`, spoken: plural(days, 'day') };
}

export interface ToolLine {
  message: string;
  /** A link after the message, to a Settings tab; the screen ends it with a full stop. */
  action: { text: string; tab: 'connections' } | null;
}

const toolNames = { jira: 'Jira', github: 'GitHub' } as const;

/**
 * Spec 007 Q5: one quiet line for a tool that isn't connected or whose last sync failed; null otherwise.
 * Home shows it for each tool, and Tickets for Jira's sprint (spec 008, Q8d).
 */
export function toolLine(tool: keyof typeof toolNames, state: InboxToolState, now: Date): ToolLine | null {
  const name = toolNames[tool];
  if (state.state === 'not_connected') {
    return { message: `${name} is not connected.`, action: { text: 'Connect it in Settings', tab: 'connections' } };
  }
  if (state.state !== 'failed') return null;
  // Only a tool that may still be fine says how old its rows are; a refused token says what to do.
  const age =
    state.lastSyncedAt === null
      ? ''
      : ` These are from ${waitText(Math.max(minute, now.getTime() - Date.parse(state.lastSyncedAt))).short} ago.`;
  const { problem } = state;
  switch (problem.kind) {
    case 'no_answer':
      return { message: `${name} didn't answer.${age}`, action: null };
    case 'rate_limited':
      return {
        message: `${name}'s rate limit is used up${problem.until === null ? '' : ` until ${clockText(problem.until)}`}.${age}`,
        action: null,
      };
    case 'rejected':
      return {
        message: `${name} refused the saved token.`,
        action: { text: 'Reconnect it in Settings', tab: 'connections' },
      };
    case 'sign_in_needed':
      return {
        message: `${name} wants you to sign in on the web first. Sign in at ${problem.site}, then press Refresh.`,
        action: null,
      };
    case 'other':
      return { message: problem.message, action: null };
  }
}
