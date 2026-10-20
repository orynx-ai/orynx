import { describe, expect, it } from 'vitest';
import {
  apiPaths,
  apiRoutes,
  OpenSprintsSchema,
  TicketDetailAnswerSchema,
  TicketKeyParamsSchema,
  TicketsChoiceSchema,
  TicketSchema,
  TicketsSchema,
} from './index.ts';
import { makeOpenSprint, makeTicket, makeTicketDetail, makeTickets } from './testing.ts';

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
    expect(
      TicketSchema.parse(makeTicket({ session: { id: 'session-1', state: 'needs_you', ready: 'nothing' } })).session,
    ).toEqual({
      id: 'session-1',
      state: 'needs_you',
      ready: 'nothing',
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
  it('takes your sprint, a project’s current sprint, one sprint of a project, or No sprint (AC-39)', () => {
    for (const choice of [
      { projectKey: null, sprintId: null },
      { projectKey: 'WEB', sprintId: null },
      { projectKey: 'WEB', sprintId: 43 },
      { projectKey: 'WEB', sprintId: 'none' },
      { projectKey: null, sprintId: 'none' },
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

describe('one ticket in full (spec 022)', () => {
  it('AC-40: carries what the ticket dialog shows, as data', () => {
    const ticket = makeTicketDetail({
      labels: ['archive'],
      links: [{ relation: 'blocks', key: 'PROJ-1400', title: 'Release 4.2', status: 'In Progress' }],
      comments: [{ author: 'Neha K.', created: '2026-10-18T09:30:00.000Z', body: 'Use the **list** view.' }],
    });
    expect(TicketDetailAnswerSchema.parse({ result: 'found', ticket })).toEqual({ result: 'found', ticket });
    expect(ticket).toMatchObject({
      key: 'PROJ-1423',
      status: { name: 'In Progress', column: 'in_progress' },
      priority: 'High',
      assignee: 'Rakesh Dhariwal',
      dueDate: '2026-10-23',
      session: null,
    });
  });

  it('AC-44, AC-45: says why it has no ticket, and takes one with nothing but its key and title', () => {
    for (const result of ['not_found', 'not_connected', 'unreachable'] as const) {
      expect(TicketDetailAnswerSchema.parse({ result })).toEqual({ result });
    }
    const bare = makeTicketDetail({
      type: null,
      status: null,
      priority: null,
      assignee: null,
      reporter: null,
      dueDate: null,
      created: null,
      updated: null,
      description: null,
    });
    expect(TicketDetailAnswerSchema.safeParse({ result: 'found', ticket: bare }).success).toBe(true);
  });

  it('links only to https on a Jira Cloud site, and is read by a key Jira makes', () => {
    expect(
      TicketDetailAnswerSchema.safeParse({
        result: 'found',
        ticket: { ...makeTicketDetail(), url: 'https://evil.example/browse/PROJ-1423' },
      }).success,
    ).toBe(false);
    expect(TicketKeyParamsSchema.safeParse({ key: 'PROJ-1423' }).success).toBe(true);
    for (const key of ['proj-1423', 'PROJ', '../PROJ-1', 'PROJ-0']) {
      expect(TicketKeyParamsSchema.safeParse({ key }).success).toBe(false);
    }
    expect(apiRoutes.ticket).toBe(`/api${apiPaths.ticket}`);
    expect(apiPaths.ticket).toBe('/tickets/:key');
  });
});
