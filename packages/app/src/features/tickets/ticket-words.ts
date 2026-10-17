import type { Sprint, Ticket, TicketColumn } from '@devhub/contracts';
import type { PillTone } from '@devhub/ui';
import { personName } from '../../shell/person-name.ts';
import { calendarDay, daysUntil, months, plural, weekdays } from '../../words/calendar.ts';

/**
 * Every word Tickets shows (spec 008, Q7, Q9). The server sends data; these turn it into words with the
 * laptop's calendar, the way Home writes its dates.
 */

export interface DueText {
  text: string;
  /** What a screen reader hears: the calendar icon says "due" to the eye only. */
  spoken: string;
  /** Drawn in `warning`: not Done, and overdue or due within 6 days (Q7b, Q3b). */
  soon: boolean;
}

/** "24 Oct" and "24 October", with the year when it isn't this year's: "3 Jan 2027". */
function dayMonth(date: Date, now: Date): { short: string; long: string } {
  const month = months[date.getMonth()] ?? '';
  const year = date.getFullYear() === now.getFullYear() ? '' : ` ${String(date.getFullYear())}`;
  return {
    short: `${String(date.getDate())} ${month.slice(0, 3)}${year}`,
    long: `${String(date.getDate())} ${month}${year}`,
  };
}

/**
 * Q7b: Home's dates without "Due". "Today", "Tomorrow", a weekday within 6 days, or "28 Oct"; a ticket that
 * isn't Done and is past its date reads "Overdue · 2 d". A Done ticket's date is never `soon`.
 */
export function dueText(on: string, done: boolean, now: Date): DueText {
  const days = daysUntil(on, now);
  if (days < 0 && !done) {
    return { text: `Overdue · ${String(-days)} d`, spoken: `Overdue by ${plural(-days, 'day')}`, soon: true };
  }
  const soon = !done && days <= 6;
  if (days === 0) return { text: 'Today', spoken: 'Due today', soon };
  if (days === 1) return { text: 'Tomorrow', spoken: 'Due tomorrow', soon };
  const due = calendarDay(on);
  if (days > 1 && days <= 6) {
    const weekday = weekdays[due.getDay()] ?? '';
    return { text: weekday.slice(0, 3), spoken: `Due ${weekday}`, soon };
  }
  const date = dayMonth(due, now);
  return { text: date.short, spoken: `Due ${date.long}`, soon };
}

/** Q9a, Q7c: "PROJ · ends 24 Oct", "PROJ · ended 24 Oct", "PROJ", or "ends 24 Oct"; null with neither. */
export function sprintMeta(sprint: Sprint, now: Date): string | null {
  const parts: string[] = [];
  if (sprint.projectKey !== null) parts.push(sprint.projectKey);
  if (sprint.endsAt !== null) {
    const ends = new Date(sprint.endsAt);
    parts.push(`${ends.getTime() < now.getTime() ? 'ended' : 'ends'} ${dayMonth(ends, now).short}`);
  }
  return parts.length === 0 ? null : parts.join(' · ');
}

/** Q9a: the page's hidden heading. */
export function pageHeading(sprintName: string): string {
  return `${sprintName} tickets`;
}

/** Q9b: "9 tickets", "1 ticket", "0 tickets". */
export function ticketCount(count: number): string {
  return plural(count, 'ticket');
}

/** The board's columns, left to right. */
export const columnOrder: readonly TicketColumn[] = ['to_do', 'in_progress', 'in_review', 'done'];

/** Q9c. */
export const columnNames: Record<TicketColumn, string> = {
  to_do: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

/** Q9c: each column's region, as a screen reader hears it: "In review, 2 tickets". */
export function columnRegionName(column: TicketColumn, count: number): string {
  return `${columnNames[column]}, ${ticketCount(count)}`;
}

export interface EmptyText {
  title: string;
  line: string | null;
}

const emptyColumns: Record<TicketColumn, { title: string; line: string }> = {
  to_do: { title: 'Nothing to do', line: "Tickets that haven't started show up here." },
  in_progress: { title: 'Nothing in progress', line: 'Tickets being worked on show up here.' },
  // The design system's own example.
  in_review: { title: 'Nothing in review', line: 'Tickets move here when you open a pull request.' },
  done: { title: 'Nothing done yet', line: 'Finished tickets show up here.' },
};

/**
 * Q9d: a column with nothing in it. `filtered` when Due this week, Bugs only or the search emptied it;
 * otherwise nothing was there under Assigned to me alone.
 */
export function columnEmptyText(column: TicketColumn, filtered: boolean): EmptyText {
  return filtered ? { title: 'No tickets match these filters', line: null } : emptyColumns[column];
}

/** Q9e: the list with nothing to show. */
export function listEmptyText(sprintName: string, { filtered, onlyMine }: { filtered: boolean; onlyMine: boolean }) {
  if (!filtered && onlyMine) {
    return {
      title: `Nothing assigned to you in ${sprintName}`,
      line: 'Turn off Assigned to me to see the whole sprint.',
    };
  }
  return { title: 'No tickets match these filters', line: 'Turn one off, or clear them.' };
}

/** Q9f: the card's avatar, or null for nobody. */
export function assigneeAvatar(assignee: Ticket['assignee']): { initials: string; label: string } | null {
  if (assignee === null) return null;
  return {
    initials: personName(assignee.name).initials,
    label: assignee.mine ? 'Assigned to you' : `Assigned to ${assignee.name}`,
  };
}

/** AC-11: the list's status pill in its column's colour, as the design system gives each status. */
export const statusTones: Record<TicketColumn, PillTone> = {
  to_do: 'neutral',
  in_progress: 'warning',
  in_review: 'info',
  done: 'success',
};

/** Q9i. */
export const noSprintText = {
  title: 'None of your tickets is in an active sprint',
  line: 'Your sprint shows up here once Jira starts one with a ticket assigned to you.',
};

/** Q9k: the local server didn't answer. */
export const unreachableText = {
  title: "Couldn't load the sprint",
  line: 'Check that DevHub is still running, then try again.',
  action: 'Try again',
};

/** Q9l. */
export function tooManyLine(sprintName: string): string {
  return `Showing the first 300 tickets in ${sprintName}, in Jira's order.`;
}
