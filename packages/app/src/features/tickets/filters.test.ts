import { describe, expect, it } from 'vitest';
import { makeTicket } from '@devhub/contracts/testing';
import {
  byColumn,
  defaultFilters,
  filterOptions,
  filtersFromSearch,
  hasExtraFilters,
  inListOrder,
  matches,
  searchFromFilters,
  TicketsSearchSchema,
  type DueOption,
  type TicketFilters,
} from './filters.ts';

// Saturday 17 Oct 2026, 10:00 on the laptop's calendar.
const now = new Date(2026, 9, 17, 10, 0);

const mine = makeTicket({ key: 'PROJ-1423', title: 'Add bulk archive to the content list' });
const theirs = makeTicket({ key: 'PROJ-1398', title: 'Read receipts', assignee: { name: 'Priya Shah', mine: false } });
const nobodys = makeTicket({ key: 'PROJ-1411', title: 'Keyboard navigation', assignee: null });

describe('Tickets’ filters (spec 020)', () => {
  const tickets = [mine, theirs, nobodys];
  const keys = (filters: Partial<TicketFilters>) =>
    tickets.filter((ticket) => matches(ticket, { ...defaultFilters, ...filters }, now)).map((ticket) => ticket.key);

  it('AC-30: Assignee starts as Me, and the rest let everything through', () => {
    expect(defaultFilters).toEqual({ assignee: ['me'], status: [], type: [], priority: [], due: [], text: '' });
    expect(filtersFromSearch({})).toEqual({ assignee: ['me'], status: [], type: [], priority: [], due: [] });
  });

  it('AC-31: Assignee keeps Me, Unassigned or a person, any of those ticked; nothing ticked keeps everyone', () => {
    expect(keys({})).toEqual(['PROJ-1423']);
    expect(keys({ assignee: ['unassigned'] })).toEqual(['PROJ-1411']);
    expect(keys({ assignee: ['me', 'Priya Shah'] })).toEqual(['PROJ-1423', 'PROJ-1398']);
    expect(keys({ assignee: [] })).toHaveLength(3);
  });

  it('AC-31: Status, Type and Priority keep tickets with any value ticked; Type in any case', () => {
    const review = makeTicket({
      key: 'PROJ-1',
      status: 'Code Review',
      type: 'Bug',
      priority: { name: 'High', level: 'high' },
    });
    const story = makeTicket({ key: 'PROJ-2', status: 'In Progress', type: 'Story', priority: null });
    const pick = (filters: Partial<TicketFilters>) =>
      [review, story].filter((ticket) => matches(ticket, { ...defaultFilters, ...filters }, now)).map((t) => t.key);

    expect(pick({ status: ['Code Review', 'In Progress'] })).toEqual(['PROJ-1', 'PROJ-2']);
    expect(pick({ status: ['Code Review'], type: ['bug'] })).toEqual(['PROJ-1']);
    expect(pick({ priority: ['High'] })).toEqual(['PROJ-1']);
  });

  it('AC-31: Due keeps Overdue, due this week, or no due date; a Done ticket is never overdue or due', () => {
    const due = (dueDate: string | null, want: DueOption[], column: 'in_progress' | 'done' = 'in_progress') =>
      matches(makeTicket({ dueDate, column }), { ...defaultFilters, due: want }, now);

    expect(due('2026-10-10', ['overdue'])).toBe(true);
    expect(due('2026-10-10', ['week'])).toBe(false);
    expect(due('2026-10-17', ['week'])).toBe(true);
    expect(due('2026-10-23', ['week'])).toBe(true);
    expect(due('2026-10-24', ['week'])).toBe(false);
    expect(due(null, ['none'])).toBe(true);
    expect(due(null, ['overdue', 'week'])).toBe(false);
    expect(due('2026-10-10', ['overdue'], 'done')).toBe(false);
  });

  it('AC-10: the search keeps tickets whose key or title holds the text, in any case', () => {
    const search = (text: string) => matches(mine, { ...defaultFilters, text }, now);

    expect(search('1423')).toBe(true);
    expect(search('proj-1423')).toBe(true);
    expect(search('BULK archive')).toBe(true);
    expect(search('  bulk  ')).toBe(true);
    expect(search('receipts')).toBe(false);
  });

  it('AC-33: Clear filters shows when anything differs from Assignee: Me with an empty search', () => {
    expect(hasExtraFilters(defaultFilters)).toBe(false);
    expect(hasExtraFilters({ ...defaultFilters, assignee: [] })).toBe(true);
    expect(hasExtraFilters({ ...defaultFilters, due: ['week'] })).toBe(true);
    expect(hasExtraFilters({ ...defaultFilters, text: ' x ' })).toBe(true);
    expect(hasExtraFilters({ ...defaultFilters, text: '   ' })).toBe(false);
  });

  it('AC-31: the filters live in the address as comma lists, and only those that differ from the default', () => {
    const { text: _, ...address } = defaultFilters;
    expect(searchFromFilters(address)).toEqual({});
    expect(
      searchFromFilters({
        assignee: ['me', 'unassigned'],
        status: ['Code Review'],
        type: [],
        priority: ['High'],
        due: ['overdue', 'week'],
      }),
    ).toEqual({ assignee: 'me,unassigned', status: 'Code Review', priority: 'High', due: 'overdue,week' });
    expect(searchFromFilters({ ...address, assignee: [] })).toEqual({ assignee: 'anyone' });
    expect(
      filtersFromSearch({ assignee: 'me,unassigned', status: 'Code Review,In Progress', due: 'week,month' }),
    ).toEqual({
      assignee: ['me', 'unassigned'],
      status: ['Code Review', 'In Progress'],
      type: [],
      priority: [],
      due: ['week'],
    });
  });

  it('AC-31: a value holding a comma, such as a person named "Doe, Jane", stays one value in the address', () => {
    const ticked = { ...filtersFromSearch({}), assignee: ['Doe, Jane', 'me'], status: ['100% done'] };
    const search = searchFromFilters(ticked);

    expect(search).toEqual({ assignee: 'Doe%2C Jane,me', status: '100%25 done' });
    expect(filtersFromSearch(search)).toEqual(ticked);
  });

  it('AC-32: spec 008’s addresses still work', () => {
    expect(filtersFromSearch(TicketsSearchSchema.parse({ assignee: 'anyone', due: 'week', type: 'bug' }))).toEqual({
      assignee: [],
      status: [],
      type: ['Bug'],
      priority: [],
      due: ['week'],
    });
  });

  it('AC-30: each filter offers what the sprint holds, in its order, and keeps a ticked value no ticket has', () => {
    const sprint = [
      makeTicket({
        key: 'PROJ-1',
        status: 'Done',
        column: 'done',
        type: 'Task',
        priority: { name: 'Low', level: 'low', rank: 3 },
      }),
      makeTicket({
        key: 'PROJ-2',
        status: 'To Do',
        column: 'to_do',
        type: 'Bug',
        assignee: { name: 'Sam Lee', mine: false },
      }),
      makeTicket({
        key: 'PROJ-3',
        status: 'Code Review',
        column: 'in_review',
        priority: { name: 'Highest', level: 'high', rank: 0 },
      }),
      theirs,
    ];
    const options = filterOptions(sprint, { ...filtersFromSearch({}), status: ['Blocked'] });
    const labels = (key: keyof typeof options) => options[key].map((option) => option.label);

    expect(labels('assignee')).toEqual(['Me', 'Unassigned', 'Priya Shah', 'Sam Lee']);
    expect(labels('status')).toEqual(['To Do', 'In Progress', 'Code Review', 'Done', 'Blocked']);
    expect(labels('type')).toEqual(['Bug', 'Story', 'Task']);
    // The site's order, highest first, not A to Z: Highest and High share a level (spec 020).
    expect(labels('priority')).toEqual(['Highest', 'High', 'Low']);
    expect(labels('due')).toEqual(['Overdue', 'This week', 'No due date']);
  });
});

describe('Tickets’ order', () => {
  const tickets = [
    makeTicket({ key: 'PROJ-1', column: 'done' }),
    makeTicket({ key: 'PROJ-2', column: 'to_do' }),
    makeTicket({ key: 'PROJ-3', column: 'in_review' }),
    makeTicket({ key: 'PROJ-4', column: 'to_do' }),
  ];

  it('AC-1: groups tickets into the four columns, keeping Jira’s rank order in each', () => {
    const columns = byColumn(tickets);

    expect(
      Object.fromEntries(Object.entries(columns).map(([column, held]) => [column, held.map((t) => t.key)])),
    ).toEqual({ to_do: ['PROJ-2', 'PROJ-4'], in_progress: [], in_review: ['PROJ-3'], done: ['PROJ-1'] });
  });

  it('AC-11: the list follows the columns, then rank', () => {
    expect(inListOrder(tickets).map((ticket) => ticket.key)).toEqual(['PROJ-2', 'PROJ-4', 'PROJ-3', 'PROJ-1']);
  });
});
