import { z } from 'zod';

/**
 * Where a Claude session is, as the sidebar shows it (spec: "Session states").
 * Each state is shown with an icon shape, a word and a colour, never colour alone.
 */
export const SessionStateSchema = z.enum(['working', 'needs_you', 'done', 'pr_open', 'stopped']);
export type SessionState = z.infer<typeof SessionStateSchema>;

/** The five steps of a session (spec: "Agent sessions"). */
export const SessionStepSchema = z.enum(['plan', 'build', 'test', 'review', 'pull_request']);
export type SessionStep = z.infer<typeof SessionStepSchema>;

/** What a session was started from: shown as `PROJ-1423` or `PR #2836` under its title. */
export const SessionSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('jira'), key: z.string().min(1) }),
  z.object({ kind: z.literal('pull_request'), number: z.int().positive() }),
]);
export type SessionSource = z.infer<typeof SessionSourceSchema>;

/** One row in the sidebar and in the full session list. */
export const SessionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  state: SessionStateSchema,
  /** Null when the session was started from the composer without a ticket or pull request. */
  source: SessionSourceSchema.nullable(),
  /** Last activity; lists are ordered by it, newest first. */
  updatedAt: z.iso.datetime(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/** GET /api/sessions: sessions with the newest activity first. */
export const SessionListSchema = z.object({ sessions: z.array(SessionSummarySchema) });
export type SessionList = z.infer<typeof SessionListSchema>;

/** Query string of GET /api/sessions. Leave `limit` out for every session. */
export const SessionListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() });
export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;
