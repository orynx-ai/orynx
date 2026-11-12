import { z } from 'zod';

/**
 * GET /api/standup (spec 057, C): a draft of your standup for the last working day, filled from a template, never
 * posted. `missing` names a source Orynx couldn't read, so its part of the draft is missing (AC-31).
 */
export const StandupSchema = z.object({
  /** The last working day, as a calendar day on the laptop's clock: Friday on a Monday. */
  day: z.iso.date(),
  text: z.string().min(1),
  missing: z.array(z.enum(['github', 'jira'])),
});
export type Standup = z.infer<typeof StandupSchema>;
