import type { ClaudeLimit } from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';

export interface LimitWatchOptions {
  events: EventBus;
  /** Tells you once for each window you come close to (AC-45, AC-46): the bell, a pop-up, the desktop. */
  notify: (limit: ClaudeLimit) => void;
  now?: () => number;
}

/**
 * How close you are to one of Claude's plan limits, as Claude Code last said while a session ran (spec 057, E): the
 * warning GET /api/status carries, until its window resets or Claude Code says all is well (AC-47). Orynx only knows
 * what its own sessions heard.
 */
export interface LimitWatch {
  heard(status: 'allowed' | 'allowed_warning' | 'rejected', limit: ClaudeLimit | null): void;
  current(): ClaudeLimit | null;
  close(): void;
}

export function createLimitWatch({ events, notify, now = Date.now }: LimitWatchOptions): LimitWatch {
  let current: ClaudeLimit | null = null;
  let timer: NodeJS.Timeout | null = null;
  const told = new Set<string>();

  function set(next: ClaudeLimit | null): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    current = next;
    events.publish({ type: 'status.changed' });
  }

  return {
    heard(status, limit) {
      if (status === 'allowed') {
        if (current !== null) set(null);
        return;
      }
      if (status !== 'allowed_warning' || limit === null) return;
      set(limit);
      const window = `${limit.window} ${limit.resetsAt ?? ''}`;
      if (!told.has(window)) {
        told.add(window);
        notify(limit);
      }
      if (limit.resetsAt !== null) {
        timer = setTimeout(
          () => {
            set(null);
          },
          Math.max(0, Date.parse(limit.resetsAt) - now()),
        );
      }
    },

    current() {
      return current;
    },

    close() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
