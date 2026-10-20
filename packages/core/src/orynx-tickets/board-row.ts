import { orynxStatusNames, type OrynxPriority, type OrynxTicket, type Ticket } from '@devhub/contracts';

/** An Orynx ticket stays on the board's Done column this long after it got there, as on a Jira Kanban board (Q6). */
export const doneOnBoardMs = 14 * 24 * 60 * 60 * 1000;

const priorityBars: Record<OrynxPriority, Pick<NonNullable<Ticket['priority']>, 'level' | 'rank'>> = {
  Highest: { level: 'high', rank: 0 },
  High: { level: 'high', rank: 1 },
  Medium: { level: 'medium', rank: 2 },
  Low: { level: 'low', rank: 3 },
  Lowest: { level: 'low', rank: 4 },
};

/**
 * Orynx's own tickets as rows of Tickets' board and list (spec 037), oldest first: no Jira link, the column's own
 * status name, and yours, since Orynx has one person (`you` is your name as git gives it). A ticket that got to
 * Done more than 14 days ago is left out; ⌘K still finds it (AC-21).
 */
export function orynxBoardRows(tickets: readonly OrynxTicket[], you: string, now: number): Ticket[] {
  return tickets
    .filter((ticket) => ticket.doneAt === null || now - Date.parse(ticket.doneAt) <= doneOnBoardMs)
    .map((ticket) => ({
      key: ticket.key,
      title: ticket.title,
      url: null,
      status: orynxStatusNames[ticket.status],
      column: ticket.status,
      type: ticket.type,
      bug: ticket.type === 'Bug',
      priority: { name: ticket.priority, ...priorityBars[ticket.priority] },
      dueDate: ticket.dueDate,
      assignee: { name: you, mine: true },
      session: ticket.session,
    }));
}
