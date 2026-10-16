import { z } from 'zod';

/**
 * Everything the server pushes over GET /api/events. The app turns each event into
 * TanStack Query invalidations; it never patches client state by hand.
 */
export const ServerEventSchema = z.discriminatedUnion('type', [
  /** Sent once when the stream opens, so the client knows it is live. */
  z.object({ type: z.literal('hello'), at: z.iso.datetime() }),
  /** A connection or the agent changed; refetch GET /api/status. */
  z.object({ type: z.literal('status.changed') }),
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;
export type ServerEventType = ServerEvent['type'];
