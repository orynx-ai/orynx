import type { IntegrationStatus } from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';

/** How long a check's answer stands before status asks the tool again. */
const recheckAfterMs = 2 * 60_000;

const notConnected: IntegrationStatus = { state: 'not_connected', detail: null };

export interface CheckedStatusOptions<Saved> {
  /** Which saved settings a check's answer belongs to; a change of key means a new check. */
  keyOf: (saved: Saved) => string;
  /** Asks the tool whether the saved settings still work. */
  check: (saved: Saved) => Promise<IntegrationStatus>;
  events: EventBus;
  /** Told about a re-check that failed behind the last answer. */
  onError?: (error: unknown) => void;
  /** The clock, in milliseconds. */
  now: () => number;
}

/**
 * A tool's line in GET /api/status, asked of the tool at most once every 2 minutes
 * (integration-adapter skill, step 8). Everyone asking while a check runs shares it. After the first
 * check, status answers at once with the last result while a re-check runs, and publishes
 * `status.changed` when the answer changes.
 */
export interface CheckedStatus<Saved> {
  get(saved: Saved): Promise<IntegrationStatus>;
  /** Connect has just checked: its answer stands, even over a check that started before it. */
  settle(saved: Saved, status: IntegrationStatus): void;
  /** Disconnect: nothing is known any more, and a check that started before it can't bring it back. */
  forget(): void;
}

function sameStatus(a: IntegrationStatus, b: IntegrationStatus): boolean {
  return a.state === b.state && a.detail === b.detail;
}

export function createCheckedStatus<Saved>(options: CheckedStatusOptions<Saved>): CheckedStatus<Saved> {
  const { keyOf, check, events, now } = options;

  /** The last answer, for the saved settings it was for. */
  let last: { key: string; at: number; status: IntegrationStatus } | undefined;
  let running: { key: string; answer: Promise<IntegrationStatus> } | undefined;
  /** Goes up on every Connect and Disconnect, so a check that started before one can't overwrite it. */
  let generation = 0;

  function remember(key: string, status: IntegrationStatus): void {
    last = { key, at: now(), status };
  }

  /** One check per key at a time; everyone asking meanwhile shares it. */
  function startCheck(saved: Saved, key: string): Promise<IntegrationStatus> {
    if (running?.key === key) return running.answer;
    const startedIn = generation;
    const answer = check(saved)
      .then((status) => {
        // Connect or Disconnect came first: their answer stands, for everyone still waiting too.
        if (generation !== startedIn) return last?.status ?? notConnected;
        const changed = last?.key === key && !sameStatus(last.status, status);
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
