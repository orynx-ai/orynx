import { apiRoutes, ServerEventSchema, tokenQueryParam, type ServerEvent } from '@devhub/contracts';

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

/** Opens GET /api/events. Returns a function that closes the stream. */
export function subscribeToEvents(options: SubscribeOptions): () => void {
  const Source: EventSourceConstructor | undefined =
    options.EventSource ?? ('EventSource' in globalThis ? globalThis.EventSource : undefined);
  if (Source === undefined) throw new Error('EventSource is not available in this environment.');

  const url = new URL(apiRoutes.events, options.baseURL);
  url.searchParams.set(tokenQueryParam, options.token);

  const source = new Source(url.toString());
  source.onmessage = (message) => {
    const event = parseServerEvent(message.data);
    if (event) options.onEvent(event);
  };
  source.onerror = () => options.onError?.();

  return () => {
    source.close();
  };
}
