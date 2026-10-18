import { z } from 'zod';
import type { Ticket, TicketColumn } from '@devhub/contracts';
import { daysUntil } from '../../words/calendar.ts';
import { dueText } from '../../words/due.ts';
import { columnOrder } from './ticket-words.ts';

/**
 * Tickets' filters (spec 020, replacing spec 008's Q3): Assignee, Status, Type, Priority and Due. Options in
 * one filter widen it (any of them), and filters narrow each other (all of them). They live in the address as
 * comma lists, so a reload keeps them and 015's "Pick up a ticket" can link to them:
 * `/tickets?assignee=me,unassigned&status=Code%20Review&due=overdue,week`. Only a filter that differs from the
 * default is written. Spec 008's addresses still work: `assignee=anyone`, `due=week`, `type=bug`.
 */
export const TicketsSearchSchema = z.object({
  assignee: z.string().optional().catch(undefined),
  status: z.string().optional().catch(undefined),
  type: z.string().optional().catch(undefined),
  priority: z.string().optional().catch(undefined),
  due: z.string().optional().catch(undefined),
});
export type TicketsSearch = z.infer<typeof TicketsSearchSchema>;

/** Due's three options. */
export const dueOptions = ['overdue', 'week', 'none'] as const;
export type DueOption = (typeof dueOptions)[number];

export interface TicketFilters {
  /** `me`, `unassigned`, or a person's name as Jira gives it; empty lets everyone through. Me by default. */
  assignee: string[];
  /** Statuses by their own names ("Code Review"). */
  status: string[];
  /** Types by their own names ("Bug"), matched in any case. */
  type: string[];
  /** Priorities by their own names ("High"). */
  priority: string[];
  /** Overdue, due within 6 days, or no due date; a Done ticket is never overdue or due this week. */
  due: DueOption[];
  /** Search tickets: the key or the title holds it, in any case. */
  text: string;
}

export type AddressFilters = Omit<TicketFilters, 'text'>;

export const defaultFilters: TicketFilters = {
  assignee: ['me'],
  status: [],
  type: [],
  priority: [],
  due: [],
  text: '',
};

/** The filters a page can hold in the address (spec 020): every filter, without the search text. */
export type FilterKey = keyof AddressFilters;
export const filterKeys: readonly FilterKey[] = ['assignee', 'status', 'type', 'priority', 'due'];

/**
 * A comma list's values, each once. A value's own comma is written `%2C` (and its `%` as `%25`), so a person
 * named "Doe, Jane" stays one value; every other character is left as it reads.
 */
function commaList(raw: string | undefined): string[] {
  const values = (raw ?? '')
    .split(',')
    .map((value) => value.replace(/%(2C|25)/gi, (code) => (code.toUpperCase() === '%2C' ? ',' : '%')).trim())
    .filter((value) => value !== '');
  return [...new Set(values)];
}

function commaJoin(values: readonly string[]): string {
  return values.map((value) => value.replaceAll('%', '%25').replaceAll(',', '%2C')).join(',');
}

export function filtersFromSearch(search: TicketsSearch): AddressFilters {
  // Spec 008's `assignee=anyone` let everyone through, as nothing ticked does now.
  const assignee =
    search.assignee === undefined ? ['me'] : commaList(search.assignee).filter((value) => value !== 'anyone');
  return {
    assignee,
    status: commaList(search.status),
    // Spec 008's `type=bug` was Bugs only.
    type: commaList(search.type).map((type) => (type === 'bug' ? 'Bug' : type)),
    priority: commaList(search.priority),
    due: commaList(search.due).filter((value): value is DueOption => (dueOptions as readonly string[]).includes(value)),
  };
}

export function searchFromFilters(filters: AddressFilters): TicketsSearch {
  const isDefaultAssignee = filters.assignee.length === 1 && filters.assignee[0] === 'me';
  const search: TicketsSearch = {};
  if (!isDefaultAssignee) search.assignee = filters.assignee.length === 0 ? 'anyone' : commaJoin(filters.assignee);
  for (const key of ['status', 'type', 'priority', 'due'] as const) {
    if (filters[key].length > 0) search[key] = commaJoin(filters[key]);
  }
  return search;
}

/** Clear filters shows when anything differs from Assignee: Me alone with an empty search. */
export function hasExtraFilters(filters: TicketFilters): boolean {
  const isDefaultAssignee = filters.assignee.length === 1 && filters.assignee[0] === 'me';
  return (
    !isDefaultAssignee ||
    filters.status.length > 0 ||
    filters.type.length > 0 ||
    filters.priority.length > 0 ||
    filters.due.length > 0 ||
    filters.text.trim() !== ''
  );
}

function assigneeMatches(ticket: Ticket, wanted: readonly string[]): boolean {
  if (wanted.length === 0) return true;
  return wanted.some((value) => {
    if (value === 'me') return ticket.assignee?.mine === true;
    if (value === 'unassigned') return ticket.assignee === null;
    return ticket.assignee !== null && !ticket.assignee.mine && ticket.assignee.name === value;
  });
}

function dueMatches(ticket: Ticket, wanted: readonly DueOption[], now: Date): boolean {
  if (wanted.length === 0) return true;
  const done = ticket.column === 'done';
  return wanted.some((value) => {
    if (value === 'none') return ticket.dueDate === null;
    if (ticket.dueDate === null || done) return false;
    const days = daysUntil(ticket.dueDate, now);
    return value === 'overdue' ? days < 0 : days >= 0 && dueText(ticket.dueDate, done, now).soon;
  });
}

/** Whether the ticket passes every filter that's on. */
export function matches(ticket: Ticket, filters: TicketFilters, now: Date): boolean {
  if (!assigneeMatches(ticket, filters.assignee)) return false;
  if (filters.status.length > 0 && !filters.status.includes(ticket.status)) return false;
  if (filters.type.length > 0 && !filters.type.some((type) => type.toLowerCase() === ticket.type.toLowerCase())) {
    return false;
  }
  if (filters.priority.length > 0 && (ticket.priority === null || !filters.priority.includes(ticket.priority.name))) {
    return false;
  }
  if (!dueMatches(ticket, filters.due, now)) return false;
  const text = filters.text.trim().toLowerCase();
  return text === '' || ticket.key.toLowerCase().includes(text) || ticket.title.toLowerCase().includes(text);
}

/** One filter's options, as its menu lists them. */
export interface FilterOptions {
  key: FilterKey;
  options: { value: string; label: string }[];
}

const levelOrder = { high: 0, medium: 1, low: 2 } as const;

/**
 * Each filter's options from the sprint's own tickets (AC-30): Assignee's Me and Unassigned, then the people
 * A to Z; the statuses in column order; the types A to Z; the priorities highest first; Due's three. A value
 * ticked in the address that no ticket has still shows, so it can be unticked.
 */
export function filterOptions(
  tickets: readonly Ticket[],
  filters: AddressFilters,
): Record<FilterKey, FilterOptions['options']> {
  const withTicked = (values: string[], ticked: readonly string[]) => [
    ...values,
    ...ticked.filter((value) => !values.includes(value)),
  ];
  const people = [
    ...new Set(
      tickets.flatMap((ticket) => (ticket.assignee !== null && !ticket.assignee.mine ? [ticket.assignee.name] : [])),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const statuses = [...new Set(inListOrder(tickets).map((ticket) => ticket.status))];
  const types = [...new Set(tickets.map((ticket) => ticket.type))].sort((a, b) => a.localeCompare(b));
  const priorities = [
    ...new Map(
      tickets
        .flatMap((ticket) => (ticket.priority === null ? [] : [ticket.priority]))
        // The site's order (Highest before High, which share a level), then by level for one it doesn't hold.
        .sort(
          (a, b) =>
            (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
            levelOrder[a.level] - levelOrder[b.level] ||
            a.name.localeCompare(b.name),
        )
        .map((priority) => [priority.name, priority]),
    ).keys(),
  ];
  const asOptions = (values: string[]) => values.map((value) => ({ value, label: value }));
  return {
    assignee: [
      { value: 'me', label: 'Me' },
      { value: 'unassigned', label: 'Unassigned' },
      ...asOptions(
        withTicked(
          people,
          filters.assignee.filter((value) => value !== 'me' && value !== 'unassigned'),
        ),
      ),
    ],
    status: asOptions(withTicked(statuses, filters.status)),
    type: asOptions(withTicked(types, filters.type)),
    priority: asOptions(withTicked(priorities, filters.priority)),
    due: [
      { value: 'overdue', label: 'Overdue' },
      { value: 'week', label: 'This week' },
      { value: 'none', label: 'No due date' },
    ],
  };
}

/** The board's columns, each in Jira's rank order. */
export function byColumn(tickets: readonly Ticket[]): Record<TicketColumn, Ticket[]> {
  const columns: Record<TicketColumn, Ticket[]> = { to_do: [], in_progress: [], in_review: [], done: [] };
  for (const ticket of tickets) columns[ticket.column].push(ticket);
  return columns;
}

/** The list: the columns left to right, then rank. */
export function inListOrder(tickets: readonly Ticket[]): Ticket[] {
  const columns = byColumn(tickets);
  return columnOrder.flatMap((column) => columns[column]);
}
