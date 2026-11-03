import {
  threadFromLink,
  type ComposerChip,
  type Inbox,
  type InboxItem,
  type InboxRules,
  type InboxTab,
} from '@devhub/contracts';
import type { PillTone } from '@devhub/ui';
import { personName } from '../../shell/person-name.ts';
import { agoText } from '../../words/ago.ts';
import { calendarDay, day, daysUntil, months, plural, weekdays } from '../../words/calendar.ts';
import { waitText } from '../../words/tool-line.ts';
import { chipFromPaste } from './composer-rules.ts';
import { chipLabel, composerWords } from './composer-words.ts';

// Moved to `words/` so Tickets writes them the same way (spec 008); Home's own importers keep these.
export { toolLine, waitText, type ToolLine } from '../../words/tool-line.ts';

/**
 * Every word Home's "Needs your attention" list shows (spec 007, Q2, Q5, Q6, Q8). The server sends data;
 * these turn it into words with the laptop's clock, so a wait moves on each minute without a request.
 */

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

/** Q2e: a due date is its own reason, with no wait. */
function duePill(on: string, highPriorityBug: boolean, now: Date): ReasonPill {
  const days = daysUntil(on, now);
  if (days < 0) {
    const late = -days;
    return { text: `Overdue · ${String(late)} d`, spoken: `Overdue by ${plural(late, 'day')}`, tone: 'danger' };
  }
  const due = calendarDay(on);
  if (days > 6) {
    // Due later is neutral, whatever the issue (Q2e).
    const month = months[due.getMonth()] ?? '';
    return {
      text: `Due ${String(due.getDate())} ${month.slice(0, 3)}`,
      spoken: `Due ${String(due.getDate())} ${month}`,
      tone: 'neutral',
    };
  }
  const tone: PillTone = highPriorityBug ? 'danger' : days <= 2 ? 'warning' : 'neutral';
  if (days === 0) return { text: 'Due today', spoken: 'Due today', tone };
  if (days === 1) return { text: 'Due tomorrow', spoken: 'Due tomorrow', tone };
  const weekday = weekdays[due.getDay()] ?? '';
  return { text: `Due ${weekday.slice(0, 3)}`, spoken: `Due ${weekday}`, tone };
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
    case 'no_reply':
      return withWait('No reply', waited, 'warning');
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
    case 'message': {
      // Spec 016, B: "Neha K. in #web-platform", "· Acme" on Discord, "Arjun M. · direct message".
      if (subject.channel === null) return `${subject.from} · direct message`;
      const where = `${subject.from} in #${subject.channel}`;
      return subject.server === null ? where : `${where} · ${subject.server}`;
    }
  }
}

/**
 * A row's one action (spec 022, D): Open session for a session, or a ticket's or a pull request's chip for + Add to
 * composer, with how the chip reads ("PROJ-1423", "web-app #2841"). A pull request whose link can't be read as one
 * has none. Your own pull request's comments or failing checks get Fix instead, which starts a Build on its branch
 * with `message` (spec 047); one from a fork keeps +. A review asked of you gets Review with Claude (spec 050).
 */
export type RowAction =
  | { kind: 'session'; sessionId: string; label: 'Open session'; name: string }
  | { kind: 'compose'; chip: ComposerChip; label: string }
  | {
      kind: 'fix';
      chip: Extract<ComposerChip, { kind: 'pull_request' }>;
      label: string;
      name: string;
      message: string;
    }
  | { kind: 'review'; chip: Extract<ComposerChip, { kind: 'pull_request' }>; label: string; name: string }
  | { kind: 'none' };

/** A message row's thread as a chip, named as the row says it (spec 016, C); null for any other row. */
export function threadChipOf(
  item: InboxItem,
): Extract<ComposerChip, { kind: 'slack_thread' | 'discord_thread' }> | null {
  const { subject, target } = item;
  if (subject.kind !== 'message' || target.kind !== 'external') return null;
  const chip = threadFromLink(target.url);
  if (chip === null) return null;
  return { ...chip, label: { from: subject.from, channel: subject.channel, server: subject.server } };
}

export function rowAction(item: InboxItem): RowAction {
  const { subject, target } = item;
  if (target.kind === 'session') {
    return { kind: 'session', sessionId: target.sessionId, label: 'Open session', name: `Open session: ${item.title}` };
  }
  // A message's thread can go to Claude as context (spec 016, AC-29).
  if (subject.kind === 'message') {
    const thread = threadChipOf(item);
    return thread === null ? { kind: 'none' } : { kind: 'compose', chip: thread, label: chipLabel(thread) };
  }
  if (subject.kind === 'issue')
    return { kind: 'compose', chip: { kind: 'jira', key: subject.key }, label: subject.key };
  // A pull request's link, to whichever tab its reason points at, names it as a pasted link does.
  const chip = chipFromPaste(target.url);
  if (chip?.kind !== 'pull_request') return { kind: 'none' };
  const label = chipLabel(chip);
  const { reason } = item;
  if (subject.kind === 'pull_request' && !subject.mine && reason.kind === 'review_requested') {
    return { kind: 'review', chip, label: composerWords.review.label, name: composerWords.review.name(label) };
  }
  if (subject.kind === 'pull_request' && subject.mine && subject.fork !== true) {
    if (reason.kind === 'unresolved_comments' || reason.kind === 'checks_failing') {
      const words = composerWords.fix[reason.kind];
      return { kind: 'fix', chip, label: words.label, name: `${words.label}: ${label}`, message: words.message(label) };
    }
  }
  return { kind: 'compose', chip, label };
}

/** How many rows each tab counts; All counts every row. */
export function tabCounts(items: readonly InboxItem[]): Record<'all' | InboxTab, number> {
  return {
    all: items.length,
    jira: items.filter((item) => item.tab === 'jira').length,
    pull_requests: items.filter((item) => item.tab === 'pull_requests').length,
    slack: items.filter((item) => item.tab === 'slack').length,
    discord: items.filter((item) => item.tab === 'discord').length,
  };
}

/** Q8c: the page bar's line, or null when no tool is connected or no sync has had every tool answer. */
export function syncLine(inbox: Inbox, now: Date): string | null {
  const connected = [inbox.tools.jira, inbox.tools.github].filter((tool) => tool.state !== 'not_connected');
  if (connected.length === 0) return null;
  if (inbox.syncedAt !== null) return `Synced ${agoText(now.getTime() - Date.parse(inbox.syncedAt))}`;
  return connected.every((tool) => tool.state === 'syncing') ? 'Syncing' : null;
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
      : { title: 'The Jira rule is off', line: 'Turn them on in Settings › Inbox rules.', rulesOff: true };
  }
  if (tab === 'slack' || tab === 'discord') {
    // Spec 016, Q8.
    const name = tab === 'slack' ? 'Slack' : 'Discord';
    if (!rules[`${tab}_waiting`]) {
      return { title: `The ${name} rule is off`, line: 'Turn it on in Settings › Inbox rules.', rulesOff: true };
    }
    const what = tab === 'slack' ? 'Mentions and DMs' : 'Mentions';
    return {
      title: `Nobody is waiting on a reply in ${name}`,
      line: `${what} you haven't answered show up here.`,
      rulesOff: false,
    };
  }
  return pullRequestRules.some((rule) => rules[rule])
    ? {
        title: 'No pull requests need you',
        line: 'Review requests, and your pull requests with failing checks or unresolved comments, show up here.',
        rulesOff: false,
      }
    : { title: 'The pull request rules are off', line: 'Turn them on in Settings › Inbox rules.', rulesOff: true };
}
