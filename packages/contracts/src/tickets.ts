import { z } from 'zod';
import { InboxToolStateSchema } from './inbox.ts';
import { JiraIssueKeySchema, JiraLinkSchema, JiraProjectKeySchema } from './jira.ts';
import { SessionStateSchema } from './session.ts';
import { TicketColumnSchema } from './ticket-column.ts';

/**
 * Tickets: your current Jira sprint as a board or a list (spec 008). The server sends data, never words
 * that change with the clock: the app writes "Due Tue" and "Overdue · 2 d" from the due day with the
 * laptop's calendar, as Home does.
 */

export { TicketColumnSchema, type TicketColumn } from './ticket-column.ts';

/** How many of the card's three priority bars are filled, from the site's own priority order (Q7a). */
export const PriorityLevelSchema = z.enum(['high', 'medium', 'low']);
export type PriorityLevel = z.infer<typeof PriorityLevelSchema>;

/** One issue in the sprint. */
export const TicketSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]*-\d+$/),
  title: z.string().min(1),
  /** The issue on its Jira Cloud site: https, and that host only. */
  url: JiraLinkSchema,
  /** The status's own name, shown as it is in the list ("Code Review"). */
  status: z.string(),
  column: TicketColumnSchema,
  /** The type's own name: "Story", "Bug", "Sub-task". */
  type: z.string().min(1),
  /** The type is named "Bug", in any case (spec 007, Q2f): drawn in `danger`, and what Type: Bug keeps. */
  bug: z.boolean(),
  /**
   * The priority's own name ("Highest", "P2"), its bars, and its place in the site's list, highest first (spec
   * 020: Priority's filter lists them so); null when the issue has none. `rank` is left out when the site's list
   * doesn't hold it, or the sprint was kept before spec 020.
   */
  priority: z
    .object({ name: z.string().min(1), level: PriorityLevelSchema, rank: z.int().nonnegative().optional() })
    .nullable(),
  /** A calendar day: the app works out "Due Tue" or "Overdue" in the laptop's calendar. */
  dueDate: z.iso.date().nullable(),
  /** Jira's display name, and whether it's you; null when nobody is assigned. */
  assignee: z.object({ name: z.string().min(1), mine: z.boolean() }).nullable(),
  /** The newest Claude session on this ticket, unless it was stopped (Q4c). */
  session: z.object({ id: z.string().min(1), state: SessionStateSchema.exclude(['stopped']) }).nullable(),
});
export type Ticket = z.infer<typeof TicketSchema>;

/** The active sprint that holds most of your issues (Q1). */
export const SprintSchema = z.object({
  id: z.int().positive(),
  /** The sprint's own name: "Sprint 42". */
  name: z.string().min(1),
  /** When Jira says the sprint ends; null when it doesn't say. */
  endsAt: z.iso.datetime().nullable(),
  /** The board's project; null when the board covers more than one project (Q9a). */
  projectKey: JiraProjectKeySchema.nullable(),
});
export type Sprint = z.infer<typeof SprintSchema>;

/**
 * Which sprint Tickets shows (spec 020): your sprint (no project, the default: the active sprint that holds
 * most of your tickets), a project's current sprint (a project, no sprint: it follows the project as sprints
 * roll over), one sprint of a project, held until another is picked, or `none`: the tickets in no sprint that
 * aren't Done, the project's or, with no project, your own (AC-39).
 */
export const TicketsChoiceSchema = z
  .object({
    projectKey: JiraProjectKeySchema.nullable(),
    sprintId: z.union([z.int().positive(), z.literal('none')]).nullable(),
  })
  .refine((choice) => choice.projectKey !== null || choice.sprintId === null || choice.sprintId === 'none', {
    message: 'A sprint is picked with its project.',
  });
export type TicketsChoice = z.infer<typeof TicketsChoiceSchema>;

/** Your sprint, until a project is picked. */
export const defaultTicketsChoice: TicketsChoice = { projectKey: null, sprintId: null };

/** GET /api/tickets: the sprint and every ticket in it, in Jira's rank order. Answers from the cache. */
export const TicketsSchema = z.object({
  /** Where Jira's sprint read stands, in the inbox's terms, so a failed read says so in 007's words. */
  jira: InboxToolStateSchema,
  /**
   * Null when Jira isn't connected, hasn't answered yet, or no active sprint holds a ticket of yours; and for
   * No sprint, whose tickets come without one (spec 020).
   */
  sprint: SprintSchema.nullable(),
  tickets: z.array(TicketSchema),
  /** The sprint held more tickets than DevHub keeps, so these are the first in rank order (Q8h). */
  truncated: z.boolean(),
  /** Which sprint was asked for (spec 020); while its first sync runs, Jira's state is `syncing`. */
  choice: TicketsChoiceSchema.default(defaultTicketsChoice),
});
export type Tickets = z.infer<typeof TicketsSchema>;

/** One of a project's open sprints, for Tickets' Sprint menu (spec 020, AC-26). */
export const OpenSprintSchema = z.object({
  id: z.int().positive(),
  name: z.string().min(1),
  state: z.enum(['active', 'future']),
  /** When Jira says it starts and ends; null when it doesn't say. */
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
});
export type OpenSprint = z.infer<typeof OpenSprintSchema>;

/** GET /api/tickets/sprints?project=WEB: the project's active sprints ending soonest, then its future ones. Asks Jira. */
export const OpenSprintsSchema = z.object({ sprints: z.array(OpenSprintSchema) });
export type OpenSprints = z.infer<typeof OpenSprintsSchema>;

export const OpenSprintsQuerySchema = z.object({ project: JiraProjectKeySchema });
export type OpenSprintsQuery = z.infer<typeof OpenSprintsQuerySchema>;

/**
 * One ticket in full, for the ticket dialog (spec 022, Q8): read from Jira each time the dialog opens, and kept
 * nowhere. Its column follows the sprint's board when Tickets holds it, else the status's category. The
 * description and comments are Markdown; times are Jira's, made ISO.
 */
export const TicketDetailSchema = z.object({
  key: JiraIssueKeySchema,
  /** The issue on its Jira Cloud site: https, and that host only. */
  url: JiraLinkSchema,
  /** The summary; empty when Jira gives none. */
  title: z.string(),
  type: z.string().min(1).nullable(),
  status: z.object({ name: z.string().min(1), column: TicketColumnSchema }).nullable(),
  /** The priority's own name ("High", "P2"). */
  priority: z.string().min(1).nullable(),
  assignee: z.string().min(1).nullable(),
  reporter: z.string().min(1).nullable(),
  dueDate: z.iso.date().nullable(),
  labels: z.array(z.string().min(1)),
  created: z.iso.datetime().nullable(),
  updated: z.iso.datetime().nullable(),
  description: z.string().nullable(),
  /** Each linked issue, named by the link's own words from this ticket's side ("blocks", "is cloned by"). */
  links: z.array(
    z.object({
      relation: z.string().min(1),
      key: JiraIssueKeySchema,
      title: z.string(),
      status: z.string().nullable(),
    }),
  ),
  /** The last 20, oldest first. */
  comments: z.array(z.object({ author: z.string().min(1), created: z.iso.datetime().nullable(), body: z.string() })),
  /** The newest Claude session on this ticket, unless it was stopped, for Open session. */
  session: z.object({ id: z.string().min(1), state: SessionStateSchema.exclude(['stopped']) }).nullable(),
});
export type TicketDetail = z.infer<typeof TicketDetailSchema>;

/**
 * GET /api/tickets/:key: the ticket, or why there's none: Jira can't find it or you can't see it, Jira isn't
 * connected, or Jira didn't answer (AC-44). Asks Jira every time.
 */
export const TicketDetailAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('found'), ticket: TicketDetailSchema }),
  z.object({ result: z.literal('not_found') }),
  z.object({ result: z.literal('not_connected') }),
  z.object({ result: z.literal('unreachable') }),
]);
export type TicketDetailAnswer = z.infer<typeof TicketDetailAnswerSchema>;

export const TicketKeyParamsSchema = z.object({ key: JiraIssueKeySchema });
export type TicketKeyParams = z.infer<typeof TicketKeyParamsSchema>;
