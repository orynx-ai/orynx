import { describe, expect, it } from 'vitest';
import { apiPaths, apiRoutes, OpenSprintsSchema, TicketsChoiceSchema, TicketSchema, TicketsSchema } from './index.ts';
import { makeOpenSprint, makeTicket, makeTickets } from './testing.ts';

describe('TicketsSchema', () => {
  it('AC-1: carries the sprint, its tickets in rank order and where Jira’s sprint read stands', () => {
    const tickets = makeTickets({
      tickets: [
        makeTicket({ key: 'PROJ-1377', column: 'to_do' }),
        makeTicket({ key: 'PROJ-1423', column: 'in_progress' }),
      ],
    });

    const parsed = TicketsSchema.parse(tickets);

    expect(parsed.sprint).toEqual({
      id: 42,
      name: 'Sprint 42',
      endsAt: '2026-10-24T17:00:00.000Z',
      projectKey: 'PROJ',
    });
    expect(parsed.tickets.map((ticket) => ticket.key)).toEqual(['PROJ-1377', 'PROJ-1423']);
    expect(parsed.jira).toEqual({ state: 'synced', at: '2026-10-17T10:00:00.000Z' });
    expect(parsed.truncated).toBe(false);
  });

  it('AC-2: a ticket says its type, priority with its bars, due day and assignee as data, not words', () => {
    const ticket = TicketSchema.parse(
      makeTicket({
        type: 'Bug',
        bug: true,
        priority: { name: 'Highest', level: 'high' },
        dueDate: '2026-10-19',
        assignee: { name: 'Rakesh Dhariwal', mine: true },
      }),
    );

    expect(ticket).toMatchObject({
      type: 'Bug',
      bug: true,
      priority: { name: 'Highest', level: 'high' },
      dueDate: '2026-10-19',
      assignee: { name: 'Rakesh Dhariwal', mine: true },
    });
  });

  it('AC-2: a ticket may have no priority, no due date and no assignee', () => {
    const ticket = TicketSchema.parse(makeTicket({ priority: null, dueDate: null, assignee: null }));

    expect(ticket).toMatchObject({ priority: null, dueDate: null, assignee: null });
  });

  it('AC-12: a ticket carries the session working on it, but never a stopped one (Q4c)', () => {
    expect(TicketSchema.parse(makeTicket({ session: { id: 'session-1', state: 'needs_you' } })).session).toEqual({
      id: 'session-1',
      state: 'needs_you',
    });
    expect(() => TicketSchema.parse({ ...makeTicket(), session: { id: 'session-1', state: 'stopped' } })).toThrow();
  });

  it('links only to https on a Jira Cloud site, so a cached ticket can never send you elsewhere', () => {
    expect(() =>
      TicketSchema.parse({ ...makeTicket(), url: 'http://your-team.atlassian.net/browse/PROJ-1423' }),
    ).toThrow();
    expect(() => TicketSchema.parse({ ...makeTicket(), url: 'https://evil.example/browse/PROJ-1423' })).toThrow();
  });

  it('AC-3: a ticket sits in one of the four columns, and nowhere else', () => {
    for (const column of ['to_do', 'in_progress', 'in_review', 'done'] as const) {
      expect(TicketSchema.parse(makeTicket({ column })).column).toBe(column);
    }
    expect(() => TicketSchema.parse({ ...makeTicket(), column: 'qa' })).toThrow();
  });

  it('AC-22: Jira answered, and no active sprint holds a ticket of yours', () => {
    const parsed = TicketsSchema.parse(makeTickets({ sprint: null, tickets: [] }));

    expect(parsed.sprint).toBeNull();
    expect(parsed.tickets).toEqual([]);
  });

  it('AC-21: Jira is not connected', () => {
    const parsed = TicketsSchema.parse(makeTickets({ jira: { state: 'not_connected' }, sprint: null, tickets: [] }));

    expect(parsed.jira).toEqual({ state: 'not_connected' });
  });

  it('AC-26: says when the sprint held more tickets than DevHub keeps', () => {
    expect(TicketsSchema.parse(makeTickets({ truncated: true })).truncated).toBe(true);
  });

  it('AC-1: is served at /api/tickets', () => {
    expect(apiPaths.tickets).toBe('/tickets');
    expect(apiRoutes.tickets).toBe('/api/tickets');
  });
});

describe('TicketsChoiceSchema (spec 020)', () => {
  it('takes your sprint, a project’s current sprint, or one sprint of a project', () => {
    for (const choice of [
      { projectKey: null, sprintId: null },
      { projectKey: 'WEB', sprintId: null },
      { projectKey: 'WEB', sprintId: 43 },
    ]) {
      expect(TicketsChoiceSchema.parse(choice)).toEqual(choice);
    }
  });

  it('refuses a sprint without its project, and a key Jira never makes', () => {
    expect(TicketsChoiceSchema.safeParse({ projectKey: null, sprintId: 43 }).success).toBe(false);
    expect(TicketsChoiceSchema.safeParse({ projectKey: 'web app', sprintId: null }).success).toBe(false);
  });

  it('reads an answer from before spec 020 as your sprint', () => {
    const { choice: _, ...before } = makeTickets();
    expect(TicketsSchema.parse(before).choice).toEqual({ projectKey: null, sprintId: null });
  });

  it('lists open sprints with their dates', () => {
    expect(OpenSprintsSchema.parse({ sprints: [makeOpenSprint()] }).sprints[0]?.name).toBe('Sprint 43');
    expect(OpenSprintsSchema.safeParse({ sprints: [{ ...makeOpenSprint(), state: 'closed' }] }).success).toBe(false);
  });
});
