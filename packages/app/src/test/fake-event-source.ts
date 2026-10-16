import type { ServerEvent } from '@devhub/contracts';
import type { EventSourceLike } from '@devhub/api-client';

/**
 * jsdom has no EventSource, so tests pass this browser-API stand-in to the real api-client.
 * It fakes the browser, not our code: parsing and invalidation still run for real.
 */
export class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];

  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  closed = false;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  /** Delivers a server event the way the browser would: as a `data:` frame. */
  emit(event: ServerEvent): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
  }

  static latest(): FakeEventSource {
    const latest = FakeEventSource.instances.at(-1);
    if (!latest) throw new Error('No event stream was opened.');
    return latest;
  }
}
