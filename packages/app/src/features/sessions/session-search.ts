import { z } from 'zod';

/**
 * The Session screen's address (spec 013): which tab is open and which changed file is shown, so a reload keeps
 * them, as Home keeps its tab. Only what differs from the default is written: Changes, and the first file.
 */
export const SessionSearchSchema = z.object({
  // A value Orynx can't read opens the default instead of an error page.
  tab: z.enum(['ticket']).optional().catch(undefined),
  file: z.string().min(1).max(4096).optional().catch(undefined),
});
export type SessionSearch = z.infer<typeof SessionSearchSchema>;
