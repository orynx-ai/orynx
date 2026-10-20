import { apiRoutes, type ServerEvent, type TerminalOutput } from '@devhub/contracts';
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

  /** Delivers a server event, or a shell tab's output, the way the browser would: as a `data:` frame. */
  emit(event: ServerEvent | TerminalOutput): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
  }

  /** The newest stream still open at this path, such as a shell tab's output. */
  static at(path: string): FakeEventSource {
    const found = FakeEventSource.instances.findLast(
      (source) => !source.closed && new URL(source.url).pathname === path,
    );
    if (!found) throw new Error(`No event stream is open at ${path}.`);
    return found;
  }

  /** The newest /api/events stream; a shell tab's output streams are left out. */
  static latest(): FakeEventSource {
    const latest = FakeEventSource.instances.findLast((source) => new URL(source.url).pathname === apiRoutes.events);
    if (!latest) throw new Error('No event stream was opened.');
    return latest;
  }
}
