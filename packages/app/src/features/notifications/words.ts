import type { Notification, NotificationWhat } from '@devhub/contracts';
import { personName } from '../../shell/person-name.ts';
import { dayMonth, minute } from '../../words/calendar.ts';
import { waitText } from '../../words/tool-line.ts';
import { sourceLabel } from '../sessions/source-label.ts';

/** The words the panel, a pop-up and a desktop notification use (spec 029, Q6). */
export interface NotificationWords {
  title: string;
  /** The second line in Orynx: the ticket, the session and, for a command, the command. */
  detail: string;
  /** The second line on the desktop, which never shows a command (Assumptions: desktop notifications). */
  desktop: string;
}

const askedFor = {
  command: 'Claude wants to run a command',
  edit: 'Claude wants to edit a file',
  push: 'Claude wants to push',
  pull_request: 'Claude wants to open a pull request',
  ticket: 'Claude wants to delete a ticket',
  server: 'Claude wants to start a server',
  jira: 'Claude wants to change a Jira issue',
} as const;

/** Finished says what Claude left it ready for (spec 031). */
const finished = {
  pull_request: 'Session finished, ready for a pull request',
  push: 'Session finished, ready to push',
  nothing: 'Session finished',
} as const;

const ended = {
  session_stopped: 'Session stopped',
  session_failed: 'Session failed',
  session_limit: 'Session hit Claude’s usage limit',
} as const;

function joined(...parts: readonly (string | null | undefined)[]): string {
  return parts.filter((part) => part !== null && part !== undefined).join(' · ');
}

export function notificationWords(what: NotificationWhat): NotificationWords {
  switch (what.kind) {
    case 'approval': {
      const session = joined(sourceLabel(what.session.source), what.session.title);
      return { title: askedFor[what.about], detail: joined(session, what.command), desktop: session };
    }
    case 'session_finished':
    case 'session_stopped':
    case 'session_failed':
    case 'session_limit': {
      const session = joined(sourceLabel(what.session.source), what.session.title);
      const title = what.kind === 'session_finished' ? finished[what.ready] : ended[what.kind];
      return { title, detail: session, desktop: session };
    }
    case 'review_requested':
    case 'checks_failed': {
      const { repository, number, title } = what.pullRequest;
      const pull = `${repository} #${String(number)} · ${title}`;
      const who = what.kind === 'review_requested' && what.by !== null ? personName(what.by).short : 'Someone';
      return {
        title: what.kind === 'checks_failed' ? 'Checks failed on your pull request' : `${who} requested your review`,
        detail: pull,
        desktop: pull,
      };
    }
    case 'jira_assigned':
      return { title: `${what.ticket.key} assigned to you`, detail: what.ticket.title, desktop: what.ticket.title };
    case 'update_available':
      return { title: `Orynx ${what.version} is out`, detail: 'Settings › About', desktop: 'Settings › About' };
  }
}

/** Send a test notification's words (Q6). */
export const testWords = {
  title: 'Test notification',
  detail: 'This is how Orynx tells you Claude is waiting.',
} as const;

export type NotificationPlace = { kind: 'session'; sessionId: string } | { kind: 'external'; url: string };

/** Whether it's about the session open at `pathname`, which already shows it, its approval callout included. */
export function aboutOpenSession(what: NotificationWhat, pathname: string): boolean {
  return 'session' in what && pathname === `/sessions/${what.session.id}`;
}

/** Where opening a notification goes: its Session screen, or the pull request, ticket or release outside Orynx. */
export function notificationPlace(what: NotificationWhat): NotificationPlace {
  if ('session' in what) return { kind: 'session', sessionId: what.session.id };
  if (what.kind === 'update_available') {
    return { kind: 'external', url: `https://github.com/orynx-ai/orynx/releases/tag/v${what.version}` };
  }
  return { kind: 'external', url: 'pullRequest' in what ? what.pullRequest.url : what.ticket.url };
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Just now", "2 min ago" and "1 h ago" today, then "Yesterday", then the date, on the laptop's calendar. */
export function notificationTime(at: string, now: Date): string {
  const when = new Date(at);
  if (sameDay(when, now)) {
    const ms = now.getTime() - when.getTime();
    return ms < minute ? 'Just now' : `${waitText(ms).short} ago`;
  }
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return sameDay(when, yesterday) ? 'Yesterday' : dayMonth(when, now).short;
}

/** Today and Earlier, by the laptop's day, each in the list's order; a group with nothing in it is left out. */
export function notificationGroups(
  notifications: readonly Notification[],
  now: Date,
): { heading: 'Today' | 'Earlier'; notifications: Notification[] }[] {
  const today = notifications.filter((notification) => sameDay(new Date(notification.at), now));
  const earlier = notifications.filter((notification) => !today.includes(notification));
  return [
    { heading: 'Today' as const, notifications: today },
    { heading: 'Earlier' as const, notifications: earlier },
  ].filter((group) => group.notifications.length > 0);
}
