import {
  apiRoutes,
  ServerEventSchema,
  TerminalOutputSchema,
  tokenQueryParam,
  type ServerEvent,
  type TerminalOutput,
} from '@devhub/contracts';
import { pathFor } from './endpoints/terminal.ts';

/** The subset of the browser EventSource API we use, so a desktop host or a test can pass its own. */
export interface EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;
  close(): void;
}
export type EventSourceConstructor = new (url: string) => EventSourceLike;

export interface SubscribeOptions {
  baseURL: string;
  token: string;
  onEvent: (event: ServerEvent) => void;
  /** Called when the stream drops; EventSource reconnects by itself. */
  onError?: () => void;
  EventSource?: EventSourceConstructor;
}

/** Parses one `data:` frame. Unknown or malformed events are dropped, never thrown. */
export function parseServerEvent(data: string): ServerEvent | null {
  try {
    const result = ServerEventSchema.safeParse(JSON.parse(data));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Opens a server-sent event stream at `path`, the token in its URL. Returns a function that closes it. */
function openStream(options: Omit<SubscribeOptions, 'onEvent'>, path: string, onData: (data: string) => void) {
  const Source: EventSourceConstructor | undefined =
    options.EventSource ?? ('EventSource' in globalThis ? globalThis.EventSource : undefined);
  if (Source === undefined) throw new Error('EventSource is not available in this environment.');

  const url = new URL(path, options.baseURL);
  url.searchParams.set(tokenQueryParam, options.token);

  const source = new Source(url.toString());
  source.onmessage = (message) => {
    onData(message.data);
  };
  source.onerror = () => options.onError?.();

  return () => {
    source.close();
  };
}

/** Opens GET /api/events. Returns a function that closes the stream. */
export function subscribeToEvents(options: SubscribeOptions): () => void {
  return openStream(options, apiRoutes.events, (data) => {
    const event = parseServerEvent(data);
    if (event) options.onEvent(event);
  });
}

/**
 * Opens a shell tab's output (spec 038): first all it keeps, then what the shell writes. After a drop, EventSource
 * reconnects by itself and the replay comes again. Returns a function that closes it.
 */
export function subscribeToTerminalOutput(
  options: Omit<SubscribeOptions, 'onEvent'> & { id: string; tabId: string; onOutput: (frame: TerminalOutput) => void },
): () => void {
  return openStream(options, pathFor(apiRoutes.sessionTerminalOutput, options.id, options.tabId), (data) => {
    try {
      const frame = TerminalOutputSchema.safeParse(JSON.parse(data));
      if (frame.success) options.onOutput(frame.data);
    } catch {
      // A malformed frame is dropped, as on /api/events.
    }
  });
}
