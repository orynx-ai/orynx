import { z } from 'zod';
import { SessionStateSchema } from './session.ts';
import { TicketColumnSchema, type TicketColumn } from './ticket-column.ts';

/**
 * Orynx's own tickets (spec 037): kept on this laptop, beside Jira's, made and changed by you or by any agent.
 * Their keys take Jira's shape with Orynx's own prefix, so a key alone says where a ticket lives, and branches,
 * chips and briefs take one as they take a Jira key.
 */

/** `ORX-12`: Orynx's prefix, a dash and a number from 1, never used twice (Q4). */
export const OrynxTicketKeySchema = z.string().regex(/^ORX-[1-9]\d{0,9}$/);

export function isOrynxKey(key: string): boolean {
  return OrynxTicketKeySchema.safeParse(key).success;
}

/** Where a ticket lives, from its key alone. */
export type TicketSource = 'jira' | 'orynx';

export function ticketSource(key: string): TicketSource {
  return isOrynxKey(key) ? 'orynx' : 'jira';
}

/** Jira's core types (Q3). A Bug is drawn in `danger` and is what Type: Bug keeps, as Jira's is. */
export const OrynxTicketTypeSchema = z.enum(['Task', 'Bug', 'Story']);
export type OrynxTicketType = z.infer<typeof OrynxTicketTypeSchema>;

/** Highest first, as Jira's default list. */
export const OrynxPrioritySchema = z.enum(['Highest', 'High', 'Medium', 'Low', 'Lowest']);
export type OrynxPriority = z.infer<typeof OrynxPrioritySchema>;

/** Each status's own name, as Jira's have one: the board's column names, which Status's filter lists (AC-20). */
export const orynxStatusNames: Record<TicketColumn, string> = {
  to_do: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

/** What a person or an agent sets (Q3); the form and the server refuse the same values with the same words (Q12d). */
export const OrynxTicketFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Add a title.').max(255, 'Keep the title to 255 characters.'),
  /** Markdown; empty when there's none. */
  description: z.string().max(32_000, 'Keep the description to 32,000 characters.'),
  type: OrynxTicketTypeSchema,
  priority: OrynxPrioritySchema,
  /** The board's column is the status: an Orynx ticket has no other workflow. */
  status: TicketColumnSchema,
  /** A calendar day; the app words it as Tickets does. */
  dueDate: z.iso.date().nullable(),
});
export type OrynxTicketFields = z.infer<typeof OrynxTicketFieldsSchema>;

/** Who made a ticket: you, an agent in an Orynx session (AC-28), or an agent outside Orynx (Q12n). */
export const OrynxTicketCreatorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('you') }),
  z.object({ kind: z.literal('session'), sessionId: z.string().min(1), title: z.string().min(1) }),
  /** By the name its MCP client gave; null when it gave none. */
  z.object({ kind: z.literal('agent'), name: z.string().min(1).max(100).nullable() }),
]);
export type OrynxTicketCreator = z.infer<typeof OrynxTicketCreatorSchema>;

/** One Orynx ticket as `tickets.json` keeps it. */
export const StoredOrynxTicketSchema = OrynxTicketFieldsSchema.extend({
  key: OrynxTicketKeySchema,
  /** Goes up by one with every change, so a save made on an older version says so (AC-16). */
  version: z.int().positive(),
  createdBy: OrynxTicketCreatorSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** When it last moved to Done; the board shows it there for 14 days after (Q6). Null when it isn't Done. */
  doneAt: z.iso.datetime().nullable(),
});
export type StoredOrynxTicket = z.infer<typeof StoredOrynxTicketSchema>;

/** One Orynx ticket as the dialog reads it, with its newest session unless that was stopped. */
export const OrynxTicketSchema = StoredOrynxTicketSchema.extend({
  session: z.object({ id: z.string().min(1), state: SessionStateSchema.exclude(['stopped']) }).nullable(),
});
export type OrynxTicket = z.infer<typeof OrynxTicketSchema>;

/** POST /api/orynx-tickets: a title is enough (AC-6). */
export const CreateOrynxTicketSchema = OrynxTicketFieldsSchema.extend({
  description: OrynxTicketFieldsSchema.shape.description.default(''),
  type: OrynxTicketTypeSchema.default('Task'),
  priority: OrynxPrioritySchema.default('Medium'),
  status: TicketColumnSchema.default('to_do'),
  dueDate: OrynxTicketFieldsSchema.shape.dueDate.default(null),
});
export type CreateOrynxTicket = z.input<typeof CreateOrynxTicketSchema>;

/**
 * PATCH /api/orynx-tickets/:key: any fields. With `version`, the save is refused when the ticket has changed since
 * (AC-16); without it, it lands on whatever is there, as the Status picker and an agent's change do.
 */
export const UpdateOrynxTicketSchema = OrynxTicketFieldsSchema.partial().extend({
  version: z.int().positive().optional(),
});
export type UpdateOrynxTicket = z.infer<typeof UpdateOrynxTicketSchema>;

export const OrynxTicketKeyParamsSchema = z.object({ key: OrynxTicketKeySchema });
export type OrynxTicketKeyParams = z.infer<typeof OrynxTicketKeyParamsSchema>;

/** GET /api/orynx-tickets/:key. */
export const OrynxTicketAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('found'), ticket: OrynxTicketSchema }),
  z.object({ result: z.literal('not_found') }),
]);
export type OrynxTicketAnswer = z.infer<typeof OrynxTicketAnswerSchema>;

/** PATCH: saved, or `changed` with the ticket as it is now, so a second save can write over it (AC-16). */
export const OrynxTicketSaveAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('saved'), ticket: OrynxTicketSchema }),
  z.object({ result: z.literal('changed'), ticket: OrynxTicketSchema }),
  z.object({ result: z.literal('not_found') }),
]);
export type OrynxTicketSaveAnswer = z.infer<typeof OrynxTicketSaveAnswerSchema>;

/** DELETE /api/orynx-tickets/:key. */
export const OrynxTicketDeleteAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('deleted') }),
  z.object({ result: z.literal('not_found') }),
]);
export type OrynxTicketDeleteAnswer = z.infer<typeof OrynxTicketDeleteAnswerSchema>;

/** GET and PUT /api/agents/access: whether agents outside Orynx may use its tickets (Q14). Off by default. */
export const AgentsAccessSchema = z.object({ enabled: z.boolean() });
export type AgentsAccess = z.infer<typeof AgentsAccessSchema>;

/** POST /api/agents/access/config: the MCP config to paste into another tool, as JSON text. It holds no token. */
export const McpConfigSchema = z.object({ config: z.string().min(1) });
export type McpConfig = z.infer<typeof McpConfigSchema>;
