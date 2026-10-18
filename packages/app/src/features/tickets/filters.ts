import { z } from 'zod';
import type { Ticket, TicketColumn } from '@devhub/contracts';
import { columnOrder, dueText } from './ticket-words.ts';

/**
 * Tickets' filters (spec 008, Q3). They live in the address, so a reload keeps them and 015's "Pick up a
 * ticket" can link to them: `/tickets?assignee=anyone&due=week&type=bug`. Only a filter that differs from
 * the default is written. The search text isn't kept.
 */
export const TicketsSearchSchema = z.object({
  // A value DevHub can't read opens the default instead of an error page.
  assignee: z.enum(['anyone']).optional().catch(undefined),
  due: z.enum(['week']).optional().catch(undefined),
  type: z.enum(['bug']).optional().catch(undefined),
});
export type TicketsSearch = z.infer<typeof TicketsSearchSchema>;

export interface TicketFilters {
  /** Assigned to me (on by default). */
  mine: boolean;
  /** Due this week: not Done, and due within 6 days or overdue, as the card's date draws it. */
  dueThisWeek: boolean;
  bugsOnly: boolean;
  /** Search tickets: the key or the title holds it, in any case. */
  text: string;
}

export type AddressFilters = Omit<TicketFilters, 'text'>;

export const defaultFilters: TicketFilters = { mine: true, dueThisWeek: false, bugsOnly: false, text: '' };

export function filtersFromSearch(search: TicketsSearch): AddressFilters {
  return { mine: search.assignee !== 'anyone', dueThisWeek: search.due === 'week', bugsOnly: search.type === 'bug' };
}

export function searchFromFilters(filters: AddressFilters): TicketsSearch {
  return {
    ...(filters.mine ? {} : { assignee: 'anyone' as const }),
    ...(filters.dueThisWeek ? { due: 'week' as const } : {}),
    ...(filters.bugsOnly ? { type: 'bug' as const } : {}),
  };
}

/** Q3f: Due this week, Bugs only or a search is on, so Clear filters shows. Assigned to me is the default. */
export function hasExtraFilters(filters: TicketFilters): boolean {
  return filters.dueThisWeek || filters.bugsOnly || filters.text.trim() !== '';
}

/** Q3d: whether the ticket passes every filter that's on. */
export function matches(ticket: Ticket, filters: TicketFilters, now: Date): boolean {
  if (filters.mine && ticket.assignee?.mine !== true) return false;
  if (filters.bugsOnly && !ticket.bug) return false;
  if (
    filters.dueThisWeek &&
    (ticket.dueDate === null || !dueText(ticket.dueDate, ticket.column === 'done', now).soon)
  ) {
    return false;
  }
  const text = filters.text.trim().toLowerCase();
  return text === '' || ticket.key.toLowerCase().includes(text) || ticket.title.toLowerCase().includes(text);
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
