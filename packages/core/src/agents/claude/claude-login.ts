import type { ClaudeLogin } from '@devhub/contracts';
import type { EventBus } from '../../events/event-bus.ts';
import { createCheckedStatus } from '../../integrations/checked-status.ts';
import type { ClaudeCode, ClaudeCodeAnswer, ClaudeCodeProblem } from './claude-code.ts';

/**
 * Claude Code's login, which DevHub only checks (spec 010): there is nothing to connect or save. Asked
 * at most once every 2 minutes, like Jira's and GitHub's lines, and at once by Check again. A changed
 * answer publishes `status.changed`. The email and organisation stay in memory, in the last answer.
 */
export interface ClaudeLoginService {
  /** Settings › Coding agent's Claude card. */
  read(): Promise<ClaudeLogin>;
  /** Check again: asks Claude Code now, or shares the check that's already running. */
  checkNow(): Promise<ClaudeLogin>;
  /** The sidebar footer's "Claude connected": signed in, whichever way. */
  connected(): Promise<boolean>;
}

export interface ClaudeLoginOptions {
  claudeCode: ClaudeCode;
  events: EventBus;
  /** Told about each check that failed: the problem's kind and exit code, never the program's output. */
  onProblem?: (problem: ClaudeCodeProblem) => void;
  /** The clock, in milliseconds. */
  now?: () => number;
}

const error: ClaudeLogin = { state: 'error' };

export function createClaudeLogin(options: ClaudeLoginOptions): ClaudeLoginService {
  const checked = createCheckedStatus<undefined, ClaudeLogin>({
    // One login per computer, so one key.
    keyOf: () => 'claude',
    check: async () => {
      // A check that throws anyway is a failed one: the status line must still answer (AC-6).
      const answer = await options.claudeCode
        .authStatus()
        .catch((): ClaudeCodeAnswer => ({ ok: false, problem: { kind: 'failed', exitCode: null } }));
      if (answer.ok) return answer.login;
      options.onProblem?.(answer.problem);
      return error;
    },
    events: options.events,
    // Nothing settles or forgets this answer: there is no Connect or Disconnect.
    forgotten: error,
    now: options.now ?? Date.now,
  });

  return {
    read: () => checked.get(undefined),
    checkNow: () => checked.checkNow(undefined),
    async connected() {
      return (await checked.get(undefined)).state === 'signed_in';
    },
  };
}
