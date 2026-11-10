import type { InboxItem, InboxReason, InboxRules, SessionSummary } from '@devhub/contracts';
import type { DiscordMessageRecord } from '../integrations/discord/map.ts';
import type { PullRequestRecord } from '../integrations/github/map.ts';
import type { JiraIssueRecord } from '../integrations/jira/map.ts';
import type { SlackMessageRecord } from '../integrations/slack/map.ts';
import { sessionsByTicket } from '../sessions/ticket-sessions.ts';

/**
 * "What counts as needs you" (product spec, Home): pure functions from what the last sync kept, the inbox
 * rules and the waiting sessions to Home's rows. Rules apply here, when Home reads, so turning one off
 * changes the list at once without asking Jira or GitHub again (spec 007).
 */

export interface InboxSources {
  jira: readonly JiraIssueRecord[];
  github: readonly PullRequestRecord[];
  /** Slack's and Discord's messages waiting on your reply (spec 016); none when left out. */
  slack?: readonly SlackMessageRecord[];
  discord?: readonly DiscordMessageRecord[];
  /** With the pull request each reviews, as `pullKey` names it (spec 050), for a review row's read ahead (spec 057). */
  sessions: readonly (SessionSummary & { reviewing?: string | null })[];
  /** Review requests waiting to be read ahead (spec 057, D), as `owner/name#number`; none when left out. */
  waitingToRead?: readonly string[];
}

/** How long a message must wait before it's a row (Settings › Inbox rules, spec 016), and the time now. */
export interface ReplyWait {
  waitMs: number;
  now: number;
}

/** A message waiting on your reply (spec 016, B): who, where, and a link back to it. */
function messageRow(tool: 'slack' | 'discord', record: SlackMessageRecord | DiscordMessageRecord): InboxItem {
  return {
    id: `${tool}:${record.id}`,
    source: tool,
    tab: tool,
    title: record.title,
    subject: {
      kind: 'message',
      from: record.from,
      channel: record.channel,
      server: 'server' in record ? record.server : null,
    },
    reason: { kind: 'no_reply' },
    waitingSince: record.waitingSince,
    target: { kind: 'external', url: record.url },
    readAhead: null,
  };
}

/** Q2e: a due date first, then a high-priority bug, then the status category. */
function jiraReason(record: JiraIssueRecord): InboxReason {
  if (record.dueDate !== null) return { kind: 'due', on: record.dueDate, highPriorityBug: record.highPriorityBug };
  if (record.highPriorityBug) return { kind: 'bug' };
  return { kind: 'status', category: record.category };
}

function jiraRow(record: JiraIssueRecord): InboxItem {
  return {
    id: `jira:${record.key}`,
    source: 'jira',
    tab: 'jira',
    title: record.summary,
    subject: {
      kind: 'issue',
      key: record.key,
      status: record.status,
      highPriorityBug: record.highPriorityBug,
      type: record.type ?? null,
    },
    reason: jiraReason(record),
    waitingSince: record.waitingSince,
    target: { kind: 'external', url: record.url },
    readAhead: null,
  };
}

/** Q4: one row per pull request, with the most pressing reason its rules let through. */
function pullRequestRow(record: PullRequestRecord, rules: InboxRules): InboxItem | null {
  let found: { reason: InboxReason; since: string; url: string } | null = null;
  if (rules.checks_failing && record.checksFailedAt !== null) {
    found = { reason: { kind: 'checks_failing' }, since: record.checksFailedAt, url: `${record.url}/checks` };
  } else if (rules.unresolved_comments && record.unresolved !== null) {
    found = {
      reason: { kind: 'unresolved_comments', count: record.unresolved.count },
      since: record.unresolved.since,
      url: record.url,
    };
  } else if (rules.review_requested && record.reviewRequestedAt !== null) {
    found = { reason: { kind: 'review_requested' }, since: record.reviewRequestedAt, url: `${record.url}/files` };
  }
  if (found === null) return null;
  return {
    id: `github:${record.id}`,
    source: 'github',
    tab: 'pull_requests',
    title: record.title,
    subject: {
      kind: 'pull_request',
      repository: record.repository,
      number: record.number,
      author: record.author,
      mine: record.mine,
      ...(record.fork === true ? { fork: true } : {}),
    },
    reason: found.reason,
    waitingSince: found.since,
    target: { kind: 'external', url: found.url },
    readAhead: null,
  };
}

/** A waiting session's own row, in its ticket's or pull request's tab. */
function sessionRow(session: SessionSummary): InboxItem {
  const source = session.source === null ? null : session.source.kind === 'jira' ? 'jira' : 'github';
  return {
    id: `session:${session.id}`,
    source,
    tab: source === null ? null : source === 'jira' ? 'jira' : 'pull_requests',
    title: session.title,
    subject: { kind: 'session', source: session.source },
    reason: { kind: 'approval' },
    waitingSince: session.updatedAt,
    target: { kind: 'session', sessionId: session.id },
    readAhead: null,
  };
}

/** Home's rows, longest wait first. */
export function inboxItems(sources: InboxSources, rules: InboxRules, wait?: ReplyWait): InboxItem[] {
  const rows = new Map<string, InboxItem>();
  // A message counts once it has waited as long as Settings says, so a change there needs no sync (spec 016).
  const waited = (record: { waitingSince: string }) =>
    wait === undefined || wait.now - Date.parse(record.waitingSince) >= wait.waitMs;
  for (const tool of ['slack', 'discord'] as const) {
    if (!rules[`${tool}_waiting`]) continue;
    for (const record of sources[tool] ?? [])
      if (waited(record)) rows.set(`${tool}:${record.id}`, messageRow(tool, record));
  }
  if (rules.jira_assigned) for (const record of sources.jira) rows.set(`jira:${record.key}`, jiraRow(record));
  for (const record of sources.github) {
    const row = pullRequestRow(record, rules);
    if (row !== null) rows.set(row.id, row);
  }

  if (rules.session_waiting) {
    // Longest wait first, so when two sessions wait on one ticket, the same one takes its row every time.
    const waiting = sources.sessions
      .filter((session) => session.state === 'needs_you')
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt) || a.id.localeCompare(b.id));
    for (const session of waiting) {
      // A session on an assigned ticket takes over that ticket's row, keeping its title and sub line.
      const ticket = session.source?.kind === 'jira' ? rows.get(`jira:${session.source.key}`) : undefined;
      if (ticket?.reason.kind === 'approval') continue;
      if (ticket === undefined) {
        rows.set(`session:${session.id}`, sessionRow(session));
      } else {
        rows.set(ticket.id, {
          ...ticket,
          reason: { kind: 'approval' },
          waitingSince: session.updatedAt,
          target: { kind: 'session', sessionId: session.id },
          readAhead: null,
        });
      }
    }
  }

  // A review asked of you says whether Claude reads it ahead, or has (spec 057, D): its live review, or its turn.
  const waitingToRead = new Set((sources.waitingToRead ?? []).map((id) => id.toLowerCase()));
  for (const record of sources.github) {
    const row = rows.get(`github:${record.id}`);
    if (row?.reason.kind !== 'review_requested') continue;
    const key = record.id.toLowerCase();
    const review = sources.sessions.find(
      (session) => session.reviewing === key && session.state !== 'stopped' && session.state !== 'pr_closed',
    );
    const readAhead =
      review === undefined
        ? waitingToRead.has(key)
          ? ({ state: 'waiting', sessionId: null } as const)
          : null
        : ({ state: review.state === 'done' ? 'ready' : 'reading', sessionId: review.id } as const);
    rows.set(row.id, { ...row, readAhead });
  }

  // An issue with a live session opens that session, so Home says Open instead of Build (spec 011, AC-15).
  for (const [key, session] of sessionsByTicket(sources.sessions)) {
    const row = rows.get(`jira:${key}`);
    if (session !== null && row?.target.kind === 'external') {
      rows.set(row.id, { ...row, target: { kind: 'session', sessionId: session.id } });
    }
  }

  return [...rows.values()].sort(
    (a, b) => Date.parse(a.waitingSince) - Date.parse(b.waitingSince) || a.id.localeCompare(b.id),
  );
}
