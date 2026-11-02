import { z } from 'zod';
import { JiraIssueKeySchema, JiraLinkSchema, JiraProjectKeySchema } from './jira.ts';
import { OrynxTicketFieldsSchema } from './orynx-tickets.ts';
import { TicketColumnSchema } from './ticket-column.ts';

/**
 * A new ticket in Jira from Tickets' New and each column's + (spec 019): Orynx's first new Jira issue, in the project
 * and sprint Tickets shows. Nothing here is cached: the types are read each time the dialog opens on Jira.
 */

/** One issue type a new ticket can take (Q2): its create screen's priorities and Jira's default, and its due date. */
export const JiraTicketTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** In Jira's order; empty when the type's create screen has no priority. */
  priorities: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })),
  defaultPriorityId: z.string().min(1).nullable(),
  /** The type's create screen has a due date. */
  dueDate: z.boolean(),
});
export type JiraTicketType = z.infer<typeof JiraTicketTypeSchema>;

/** GET /api/tickets/jira/types?project=MAI: the project's types without sub-tasks, asked of Jira now. */
export const JiraTicketTypesSchema = z.object({ types: z.array(JiraTicketTypeSchema) });
export type JiraTicketTypes = z.infer<typeof JiraTicketTypesSchema>;

export const JiraTicketTypesQuerySchema = z.object({ project: JiraProjectKeySchema });
export type JiraTicketTypesQuery = z.infer<typeof JiraTicketTypesQuerySchema>;

/** POST /api/tickets/jira: what the form sends. Title and description keep Orynx's limits and words (AC-13). */
export const NewJiraTicketSchema = OrynxTicketFieldsSchema.pick({
  title: true,
  description: true,
  dueDate: true,
}).extend({
  projectKey: JiraProjectKeySchema,
  /** The sprint Tickets shows; null for No sprint. */
  sprintId: z.int().positive().nullable(),
  /** The column whose + opened the form, or To do. */
  column: TicketColumnSchema,
  typeId: z.string().min(1),
  /** Null when the type has no priority. */
  priorityId: z.string().min(1).nullable(),
});
export type NewJiraTicket = z.infer<typeof NewJiraTicketSchema>;

/** Jira's own words, at most 500 characters, as spec 044 keeps them. */
const JiraWordsSchema = z.string().min(1).max(500);

/**
 * What came of it (AC-3, AC-9 to AC-11): made; made, but Jira didn't add it to the sprint or move it to the column,
 * with Jira's words (Q5: kept, never retried or deleted); refused in Jira's words, with nothing made; or no answer.
 */
export const NewJiraTicketAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('made'), key: JiraIssueKeySchema, url: JiraLinkSchema }),
  z.object({
    result: z.literal('made_but'),
    key: JiraIssueKeySchema,
    url: JiraLinkSchema,
    missed: z.enum(['sprint', 'column']),
    reason: JiraWordsSchema,
  }),
  z.object({ result: z.literal('refused'), reason: JiraWordsSchema }),
  z.object({ result: z.literal('unreachable') }),
]);
export type NewJiraTicketAnswer = z.infer<typeof NewJiraTicketAnswerSchema>;
