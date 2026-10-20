import { z } from 'zod';

/**
 * The Session screen's address (spec 013): which tab is open and which changed file is shown, so a reload keeps
 * them, as Home keeps its tab. The tab you picked is written (spec 042: the default depends on the session).
 */
export const SessionSearchSchema = z.object({
  // A value Orynx can't read opens the default instead of an error page. `ticket` is the Context tab's old name.
  tab: z
    .enum(['context', 'ticket', 'changes', 'ports'])
    .transform((tab) => (tab === 'ticket' ? 'context' : tab))
    .optional()
    .catch(undefined),
  file: z.string().min(1).max(4096).optional().catch(undefined),
});
export type SessionSearch = z.infer<typeof SessionSearchSchema>;
