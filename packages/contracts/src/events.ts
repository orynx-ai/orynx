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
  /** A session started, changed state or ended; refetch GET /api/sessions. */
  z.object({ type: z.literal('sessions.changed') }),
  /** A session's steps changed; refetch GET /api/sessions/:id for that session only (spec 011). */
  z.object({ type: z.literal('session.changed'), sessionId: z.string().min(1) }),
  /** A setting from Settings › Coding agent, Repositories or Inbox rules was saved; refetch them (spec 005). */
  z.object({ type: z.literal('settings.changed') }),
  /**
   * A sync ended, the cache was cleared or a tool's rows went; refetch GET /api/inbox (spec 007) and
   * GET /api/tickets (spec 008), whose sprint syncs with the inbox.
   */
  z.object({ type: z.literal('inbox.changed') }),
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;
export type ServerEventType = ServerEvent['type'];
