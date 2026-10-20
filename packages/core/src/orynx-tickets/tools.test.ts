import { describe, expect, it } from 'vitest';
import { CreateOrynxTicketSchema, type OrynxTicketCreator } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';
import { createOrynxTicketService } from './ticket-service.ts';
import { createOrynxTicketStore } from './ticket-store.ts';
import { ticketTools, type TicketTool, type TicketToolName } from './tools.ts';

const inSession: OrynxTicketCreator = { kind: 'session', sessionId: 's-1', title: 'Fix the date test' };

async function setUp(actor: OrynxTicketCreator = inSession) {
  const service = createOrynxTicketService({
    store: createOrynxTicketStore(),
    sessions: createMemorySessionStore(),
    events: createEventBus(),
  });
  await service.create(CreateOrynxTicketSchema.parse({ title: 'Add bulk archive' }), { kind: 'you' });
  await service.create(
    CreateOrynxTicketSchema.parse({ title: 'Fix the date test', type: 'Bug', status: 'in_progress' }),
    {
      kind: 'you',
    },
  );
  const tools = ticketTools(service, actor);
  const tool = (name: TicketToolName): TicketTool => {
    const found = tools.find((candidate) => candidate.name === name);
    if (found === undefined) throw new Error(`No ${name}`);
    return found;
  };
  return { service, tools, tool };
}

describe('the ticket tools (spec 037)', () => {
  it('AC-44: are five, each with its input and what it may do, so every door can choose', async () => {
    const { tools } = await setUp();
    expect(tools.map((tool) => [tool.name, tool.access])).toEqual([
      ['list_tickets', 'read'],
      ['get_ticket', 'read'],
      ['create_ticket', 'write'],
      ['update_ticket', 'write'],
      ['delete_ticket', 'delete'],
    ]);
    expect(Object.keys(tools[2]?.input.shape ?? {})).toEqual([
      'title',
      'description',
      'type',
      'priority',
      'status',
      'dueDate',
    ]);
  });

  it('list_tickets lists the tickets, narrowed by status or text', async () => {
    const { tool } = await setUp();

    const all = await tool('list_tickets').run({});
    expect(all.error).toBeUndefined();
    expect(JSON.parse(all.text)).toEqual([
      {
        key: 'ORX-1',
        title: 'Add bulk archive',
        type: 'Task',
        priority: 'Medium',
        status: 'to_do',
        dueDate: null,
        session: null,
      },
      {
        key: 'ORX-2',
        title: 'Fix the date test',
        type: 'Bug',
        priority: 'Medium',
        status: 'in_progress',
        dueDate: null,
        session: null,
      },
    ]);
    expect(JSON.parse((await tool('list_tickets').run({ status: 'in_progress' })).text)).toHaveLength(1);
    expect(JSON.parse((await tool('list_tickets').run({ text: 'BULK' })).text)).toMatchObject([{ key: 'ORX-1' }]);
  });

  it('get_ticket reads one in full, and says when there is none', async () => {
    const { tool } = await setUp();
    expect(await tool('get_ticket').run({ key: 'ORX-1' })).toMatchObject({
      done: { action: 'read', key: 'ORX-1', title: 'Add bulk archive' },
    });
    expect(await tool('get_ticket').run({ key: 'ORX-9' })).toEqual({
      text: "There's no Orynx ticket ORX-9.",
      error: true,
    });
  });

  it('AC-28: create_ticket files a ticket as the agent that called it', async () => {
    const { tool, service } = await setUp();

    const made = await tool('create_ticket').run({ title: 'Flaky date test', type: 'Bug' });

    expect(made).toMatchObject({ done: { action: 'created', key: 'ORX-3', title: 'Flaky date test' } });
    expect(await service.get('ORX-3')).toMatchObject({ type: 'Bug', priority: 'Medium', createdBy: inSession });
  });

  it('AC-29: update_ticket changes only the fields given, and says which', async () => {
    const { tool, service } = await setUp();

    const moved = await tool('update_ticket').run({ key: 'ORX-2', status: 'in_review' });

    expect(moved).toMatchObject({
      done: { action: 'updated', key: 'ORX-2', title: 'Fix the date test', fields: ['status'], status: 'in_review' },
    });
    expect(await service.get('ORX-2')).toMatchObject({ status: 'in_review', type: 'Bug', version: 2 });
    expect((await tool('update_ticket').run({ key: 'ORX-9', priority: 'High' })).error).toBe(true);
  });

  it('delete_ticket deletes the ticket', async () => {
    const { tool, service } = await setUp();
    expect(await tool('delete_ticket').run({ key: 'ORX-1' })).toMatchObject({
      done: { action: 'deleted', key: 'ORX-1', title: 'Add bulk archive' },
    });
    expect(await service.get('ORX-1')).toBeNull();
    expect((await tool('delete_ticket').run({ key: 'ORX-1' })).error).toBe(true);
  });

  it('AC-35: checks every input itself, whatever the door checked, and changes nothing on a bad one', async () => {
    const { tool, service } = await setUp();
    for (const [name, input] of [
      ['create_ticket', { title: '' }],
      ['create_ticket', { title: 'x', status: 'blocked' }],
      ['update_ticket', { key: 'PROJ-1', status: 'done' }],
      ['get_ticket', {}],
      ['delete_ticket', { key: 'ORX-x' }],
      ['list_tickets', { status: 'nowhere' }],
    ] as const) {
      const answer = await tool(name).run(input);
      expect(answer.error).toBe(true);
      expect(answer.text).toMatch(/^Orynx couldn't take that: /);
    }
    expect((await service.list()).map((ticket) => ticket.key)).toEqual(['ORX-1', 'ORX-2']);
  });
});
