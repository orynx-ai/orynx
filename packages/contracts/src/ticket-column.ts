import { z } from 'zod';

/**
 * The board's four columns. To do and Done follow Jira's status categories; an In progress status sits in
 * In review when the sprint's board puts it in a later in-progress column than the first (spec 008, Q2).
 * Its own file, because both tickets and sessions (spec 013's Ticket tab) use it, and tickets reads sessions.
 */
export const TicketColumnSchema = z.enum(['to_do', 'in_progress', 'in_review', 'done']);
export type TicketColumn = z.infer<typeof TicketColumnSchema>;
