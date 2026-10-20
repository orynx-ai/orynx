import { z } from 'zod';
import {
  CreateOrynxTicketSchema,
  OrynxTicketFieldsSchema,
  OrynxTicketKeySchema,
  TicketColumnSchema,
  type OrynxTicket,
  type OrynxTicketCreator,
  type OrynxTicketFields,
  type TicketColumn,
} from '@devhub/contracts';
import type { OrynxTicketService } from './ticket-service.ts';

/**
 * Orynx's ticket tools (spec 037), defined once and naming no agent, so that any agent can use Orynx's own tickets:
 * a session's agent mounts them through its adapter, and agents outside Orynx reach them through the MCP server.
 * Each door decides by `access` what it offers: an Ask session reads only, and outside Orynx nothing deletes.
 */

export type TicketToolAccess = 'read' | 'write' | 'delete';

export type TicketToolName = 'list_tickets' | 'get_ticket' | 'create_ticket' | 'update_ticket' | 'delete_ticket';

/** What a call did, for the session's step (AC-28, AC-29): data, which the app words. */
export type TicketToolDone =
  | { action: 'listed' }
  | { action: 'read' | 'created' | 'deleted'; key: string; title: string }
  | { action: 'updated'; key: string; title: string; fields: (keyof OrynxTicketFields)[]; status: TicketColumn | null };

/** A call's answer: text for the agent, and what it did, or `error` with no change made. */
export type TicketToolAnswer =
  { text: string; done: TicketToolDone; error?: undefined } | { text: string; error: true };

export interface TicketTool {
  name: TicketToolName;
  /** For the agent: what the tool does and when to use it. */
  description: string;
  input: z.ZodObject;
  access: TicketToolAccess;
  /** Checks the input itself, whatever the door already checked. */
  run(input: unknown): Promise<TicketToolAnswer>;
}

const statuses = 'to_do, in_progress, in_review or done';

const ListInputSchema = z.object({
  status: TicketColumnSchema.optional().describe(`Only tickets in this status: ${statuses}.`),
  text: z.string().max(200).optional().describe('Only tickets whose key or title holds this, in any case.'),
});
const KeyInputSchema = z.object({ key: OrynxTicketKeySchema.describe('The ticket’s key, like ORX-12.') });
const UpdateInputSchema = OrynxTicketFieldsSchema.partial().extend({ key: KeyInputSchema.shape.key });

/** A ticket in a list, as an agent gets it. */
function summary({ key, title, type, priority, status, dueDate, session }: OrynxTicket) {
  return { key, title, type, priority, status, dueDate, session };
}

/** One ticket in full, as an agent gets it. */
function shown(ticket: OrynxTicket) {
  return { ...summary(ticket), description: ticket.description };
}

function refused(error: z.ZodError): TicketToolAnswer {
  return { text: `Orynx couldn't take that: ${z.prettifyError(error)}`, error: true };
}

function noTicket(key: string): TicketToolAnswer {
  return { text: `There's no Orynx ticket ${key}.`, error: true };
}

/** The tools, each acting as `actor`: you, an agent in a session, or an agent outside Orynx. */
export function ticketTools(tickets: OrynxTicketService, actor: OrynxTicketCreator): TicketTool[] {
  return [
    {
      name: 'list_tickets',
      description:
        "Lists the person's Orynx tickets, oldest first: key, title, type, priority, status, due date and any Orynx " +
        'session working on it. Orynx tickets are kept by Orynx itself, beside Jira; their keys start ORX-.',
      input: ListInputSchema,
      access: 'read',
      async run(input) {
        const parsed = ListInputSchema.safeParse(input);
        if (!parsed.success) return refused(parsed.error);
        const { status, text } = parsed.data;
        const wanted = text?.trim().toLowerCase() ?? '';
        const found = (await tickets.list()).filter(
          (ticket) =>
            (status === undefined || ticket.status === status) &&
            (wanted === '' || ticket.key.toLowerCase().includes(wanted) || ticket.title.toLowerCase().includes(wanted)),
        );
        return {
          text: JSON.stringify(found.map(summary)),
          done: { action: 'listed' },
        };
      },
    },
    {
      name: 'get_ticket',
      description: 'Reads one Orynx ticket in full, with its Markdown description.',
      input: KeyInputSchema,
      access: 'read',
      async run(input) {
        const parsed = KeyInputSchema.safeParse(input);
        if (!parsed.success) return refused(parsed.error);
        const ticket = await tickets.get(parsed.data.key);
        if (ticket === null) return noTicket(parsed.data.key);
        return { text: JSON.stringify(shown(ticket)), done: { action: 'read', key: ticket.key, title: ticket.title } };
      },
    },
    {
      name: 'create_ticket',
      description:
        'Files a new Orynx ticket for the person. A title is enough; the type is Task, Bug or Story (Task by default), ' +
        `the priority Highest, High, Medium, Low or Lowest (Medium by default), the status ${statuses} (to_do by ` +
        'default), the due date YYYY-MM-DD or null, and the description Markdown. Answers with the new key.',
      input: CreateOrynxTicketSchema,
      access: 'write',
      async run(input) {
        const parsed = CreateOrynxTicketSchema.safeParse(input);
        if (!parsed.success) return refused(parsed.error);
        const ticket = await tickets.create(parsed.data, actor);
        return {
          text: JSON.stringify(shown(ticket)),
          done: { action: 'created', key: ticket.key, title: ticket.title },
        };
      },
    },
    {
      name: 'update_ticket',
      description:
        'Changes an Orynx ticket: give its key and only the fields to change. Moving it to another column is a change ' +
        `of status (${statuses}).`,
      input: UpdateInputSchema,
      access: 'write',
      async run(input) {
        const parsed = UpdateInputSchema.safeParse(input);
        if (!parsed.success) return refused(parsed.error);
        const { key, ...change } = parsed.data;
        const saved = await tickets.update(key, change);
        if (saved.result === 'not_found') return noTicket(key);
        const fields = (Object.keys(change) as (keyof OrynxTicketFields)[]).filter(
          (field) => change[field] !== undefined,
        );
        return {
          text: JSON.stringify(shown(saved.ticket)),
          done: {
            action: 'updated',
            key,
            title: saved.ticket.title,
            fields,
            status: change.status ?? null,
          },
        };
      },
    },
    {
      name: 'delete_ticket',
      description: 'Deletes an Orynx ticket for good. The person is asked first, every time.',
      input: KeyInputSchema,
      access: 'delete',
      async run(input) {
        const parsed = KeyInputSchema.safeParse(input);
        if (!parsed.success) return refused(parsed.error);
        const ticket = await tickets.get(parsed.data.key);
        if (ticket === null || (await tickets.remove(ticket.key)).result === 'not_found') {
          return noTicket(parsed.data.key);
        }
        return { text: `Deleted ${ticket.key}.`, done: { action: 'deleted', key: ticket.key, title: ticket.title } };
      },
    },
  ];
}
