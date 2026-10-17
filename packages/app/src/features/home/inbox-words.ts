import type { Inbox, InboxItem, InboxRules, InboxTab, InboxToolState } from '@devhub/contracts';
import type { PillTone } from '@devhub/ui';
import { personName } from '../../shell/person-name.ts';

/**
 * Every word Home's "Needs your attention" list shows (spec 007, Q2, Q5, Q6, Q8). The server sends data;
 * these turn it into words with the laptop's clock, so a wait moves on each minute without a request.
 */

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function plural(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
}

/** Q2c: "12 min", "3 h" or "9 d", never weeks; at least a minute. The spoken form says the words. */
export function waitText(ms: number): { short: string; spoken: string } {
  if (ms < hour) {
    const minutes = Math.max(1, Math.floor(ms / minute));
    return { short: `${String(minutes)} min`, spoken: plural(minutes, 'minute') };
  }
  if (ms < day) {
    const hours = Math.floor(ms / hour);
    return { short: `${String(hours)} h`, spoken: plural(hours, 'hour') };
  }
  const days = Math.floor(ms / day);
  return { short: `${String(days)} d`, spoken: plural(days, 'day') };
}

export interface ReasonPill {
  text: string;
  /** What a screen reader hears instead of `text`, with the units in words. */
  spoken: string;
  tone: PillTone;
}

function withWait(label: string, waited: number, tone: PillTone): ReasonPill {
  const wait = waitText(waited);
  return { text: `${label} · ${wait.short}`, spoken: `${label}, ${wait.spoken}`, tone };
}

/** `on` (YYYY-MM-DD) as midnight on the laptop's calendar. */
function dueDate(on: string): Date {
  const [year = 0, month = 1, date = 1] = on.split('-').map(Number);
  return new Date(year, month - 1, date);
}

/** Whole calendar days from today to `on`; negative when it's past. Rounded, so a clock change doesn't count. */
function daysUntil(on: string, now: Date): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((dueDate(on).getTime() - today.getTime()) / day);
}

/** Q2e: a due date is its own reason, with no wait. */
function duePill(on: string, highPriorityBug: boolean, now: Date): ReasonPill {
  const days = daysUntil(on, now);
  if (days < 0) {
    const late = -days;
    return { text: `Overdue · ${String(late)} d`, spoken: `Overdue by ${plural(late, 'day')}`, tone: 'danger' };
  }
  const tone: PillTone = highPriorityBug ? 'danger' : days <= 2 ? 'warning' : 'neutral';
  if (days === 0) return { text: 'Due today', spoken: 'Due today', tone };
  if (days === 1) return { text: 'Due tomorrow', spoken: 'Due tomorrow', tone };
  const due = dueDate(on);
  if (days <= 6) {
    const weekday = weekdays[due.getDay()] ?? '';
    return { text: `Due ${weekday.slice(0, 3)}`, spoken: `Due ${weekday}`, tone };
  }
  const month = months[due.getMonth()] ?? '';
  return {
    text: `Due ${String(due.getDate())} ${month.slice(0, 3)}`,
    spoken: `Due ${String(due.getDate())} ${month}`,
    tone,
  };
}

/** Q2b, Q2d, Q2e: the pill for a row, at `now`. */
export function reasonPill(item: InboxItem, now: Date): ReasonPill {
  const waited = now.getTime() - Date.parse(item.waitingSince);
  const { reason } = item;
  switch (reason.kind) {
    case 'review_requested':
      return withWait('Review requested', waited, waited < day ? 'info' : 'warning');
    case 'checks_failing':
      return withWait('Checks failing', waited, 'danger');
    case 'unresolved_comments':
      return withWait(`${String(reason.count)} unresolved comment${reason.count === 1 ? '' : 's'}`, waited, 'warning');
    case 'approval':
      return withWait('Approve command', waited, 'warning');
    case 'bug':
      return withWait('Bug', waited, 'danger');
    case 'status':
      return reason.category === 'to_do'
        ? withWait('To do', waited, 'neutral')
        : withWait('In progress', waited, 'warning');
    case 'due':
      return duePill(reason.on, reason.highPriorityBug, now);
  }
}

/** Q8a: what the row is about, under its title. */
export function subLine(item: InboxItem): string {
  const { subject } = item;
  switch (subject.kind) {
    case 'issue':
      if (subject.highPriorityBug) return `${subject.key} · Bug · high priority`;
      return subject.status === '' ? subject.key : `${subject.key} · ${subject.status}`;
    case 'pull_request': {
      const pull = `${subject.repository} #${String(subject.number)}`;
      if (subject.mine) return `${pull} · your pull request`;
      return subject.author === null ? pull : `${pull} · by ${personName(subject.author).short}`;
    }
    case 'session': {
      const { source } = subject;
      if (source === null) return 'Claude session';
      const what = source.kind === 'jira' ? source.key : `PR #${String(source.number)}`;
      return `${what} · Claude session`;
    }
  }
}

/** Q6: "Review" for a review request; "Open" for the rest until spec 011 adds Build and Fix. */
export function actionLabel(item: InboxItem): string {
  return item.reason.kind === 'review_requested' ? 'Review' : 'Open';
}

/** How many rows each tab counts; All counts every row. */
export function tabCounts(items: readonly InboxItem[]): Record<'all' | InboxTab, number> {
  return {
    all: items.length,
    jira: items.filter((item) => item.tab === 'jira').length,
    pull_requests: items.filter((item) => item.tab === 'pull_requests').length,
  };
}

/** "just now" under a minute, then "12 min ago", "2 h ago" or "3 d ago". */
function agoText(ms: number): string {
  return ms < minute ? 'just now' : `${waitText(ms).short} ago`;
}

/** Q8c: the page bar's line, or null when no tool is connected or no sync has had every tool answer. */
export function syncLine(inbox: Inbox, now: Date): string | null {
  const connected = [inbox.tools.jira, inbox.tools.github].filter((tool) => tool.state !== 'not_connected');
  if (connected.length === 0) return null;
  if (inbox.syncedAt !== null) return `Synced ${agoText(now.getTime() - Date.parse(inbox.syncedAt))}`;
  return connected.every((tool) => tool.state === 'syncing') ? 'Syncing' : null;
}

export interface ToolLine {
  message: string;
  /** A link after the message, to a Settings tab; the screen ends it with a full stop. */
  action: { text: string; tab: 'connections' } | null;
}

const toolNames = { jira: 'Jira', github: 'GitHub' } as const;

function clock(iso: string): string {
  const time = new Date(iso);
  return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
}

/** Q5: one quiet line for a tool that isn't connected or whose last sync failed; null otherwise. */
export function toolLine(tool: keyof typeof toolNames, state: InboxToolState, now: Date): ToolLine | null {
  const name = toolNames[tool];
  if (state.state === 'not_connected') {
    return { message: `${name} is not connected.`, action: { text: 'Connect it in Settings', tab: 'connections' } };
  }
  if (state.state !== 'failed') return null;
  // Only a tool that may still be fine says how old its rows are; a refused token says what to do.
  const age =
    state.lastSyncedAt === null
      ? ''
      : ` These are from ${waitText(Math.max(minute, now.getTime() - Date.parse(state.lastSyncedAt))).short} ago.`;
  const { problem } = state;
  switch (problem.kind) {
    case 'no_answer':
      return { message: `${name} didn't answer.${age}`, action: null };
    case 'rate_limited':
      return {
        message: `${name}'s rate limit is used up${problem.until === null ? '' : ` until ${clock(problem.until)}`}.${age}`,
        action: null,
      };
    case 'rejected':
      return {
        message: `${name} refused the saved token.`,
        action: { text: 'Reconnect it in Settings', tab: 'connections' },
      };
    case 'sign_in_needed':
      return {
        message: `${name} wants you to sign in on the web first. Sign in at ${problem.site}, then press Refresh.`,
        action: null,
      };
    case 'other':
      return { message: problem.message, action: null };
  }
}

export interface EmptyText {
  title: string;
  line: string;
  /** The tab is empty because its rules are off; the line names Settings › Inbox rules. */
  rulesOff: boolean;
}

const pullRequestRules = ['review_requested', 'checks_failing', 'unresolved_comments'] as const;

/** Q8b: what an empty tab says, and whether that's because its rules are off. */
export function emptyText(tab: 'all' | InboxTab, rules: InboxRules): EmptyText {
  if (tab === 'all') {
    return Object.values(rules).every((on) => !on)
      ? { title: 'Every inbox rule is off', line: 'Turn some on in Settings › Inbox rules.', rulesOff: true }
      : {
          title: 'Nothing needs you',
          line: 'Tickets assigned to you and pull requests waiting on you show up here.',
          rulesOff: false,
        };
  }
  if (tab === 'jira') {
    return rules.jira_assigned
      ? {
          title: 'No Jira tickets need you',
          line: "Tickets assigned to you that aren't done show up here.",
          rulesOff: false,
        }
      : { title: 'The Jira rule is off', line: 'Turn it on in Settings › Inbox rules.', rulesOff: true };
  }
  return pullRequestRules.some((rule) => rules[rule])
    ? {
        title: 'No pull requests need you',
        line: 'Review requests, and your pull requests with failing checks or unresolved comments, show up here.',
        rulesOff: false,
      }
    : { title: 'The pull request rules are off', line: 'Turn them on in Settings › Inbox rules.', rulesOff: true };
}
