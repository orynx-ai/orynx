import type { InboxToolState, OpenSprint, Sprint, Ticket, TicketColumn } from '@devhub/contracts';
import { personName } from '../../shell/person-name.ts';
import { agoText } from '../../words/ago.ts';
import { dayMonth, plural } from '../../words/calendar.ts';

/**
 * Every word Tickets shows (spec 008, Q7, Q9). The server sends data; these turn it into words with the
 * laptop's calendar, the way Home writes its dates.
 */

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

/** Spec 020, Q4e: a sprint's line in the Sprint menu: "Active · ends 24 Oct", "Future · starts 27 Oct", "Future". */
export function openSprintLine(sprint: OpenSprint, now: Date): string {
  const state = sprint.state === 'active' ? 'Active' : 'Future';
  const date = sprint.state === 'active' ? sprint.endsAt : sprint.startsAt;
  if (date === null) return state;
  return `${state} · ${sprint.state === 'active' ? 'ends' : 'starts'} ${dayMonth(new Date(date), now).short}`;
}

/** Spec 020, Q4e: the Project picker's first option, and its words while nothing is picked. */
export const yourSprintText = 'Your sprint';

/** Spec 037, Q7: Orynx's own tickets alone, as the breadcrumb names them; they have no sprint. */
export const orynxName = 'Orynx';

/** Spec 020: the tickets in no sprint that aren't Done, as the page and the Sprint menu name them (AC-39). */
export const noSprintName = 'No sprint';

/** Spec 020, Q4e: a picked project with no active or future sprint. */
export function noOpenSprintsText(projectKey: string): string {
  return `${projectKey} has no open sprints.`;
}

/** Q9a: the page's hidden heading. */
export function pageHeading(sprintName: string): string {
  return `${sprintName} tickets`;
}

/** Q9b: "9 tickets", "1 ticket", "0 tickets". */
export function ticketCount(count: number): string {
  return plural(count, 'ticket');
}

/** The page bar's line beside Refresh, as Home's: when Jira last answered; null before it ever did. */
export function syncedLine(jira: InboxToolState, now: Date): string | null {
  const at = jira.state === 'synced' ? jira.at : jira.state === 'failed' ? jira.lastSyncedAt : null;
  return at === null ? null : `Synced ${agoText(now.getTime() - Date.parse(at))}`;
}

/** The Assignee filter's search box (the user's call, 19 Oct 2026). */
export const assigneeSearch = { label: 'Search people', empty: 'No one matches' };

/** Tickets ticked to Ship together (the user's call, 19 Oct 2026): "3 selected", Unselect all and Ship all, in a floating bar. */
export const selectionWords = {
  count: (count: number) => `${String(count)} selected`,
  ship: 'Ship all',
  clear: 'Unselect all',
  bar: 'Selected tickets',
};

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
 * Q9d: a column with nothing in it. `filtered` when Status, Type, Priority, Due or the search emptied it;
 * otherwise nothing was there under Assignee alone.
 */
export function columnEmptyText(column: TicketColumn, filtered: boolean): EmptyText {
  return filtered ? { title: 'No tickets match these filters', line: null } : emptyColumns[column];
}

/** The list's caption, for screen readers, as the design gives it. */
export function listCaption(sprintName: string): string {
  return `Tickets in ${sprintName}`;
}

/** Q9e: the list with nothing to show. */
export function listEmptyText(sprintName: string, { filtered, onlyMine }: { filtered: boolean; onlyMine: boolean }) {
  if (!filtered && onlyMine) {
    return {
      title: `Nothing assigned to you in ${sprintName}`,
      line: 'Untick Me under Assignee to see the whole sprint.',
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

/** Q9i. */
export const noSprintText = {
  title: 'None of your tickets is in an active sprint',
  line: 'Your sprint shows up here once Jira starts one with a ticket assigned to you.',
};

/** Q9k: the local server didn't answer. */
export const unreachableText = {
  title: "Couldn't load the sprint",
  line: 'Check that Orynx is still running, then try again.',
  action: 'Try again',
};

/** Q9l. */
export function tooManyLine(sprintName: string): string {
  return `Showing the first 300 tickets in ${sprintName}, in Jira's order.`;
}

/** The ticket dialog's words (spec 022, Q12). */
export const ticketDialogWords = {
  details: 'Ticket details',
  fields: {
    status: 'Status',
    priority: 'Priority',
    assignee: 'Assignee',
    reporter: 'Reporter',
    due: 'Due',
    labels: 'Labels',
    created: 'Created',
    updated: 'Updated',
  },
  unassigned: 'Unassigned',
  description: 'Description',
  links: 'Linked issues',
  comments: 'Comments',
  noLinks: 'No linked issues.',
  noComments: 'No comments.',
  loading: 'Loading the ticket…',
  close: 'Close',
  openInJira: 'Open in Jira',
  addToComposer: 'Add to composer',
  inComposer: 'In the composer',
  openSession: 'Open session',
  tryAgain: 'Try again',
} as const;

/** AC-44: why the dialog has no ticket. */
export function ticketProblemLine(key: string, result: 'not_found' | 'not_connected' | 'unreachable'): string {
  switch (result) {
    case 'not_found':
      return `Jira can't find ${key}, or you can't see it.`;
    case 'not_connected':
      return 'Jira is not connected. Connect it in Settings.';
    case 'unreachable':
      return "Jira didn't answer.";
  }
}
