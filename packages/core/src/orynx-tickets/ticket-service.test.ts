import { describe, expect, it } from 'vitest';
import { CreateOrynxTicketSchema, type ServerEvent } from '@devhub/contracts';
import { makeSessionSummary } from '@devhub/contracts/testing';
import { createEventBus } from '../events/event-bus.ts';
import { createMemorySessionStore } from '../sessions/session-store.ts';
import { createOrynxTicketService } from './ticket-service.ts';
import { createOrynxTicketStore } from './ticket-store.ts';

function setUp(sessions = createMemorySessionStore()) {
  const events = createEventBus();
  const heard: ServerEvent[] = [];
  events.subscribe((event) => heard.push(event));
  const service = createOrynxTicketService({ store: createOrynxTicketStore(), sessions, events });
  return { service, heard };
}

const you = { kind: 'you' } as const;
const fields = (title: string) => CreateOrynxTicketSchema.parse({ title });

describe('the Orynx ticket service', () => {
  it('AC-32: says tickets.changed after every change that lands, and only then', async () => {
    const { service, heard } = setUp();

    await service.create(fields('Add bulk archive'), you);
    await service.update('ORX-1', { status: 'in_review' });
    await service.update('ORX-1', { status: 'done', version: 1 });
    await service.update('ORX-9', { status: 'done' });
    await service.remove('ORX-1');
    await service.remove('ORX-1');

    expect(heard).toEqual([{ type: 'tickets.changed' }, { type: 'tickets.changed' }, { type: 'tickets.changed' }]);
  });

  it('AC-24: each ticket comes with its newest session that wasn’t stopped, as Jira’s do', async () => {
    const sessions = createMemorySessionStore([
      makeSessionSummary({
        id: 'old',
        state: 'stopped',
        source: { kind: 'jira', key: 'ORX-1' },
        updatedAt: '2026-10-20T08:00:00.000Z',
      }),
      makeSessionSummary({
        id: 'new',
        state: 'working',
        source: { kind: 'jira', key: 'ORX-1' },
        updatedAt: '2026-10-20T09:00:00.000Z',
      }),
    ]);
    const { service } = setUp(sessions);
    await service.create(fields('Add bulk archive'), you);
    await service.create(fields('Fix the date test'), you);

    expect((await service.get('ORX-1'))?.session).toEqual({ id: 'new', state: 'working' });
    expect((await service.list()).map((ticket) => ticket.session)).toEqual([{ id: 'new', state: 'working' }, null]);
  });

  it('AC-16: a stale save comes back as changed, with the ticket as it is now', async () => {
    const { service } = setUp();
    await service.create(fields('Add bulk archive'), you);
    await service.update('ORX-1', { priority: 'High' });

    const answer = await service.update('ORX-1', { title: 'Archive', version: 1 });

    expect(answer).toMatchObject({
      result: 'changed',
      ticket: { title: 'Add bulk archive', version: 2, session: null },
    });
  });

  it('AC-18: a deleted ticket is gone; deleting it again says so', async () => {
    const { service } = setUp();
    await service.create(fields('Add bulk archive'), you);

    expect(await service.remove('ORX-1')).toEqual({ result: 'deleted' });
    expect(await service.get('ORX-1')).toBeNull();
    expect(await service.remove('ORX-1')).toEqual({ result: 'not_found' });
    expect(await service.update('ORX-1', { status: 'done' })).toEqual({ result: 'not_found' });
  });
});
