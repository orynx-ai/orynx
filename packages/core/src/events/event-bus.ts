import type { ServerEvent } from '@devhub/contracts';

export type EventListener = (event: ServerEvent) => void;

/** In-process pub/sub for server events. Routes publish; the /api/events stream subscribes. */
export interface EventBus {
  publish(event: ServerEvent): void;
  /** Returns a function that removes the listener. */
  subscribe(listener: EventListener): () => void;
  listenerCount(): number;
}

export function createEventBus(): EventBus {
  const listeners = new Set<EventListener>();
  return {
    publish(event) {
      for (const listener of listeners) listener(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listenerCount() {
      return listeners.size;
    },
  };
}
