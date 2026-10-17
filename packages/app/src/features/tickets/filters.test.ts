import { describe, expect, it } from 'vitest';
import { makeTicket } from '@devhub/contracts/testing';
import {
  byColumn,
  defaultFilters,
  filtersFromSearch,
  hasExtraFilters,
  inListOrder,
  matches,
  searchFromFilters,
  TicketsSearchSchema,
} from './filters.ts';

// Saturday 17 Oct 2026, 10:00 on the laptop's calendar.
const now = new Date(2026, 9, 17, 10, 0);

const mine = makeTicket({ key: 'PROJ-1423', title: 'Add bulk archive to the content list' });
const theirs = makeTicket({ key: 'PROJ-1398', title: 'Read receipts', assignee: { name: 'Priya Shah', mine: false } });
const nobodys = makeTicket({ key: 'PROJ-1411', title: 'Keyboard navigation', assignee: null });

describe('Tickets’ filters (Q3)', () => {
  it('AC-1: Assigned to me is on by default, and the rest are off', () => {
    expect(defaultFilters).toEqual({ mine: true, dueThisWeek: false, bugsOnly: false, text: '' });
    expect(filtersFromSearch({})).toEqual({ mine: true, dueThisWeek: false, bugsOnly: false });
  });

  it('AC-7: Assigned to me keeps your tickets; off, it keeps everyone’s', () => {
    const tickets = [mine, theirs, nobodys];

    expect(tickets.filter((ticket) => matches(ticket, defaultFilters, now)).map((ticket) => ticket.key)).toEqual([
      'PROJ-1423',
    ]);
    expect(tickets.filter((ticket) => matches(ticket, { ...defaultFilters, mine: false }, now))).toHaveLength(3);
  });

  it('AC-8: Due this week keeps tickets that aren’t Done and are due within 6 days or overdue', () => {
    const filters = { ...defaultFilters, mine: false, dueThisWeek: true };
    const due = (dueDate: string | null, column: 'in_progress' | 'done' = 'in_progress') =>
      matches(makeTicket({ dueDate, column }), filters, now);

    expect(due('2026-10-17')).toBe(true);
    expect(due('2026-10-23')).toBe(true);
    expect(due('2026-10-24')).toBe(false);
    expect(due('2026-10-10')).toBe(true);
    expect(due(null)).toBe(false);
    expect(due('2026-10-18', 'done')).toBe(false);
  });

  it('AC-8: Bugs only keeps bugs', () => {
    const filters = { ...defaultFilters, bugsOnly: true };

    expect(matches(makeTicket({ type: 'Bug', bug: true }), filters, now)).toBe(true);
    expect(matches(makeTicket({ type: 'Story', bug: false }), filters, now)).toBe(false);
  });

  it('AC-10: the search keeps tickets whose key or title holds the text, in any case', () => {
    const search = (text: string) => matches(mine, { ...defaultFilters, text }, now);

    expect(search('1423')).toBe(true);
    expect(search('proj-1423')).toBe(true);
    expect(search('BULK archive')).toBe(true);
    expect(search('  bulk  ')).toBe(true);
    expect(search('receipts')).toBe(false);
  });

  it('AC-8: the filters add up', () => {
    const filters = { mine: true, dueThisWeek: true, bugsOnly: true, text: '' };

    expect(matches(makeTicket({ bug: true, type: 'Bug', dueDate: '2026-10-19' }), filters, now)).toBe(true);
    expect(matches(makeTicket({ bug: true, type: 'Bug', dueDate: '2026-11-19' }), filters, now)).toBe(false);
    expect(matches(makeTicket({ bug: true, type: 'Bug', dueDate: '2026-10-19', assignee: null }), filters, now)).toBe(
      false,
    );
  });

  it('AC-8, AC-9: Clear filters shows when Due this week, Bugs only or a search is on', () => {
    expect(hasExtraFilters(defaultFilters)).toBe(false);
    expect(hasExtraFilters({ ...defaultFilters, mine: false })).toBe(false);
    expect(hasExtraFilters({ ...defaultFilters, dueThisWeek: true })).toBe(true);
    expect(hasExtraFilters({ ...defaultFilters, bugsOnly: true })).toBe(true);
    expect(hasExtraFilters({ ...defaultFilters, text: ' x ' })).toBe(true);
    expect(hasExtraFilters({ ...defaultFilters, text: '   ' })).toBe(false);
  });

  it('AC-7, AC-8: the filters live in the address, and only those that differ from the default', () => {
    expect(searchFromFilters({ mine: true, dueThisWeek: false, bugsOnly: false })).toEqual({});
    expect(searchFromFilters({ mine: false, dueThisWeek: true, bugsOnly: true })).toEqual({
      assignee: 'anyone',
      due: 'week',
      type: 'bug',
    });
    expect(filtersFromSearch({ assignee: 'anyone', due: 'week', type: 'bug' })).toEqual({
      mine: false,
      dueThisWeek: true,
      bugsOnly: true,
    });
  });

  it('an address value DevHub can’t read falls back to the default, rather than an error page', () => {
    expect(TicketsSearchSchema.parse({ assignee: 'me', due: 'month', type: 'story' })).toEqual({});
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
