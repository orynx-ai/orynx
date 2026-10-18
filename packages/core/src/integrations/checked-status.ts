import { isDeepStrictEqual } from 'node:util';
import type { IntegrationStatus } from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';

/** How long a check's answer stands before status asks the tool again. */
const recheckAfterMs = 2 * 60_000;

export interface CheckedStatusOptions<Saved, Answer> {
  /** Which saved settings a check's answer belongs to; a change of key means a new check. */
  keyOf: (saved: Saved) => string;
  /** Asks the tool whether the saved settings still work. */
  check: (saved: Saved) => Promise<Answer>;
  events: EventBus;
  /** The answer for a check that Connect or Disconnect overtook before anything was known. */
  forgotten: Answer;
  /** Told about a re-check that failed behind the last answer. */
  onError?: (error: unknown) => void;
  /** The clock, in milliseconds. */
  now: () => number;
}

/**
 * An answer in GET /api/status, asked of the tool at most once every 2 minutes
 * (integration-adapter skill, step 8): a tool's line (`IntegrationStatus`), or Claude's login
 * (spec 010). Everyone asking while a check runs shares it. After the first check, status answers at
 * once with the last result while a re-check runs, and publishes `status.changed` when the answer
 * changes. Answers are compared by value.
 */
export interface CheckedStatus<Saved, Answer = IntegrationStatus> {
  get(saved: Saved): Promise<Answer>;
  /** Check again: asks the tool now, or shares the check that's already running. */
  checkNow(saved: Saved): Promise<Answer>;
  /** Connect has just checked: its answer stands, even over a check that started before it. */
  settle(saved: Saved, status: Answer): void;
  /** Disconnect: nothing is known any more, and a check that started before it can't bring it back. */
  forget(): void;
}

export function createCheckedStatus<Saved, Answer = IntegrationStatus>(
  options: CheckedStatusOptions<Saved, Answer>,
): CheckedStatus<Saved, Answer> {
  const { keyOf, check, events, now } = options;

  /** The last answer, for the saved settings it was for. */
  let last: { key: string; at: number; status: Answer } | undefined;
  let running: { key: string; answer: Promise<Answer> } | undefined;
  /** Goes up on every Connect and Disconnect, so a check that started before one can't overwrite it. */
  let generation = 0;

  function remember(key: string, status: Answer): void {
    last = { key, at: now(), status };
  }

  /** One check per key at a time; everyone asking meanwhile shares it. */
  function startCheck(saved: Saved, key: string): Promise<Answer> {
    if (running?.key === key) return running.answer;
    const startedIn = generation;
    const answer = check(saved)
      .then((status) => {
        // Connect or Disconnect came first: their answer stands, for everyone still waiting too.
        if (generation !== startedIn) return last?.status ?? options.forgotten;
        const changed = last?.key === key && !isDeepStrictEqual(last.status, status);
        remember(key, status);
        if (changed) events.publish({ type: 'status.changed' });
        return status;
      })
      .finally(() => {
        if (running?.answer === answer) running = undefined;
      });
    running = { key, answer };
    return answer;
  }

  return {
    async get(saved) {
      const key = keyOf(saved);
      if (last?.key !== key) return startCheck(saved, key);
      if (now() - last.at >= recheckAfterMs) {
        // Answer at once with what is known; a change arrives as status.changed.
        startCheck(saved, key).catch((error: unknown) => options.onError?.(error));
      }
      return last.status;
    },

    checkNow(saved) {
      return startCheck(saved, keyOf(saved));
    },

    settle(saved, status) {
      generation += 1;
      remember(keyOf(saved), status);
    },

    forget() {
      generation += 1;
      last = undefined;
    },
  };
}
