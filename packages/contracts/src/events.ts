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
  /**
   * Files in a session's worktree may have changed: one of Claude's edits or commands ended (spec 013). Refetch
   * that session's changes. It carries the id only, never a path.
   */
  z.object({ type: z.literal('session.files.changed'), sessionId: z.string().min(1) }),
  /** Your shell tabs in a session's Terminal changed: output came, a command ended, a tab came or went (spec 036). */
  z.object({ type: z.literal('session.terminal.changed'), sessionId: z.string().min(1) }),
  /** A setting from Settings › Coding agent, Repositories or Inbox rules was saved; refetch them (spec 005). */
  z.object({ type: z.literal('settings.changed') }),
  /**
   * A sync ended, the cache was cleared or a tool's rows went; refetch GET /api/inbox (spec 007) and
   * GET /api/tickets (spec 008), whose sprint syncs with the inbox.
   */
  z.object({ type: z.literal('inbox.changed') }),
  /**
   * An Orynx ticket was made, changed or deleted, by you or an agent (spec 037); refetch GET /api/tickets, the
   * ticket and search.
   */
  z.object({ type: z.literal('tickets.changed') }),
  /** A skill was added, saved or deleted in Settings › Skills; refetch GET /api/skills (spec 023). */
  z.object({ type: z.literal('skills.changed') }),
  /** A notification came, was read, or an approval it holds ended; refetch GET /api/notifications (spec 029). */
  z.object({ type: z.literal('notifications.changed') }),
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;
export type ServerEventType = ServerEvent['type'];
