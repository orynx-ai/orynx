import type { Preferences, StartSessionAnswer, StartSessionRequest } from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import { PullRequestRecordSchema } from '../integrations/github/map.ts';
import type { ListedSession } from '../sessions/session-store.ts';
import { calendarDay } from '../standup/standup-text.ts';
import { afterSync, nextToRead, type ReadAheadQueue } from './queue.ts';

export interface ReadAheadOptions {
  preferences: { read(): Promise<Preferences> };
  sessions: {
    list(): Promise<readonly ListedSession[]>;
    start(request: StartSessionRequest, options: { readAhead: boolean }): Promise<StartSessionAnswer>;
  };
  events: EventBus;
  now?: () => number;
  onError?: (error: unknown) => void;
}

/**
 * Read review requests ahead (spec 057, D): with Settings › Coding agent's row on, each review request that arrives
 * after it was turned on starts spec 050's review, read-only, one at a time within the limits (Q6). It posts nothing:
 * posting stays the Post dialog and your press.
 */
export interface ReadAheadService {
  /** The inbox's sync of GitHub answered with these records. */
  synced(records: readonly unknown[]): void;
  /** The requests waiting their turn, as `owner/name#number`. */
  waiting(): readonly string[];
  close(): Promise<void>;
}

const working = (session: { state: string }) => session.state === 'working' || session.state === 'needs_you';

export function createReadAhead(options: ReadAheadOptions): ReadAheadService {
  const now = options.now ?? Date.now;
  let queue: ReadAheadQueue = { queued: [], known: null };
  let pumping: Promise<void> = Promise.resolve();
  const inFlight = new Set<Promise<unknown>>();

  function safely(work: () => Promise<void>): void {
    const running = work()
      .catch((error: unknown) => options.onError?.(error))
      .finally(() => inFlight.delete(running));
    inFlight.add(running);
  }

  /** Starts the next request if the limits let one start; one pump at a time. */
  function pump(): Promise<void> {
    pumping = pumping.then(async () => {
      if (!(await options.preferences.read()).readReviewsAhead) {
        queue = { queued: [], known: null };
        return;
      }
      const listed = await options.sessions.list();
      const today = calendarDay(new Date(now()));
      const next = nextToRead({
        queued: queue.queued,
        working: listed.filter(working).length,
        reading: listed.some((session) => session.readAheadAt != null && working(session)),
        startedToday: listed.filter(
          (session) => session.readAheadAt != null && calendarDay(new Date(session.readAheadAt)) === today,
        ).length,
      });
      if (next === null) return;
      queue = { ...queue, queued: queue.queued.filter((id) => id !== next) };
      const [repository = '', number = ''] = next.split('#');
      const [owner = '', name = ''] = repository.split('/');
      const answer = await options.sessions.start(
        {
          message: '',
          context: [{ kind: 'pull_request', owner, name, number: Number(number) }],
          mode: 'ask',
          review: true,
        },
        { readAhead: true },
      );
      // Full up after all: it waits for a slot. Any other answer is the request's: it isn't tried again (AC-41).
      if (answer.result === 'cannot_start' && answer.reason === 'too_many') {
        queue = { ...queue, queued: [next, ...queue.queued] };
      }
    });
    return pumping.catch(() => undefined);
  }

  const unsubscribe = options.events.subscribe((event) => {
    // A session ended or the row changed: a request may start, or the queue drop (AC-38, AC-40).
    if (event.type === 'sessions.changed' || event.type === 'settings.changed') safely(pump);
  });

  return {
    synced(records) {
      safely(async () => {
        if (!(await options.preferences.read()).readReviewsAhead) {
          queue = { queued: [], known: null };
          return;
        }
        const requested = records.flatMap((record) => {
          const pull = PullRequestRecordSchema.safeParse(record);
          return pull.success && !pull.data.mine && pull.data.reviewRequestedAt !== null ? [pull.data.id] : [];
        });
        queue = afterSync(queue, requested);
        await pump();
      });
    },

    waiting() {
      return queue.queued;
    },

    async close() {
      unsubscribe();
      await Promise.all(inFlight);
    },
  };
}
