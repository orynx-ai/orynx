import { http, HttpResponse } from 'msw';
import { apiRoutes, type Ticket, type Tickets } from '@devhub/contracts';
import { makeTicket, makeTickets } from '@devhub/contracts/testing';
import { apiUrl } from './msw.ts';

/** Saturday 17 Oct 2026, 10:00 on the laptop's calendar: the day the design's sprint is drawn on. */
export const ticketsToday = new Date(2026, 9, 17, 10, 0);

const priya = { name: 'Priya Shah', mine: false };

/** The design's Sprint 42: nine tickets, six of them yours, in Jira's rank order. */
export const designTickets: Ticket[] = [
  makeTicket({
    key: 'PROJ-1377',
    title: 'Search returns archived sites for guest users',
    column: 'to_do',
    status: 'To Do',
    type: 'Bug',
    bug: true,
    dueDate: '2026-10-19',
  }),
  makeTicket({
    key: 'PROJ-1402',
    title: 'Add empty state to saved searches',
    column: 'to_do',
    status: 'To Do',
    priority: { name: 'Low', level: 'low' },
    dueDate: '2026-10-28',
  }),
  makeTicket({
    key: 'PROJ-1423',
    title: 'Add bulk archive to the content list',
    dueDate: '2026-10-23',
    session: { id: 'session-1423', state: 'needs_you', ready: 'nothing' },
  }),
  makeTicket({
    key: 'PROJ-1398',
    title: 'Show read receipts on newsletter analytics',
    priority: { name: 'Medium', level: 'medium' },
    dueDate: '2026-10-22',
    assignee: priya,
  }),
  makeTicket({
    key: 'PROJ-1411',
    title: 'Keyboard navigation for the mega menu',
    priority: { name: 'Medium', level: 'medium' },
    dueDate: '2026-10-23',
  }),
  makeTicket({
    key: 'PROJ-1350',
    title: 'Migrate feed cards to the new Card component',
    column: 'in_review',
    status: 'Code Review',
    type: 'Task',
    priority: { name: 'Medium', level: 'medium' },
    dueDate: '2026-10-24',
  }),
  makeTicket({
    key: 'PROJ-1389',
    title: 'Fix timezone shift in event cards',
    column: 'in_review',
    status: 'Code Review',
    type: 'Bug',
    bug: true,
    dueDate: '2026-10-21',
    assignee: priya,
  }),
  makeTicket({
    key: 'PROJ-1340',
    title: 'Lazy-load the people directory',
    column: 'done',
    status: 'Done',
    priority: { name: 'Medium', level: 'medium' },
    dueDate: '2026-10-14',
  }),
  makeTicket({
    key: 'PROJ-1333',
    title: 'Rate-limit the export endpoint',
    column: 'done',
    status: 'Done',
    type: 'Task',
    priority: { name: 'Low', level: 'low' },
    dueDate: '2026-10-13',
    assignee: null,
  }),
];

/** Answers GET /api/tickets with Sprint 42 and these tickets, or the whole answer given. */
export function ticketsHandler(answer: Partial<Tickets> = {}) {
  return http.get(apiUrl(apiRoutes.tickets), () =>
    HttpResponse.json(makeTickets({ tickets: designTickets, ...answer })),
  );
}
