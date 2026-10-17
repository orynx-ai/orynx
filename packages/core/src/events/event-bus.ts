import type { ServerEvent } from '@devhub/contracts';

export type EventListener = (event: ServerEvent) => void;

export interface SubscribeOptions {
  /** The listener is an open page's event stream, not one of the hub's own listeners. */
  page?: boolean;
}

/** In-process pub/sub for server events. Routes publish; the /api/events stream subscribes. */
export interface EventBus {
  publish(event: ServerEvent): void;
  /** Returns a function that removes the listener. */
  subscribe(listener: EventListener, options?: SubscribeOptions): () => void;
  listenerCount(): number;
  /** How many pages have the event stream open. The inbox syncs on its own only while one does (spec 007). */
  pageCount(): number;
}

export function createEventBus(): EventBus {
  const listeners = new Set<EventListener>();
  const pages = new Set<EventListener>();
  return {
    publish(event) {
      for (const listener of listeners) listener(event);
    },
    subscribe(listener, options = {}) {
      // Each subscription is its own entry, so the same function can be subscribed twice.
      const entry: EventListener = (event) => {
        listener(event);
      };
      listeners.add(entry);
      if (options.page === true) pages.add(entry);
      return () => {
        listeners.delete(entry);
        pages.delete(entry);
      };
    },
    listenerCount() {
      return listeners.size;
    },
    pageCount() {
      return pages.size;
    },
  };
}
