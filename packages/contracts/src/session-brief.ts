import { z } from 'zod';

/**
 * GET /api/sessions/:id/brief: exactly what Orynx sent Claude at the start, as it saved it (spec 011, Q5), so
 * Claude's progress can show it (the user's call, 19 Oct 2026). `text` is null before anything was sent.
 */
export const SessionBriefSchema = z.object({ text: z.string().nullable() });
export type SessionBrief = z.infer<typeof SessionBriefSchema>;
