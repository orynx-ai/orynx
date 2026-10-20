import { describe, expect, it } from 'vitest';
import {
  AgentsAccessSchema,
  apiPaths,
  apiRoutes,
  CreateOrynxTicketSchema,
  isOrynxKey,
  McpConfigSchema,
  OrynxTicketAnswerSchema,
  OrynxTicketDeleteAnswerSchema,
  OrynxTicketKeyParamsSchema,
  OrynxTicketSaveAnswerSchema,
  OrynxTicketSchema,
  ServerEventSchema,
  SessionTicketSchema,
  TicketSchema,
  TicketsSchema,
  ticketSource,
  UpdateOrynxTicketSchema,
} from './index.ts';
import { makeOrynxTicket, makeSessionTicket, makeTicket, makeTickets } from './testing.ts';

describe('Orynx ticket keys', () => {
  it('a key alone says where the ticket lives: ORX- and a number is Orynx, anything else Jira', () => {
    expect(isOrynxKey('ORX-1')).toBe(true);
    expect(isOrynxKey('ORX-2841')).toBe(true);
    expect(ticketSource('ORX-12')).toBe('orynx');
    expect(ticketSource('PROJ-1423')).toBe('jira');
    for (const key of ['ORX-0', 'ORX-x', 'orx-1', 'ORX-', 'ORXA-1', 'PROJ-1']) expect(isOrynxKey(key)).toBe(false);
  });

  it('AC-35: the routes take an Orynx key only', () => {
    expect(OrynxTicketKeyParamsSchema.safeParse({ key: 'ORX-3' }).success).toBe(true);
    expect(OrynxTicketKeyParamsSchema.safeParse({ key: 'PROJ-1' }).success).toBe(false);
    expect(OrynxTicketKeyParamsSchema.safeParse({ key: 'ORX-x' }).success).toBe(false);
  });
});

describe('CreateOrynxTicketSchema', () => {
  it('AC-6: a title alone makes a Task of Medium priority in To do, with no description or due date', () => {
    expect(CreateOrynxTicketSchema.parse({ title: '  Add bulk archive  ' })).toEqual({
      title: 'Add bulk archive',
      description: '',
      type: 'Task',
      priority: 'Medium',
      status: 'to_do',
      dueDate: null,
    });
  });

  it("AC-10, AC-35: refuses an empty title, an over-long title or description, and an unknown status, in Q12d's words", () => {
    const words = (body: unknown) =>
      CreateOrynxTicketSchema.safeParse(body).error?.issues.map((issue) => issue.message);
    expect(words({ title: '   ' })).toEqual(['Add a title.']);
    expect(words({ title: 'x'.repeat(256) })).toEqual(['Keep the title to 255 characters.']);
    expect(words({ title: 'x'.repeat(255), description: 'y'.repeat(32_001) })).toEqual([
      'Keep the description to 32,000 characters.',
    ]);
    expect(CreateOrynxTicketSchema.safeParse({ title: 'x', status: 'blocked' }).success).toBe(false);
    expect(CreateOrynxTicketSchema.safeParse({ title: 'x', type: 'Epic' }).success).toBe(false);
    expect(CreateOrynxTicketSchema.safeParse({ title: 'x', dueDate: '24 Oct' }).success).toBe(false);
  });
});

describe('UpdateOrynxTicketSchema', () => {
  it('AC-14, AC-16: changes any fields, with the version it was opened at or none at all', () => {
    expect(UpdateOrynxTicketSchema.parse({ status: 'in_review' })).toEqual({ status: 'in_review' });
    expect(UpdateOrynxTicketSchema.parse({ priority: 'High', version: 3 })).toEqual({ priority: 'High', version: 3 });
    expect(UpdateOrynxTicketSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(UpdateOrynxTicketSchema.safeParse({ title: '' }).success).toBe(false);
  });
});

describe('OrynxTicketSchema', () => {
  it('AC-13, AC-28, AC-40: says who made it: you, an agent in a session, or an agent outside Orynx', () => {
    expect(OrynxTicketSchema.parse(makeOrynxTicket()).createdBy).toEqual({ kind: 'you' });
    const bySession = makeOrynxTicket({
      createdBy: { kind: 'session', sessionId: 's-1', title: 'Fix the date test' },
    });
    expect(OrynxTicketSchema.parse(bySession).createdBy.kind).toBe('session');
    expect(
      OrynxTicketSchema.parse(makeOrynxTicket({ createdBy: { kind: 'agent', name: 'Cursor' } })).createdBy,
    ).toEqual({
      kind: 'agent',
      name: 'Cursor',
    });
    expect(
      OrynxTicketSchema.safeParse({ ...makeOrynxTicket(), createdBy: { kind: 'agent', name: 'x'.repeat(101) } })
        .success,
    ).toBe(false);
  });

  it('answers a read, a save and a delete, or why not', () => {
    const ticket = makeOrynxTicket();
    expect(OrynxTicketAnswerSchema.parse({ result: 'found', ticket }).result).toBe('found');
    expect(OrynxTicketAnswerSchema.parse({ result: 'not_found' }).result).toBe('not_found');
    expect(OrynxTicketSaveAnswerSchema.parse({ result: 'changed', ticket }).result).toBe('changed');
    expect(OrynxTicketDeleteAnswerSchema.parse({ result: 'deleted' }).result).toBe('deleted');
  });
});

describe('Orynx tickets on the board', () => {
  it('AC-1: an Orynx ticket is a board row with no link', () => {
    expect(TicketSchema.parse(makeTicket({ key: 'ORX-1', url: null })).url).toBeNull();
  });

  it('AC-34: the answer says which unreadable file was kept aside, none by default', () => {
    expect(TicketsSchema.parse(makeTickets()).orynx).toEqual({ kept: null });
    const kept = makeTickets({ orynx: { kept: 'tickets-20261020-081233.unreadable.json' } });
    expect(TicketsSchema.parse(kept).orynx.kept).toBe('tickets-20261020-081233.unreadable.json');
  });

  it('AC-19: the Ticket tab says when the ticket was deleted, never for a session saved before', () => {
    const { deleted: _, ...saved } = makeSessionTicket();
    expect(SessionTicketSchema.parse(saved).deleted).toBe(false);
    expect(SessionTicketSchema.parse(makeSessionTicket({ deleted: true })).deleted).toBe(true);
  });
});

describe('Orynx tickets on the wire', () => {
  it('has its routes, the agents door and its event', () => {
    expect(apiRoutes.orynxTickets).toBe('/api/orynx-tickets');
    expect(apiRoutes.orynxTicket).toBe('/api/orynx-tickets/:key');
    expect(apiRoutes.agentsAccess).toBe('/api/agents/access');
    expect(apiRoutes.agentsAccessConfig).toBe('/api/agents/access/config');
    expect(apiPaths.mcp).toBe('/mcp');
    expect(ServerEventSchema.parse({ type: 'tickets.changed' })).toEqual({ type: 'tickets.changed' });
  });

  it('AC-39, AC-40: the agents door is on or off, and its config is text to paste', () => {
    expect(AgentsAccessSchema.parse({ enabled: false })).toEqual({ enabled: false });
    expect(McpConfigSchema.safeParse({ config: '' }).success).toBe(false);
  });
});
