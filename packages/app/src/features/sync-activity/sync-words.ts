import {
  syncActivityLimits,
  type InboxProblem,
  type InboxSource,
  type SyncRun,
  type SyncTool,
} from '@devhub/contracts';
import type { StatusDotTone } from '@devhub/ui';
import { clockText, dayMonth, minute, plural } from '../../words/calendar.ts';

/** The words of the Sync activity modal (spec 035, Q3). */

export const toolNames: Record<InboxSource, string> = { jira: 'Jira', github: 'GitHub' };

export const changeKinds = { new: 'New', updated: 'Updated', removed: 'Removed' } as const;

export interface ProblemWords {
  title: string;
  fix: string;
  /** Red when only you can fix it; amber when Orynx gets past it on its own. */
  tone: 'danger' | 'warning';
  reconnect: boolean;
}

const tryAgain = `Orynx tries again at the next sync, in ${String(syncActivityLimits.everyMinutes)} min.`;

export function problemWords(tool: InboxSource, problem: InboxProblem): ProblemWords {
  const name = toolNames[tool];
  switch (problem.kind) {
    case 'rejected':
      return {
        title: `${name} refused Orynx’s saved token.`,
        fix: 'Reconnect to fix it. Syncing again won’t help.',
        tone: 'danger',
        reconnect: true,
      };
    case 'sign_in_needed':
      return {
        title: `${name} wants you to sign in on the web first.`,
        fix: `Sign in at ${problem.site}, then press Retry.`,
        tone: 'danger',
        reconnect: false,
      };
    case 'rate_limited':
      return {
        title: `${name}’s rate limit is used up${problem.until === null ? '' : ` until ${clockText(problem.until)}`}.`,
        fix: 'Orynx syncs again after that. Nothing for you to do.',
        tone: 'warning',
        reconnect: false,
      };
    case 'no_answer':
      return { title: `${name} didn’t answer.`, fix: tryAgain, tone: 'warning', reconnect: false };
    case 'other':
      return { title: problem.message, fix: tryAgain, tone: 'warning', reconnect: false };
  }
}

const failedShort: Record<InboxProblem['kind'], string | null> = {
  rejected: 'token refused',
  sign_in_needed: 'sign-in needed',
  rate_limited: 'rate limit',
  no_answer: 'no answer',
  other: null,
};

/** "Failed · token refused", "2 new · 1 updated", "No changes". */
export function runSummary(run: SyncRun): string {
  if (run.problem !== null) {
    const short = failedShort[run.problem.kind];
    return short === null ? 'Failed' : `Failed · ${short}`;
  }
  const parts = (['new', 'updated', 'removed'] as const).flatMap((kind) => {
    const count = run.changes.filter((change) => change.kind === kind).length;
    return count === 0 ? [] : [`${String(count)} ${kind}`];
  });
  if (run.moreChanges > 0) parts.push(`${String(run.moreChanges)} more`);
  return parts.length === 0 ? 'No changes' : parts.join(' · ');
}

const needAttention = (count: number) => `${String(count)} ${count === 1 ? 'needs' : 'need'} attention`;

/** The head's line: "2 connected · 1 needs attention · 1 not connected". */
export function activityHeadline(tools: readonly SyncTool[]): string {
  const off = tools.filter((tool) => tool.state.state === 'not_connected').length;
  const attention = tools.filter((tool) => tool.state.state === 'failed').length;
  const parts = [
    `${String(tools.length - off)} connected`,
    attention === 0 ? 'all syncing fine' : needAttention(attention),
  ];
  if (off > 0) parts.push(`${String(off)} not connected`);
  return parts.join(' · ');
}

/** The button's name, which says what its red dot shows. */
export function buttonName(attention: number): string {
  return attention === 0 ? 'Sync activity' : `Sync activity, ${needAttention(attention)}`;
}

/** A tool in the list: its line under the name, its state for a screen reader, and its dot. */
export function toolLine(tool: SyncTool): { line: string; state: string; tone: StatusDotTone } {
  if (tool.state.state === 'not_connected') return { line: 'Not connected', state: 'Not connected', tone: 'off' };
  if (tool.state.state === 'failed') {
    const since = tool.failingSince ?? tool.lastSyncAt;
    return { line: since === null ? 'Failing' : `Failing since ${clockText(since)}`, state: 'Failing', tone: 'danger' };
  }
  return {
    line: tool.lastSyncAt === null ? 'Not synced yet' : `Synced ${clockText(tool.lastSyncAt)}`,
    state: 'Syncing fine',
    tone: 'success',
  };
}

/** The detail's line under the tool's name. */
export function statusLine(tool: SyncTool): string {
  if (tool.state.state === 'not_connected') return 'Not connected. Nothing is synced.';
  if (tool.state.state === 'failed') {
    return tool.lastGoodSyncAt === null ? 'Failing' : `Failing · last good sync ${clockText(tool.lastGoodSyncAt)}`;
  }
  return tool.lastSyncAt === null ? 'Not synced yet' : `Syncing fine · last sync ${clockText(tool.lastSyncAt)}`;
}

/** The problem callout's last line: "Failing since 09:42 · 3 failed syncs". */
export function failingLine(tool: SyncTool): string {
  const since = tool.failingSince === null ? 'Failing' : `Failing since ${clockText(tool.failingSince)}`;
  return `${since} · ${plural(tool.failedInARow, 'failed sync')}`;
}

/** The four stats, as drawn. The next sync is the last one plus the schedule's 2 minutes. */
export function syncStats(tool: SyncTool, now: Date): { term: string; detail: string }[] {
  const next =
    tool.lastSyncAt === null
      ? 'Soon'
      : clockText(new Date(Date.parse(tool.lastSyncAt) + syncActivityLimits.everyMinutes * minute).toISOString());
  return [
    { term: 'Last good sync', detail: tool.lastGoodSyncAt === null ? 'None yet' : timeText(tool.lastGoodSyncAt, now) },
    { term: 'Next sync', detail: next },
    { term: 'Changes today', detail: String(tool.changesToday) },
    { term: 'Success, last 2 h', detail: `${String(tool.lastTwoHours.worked)} of ${String(tool.lastTwoHours.total)}` },
  ];
}

/** "09:57" today, "19 Oct 09:57" on an earlier day. */
export function timeText(iso: string, now: Date): string {
  const date = new Date(iso);
  return date.toDateString() === now.toDateString() ? clockText(iso) : `${dayMonth(date, now).short} ${clockText(iso)}`;
}

/** "1.2s". */
export function tookText(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
