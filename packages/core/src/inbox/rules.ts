import type { InboxItem, InboxReason, InboxRules, SessionSummary } from '@devhub/contracts';
import type { PullRequestRecord } from '../integrations/github/map.ts';
import type { JiraIssueRecord } from '../integrations/jira/map.ts';

/**
 * "What counts as needs you" (product spec, Home): pure functions from what the last sync kept, the inbox
 * rules and the waiting sessions to Home's rows. Rules apply here, when Home reads, so turning one off
 * changes the list at once without asking Jira or GitHub again (spec 007).
 */

export interface InboxSources {
  jira: readonly JiraIssueRecord[];
  github: readonly PullRequestRecord[];
  sessions: readonly SessionSummary[];
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
    subject: { kind: 'issue', key: record.key, status: record.status, highPriorityBug: record.highPriorityBug },
    reason: jiraReason(record),
    waitingSince: record.waitingSince,
    target: { kind: 'external', url: record.url },
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
    },
    reason: found.reason,
    waitingSince: found.since,
    target: { kind: 'external', url: found.url },
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
  };
}

/** Home's rows, longest wait first. */
export function inboxItems(sources: InboxSources, rules: InboxRules): InboxItem[] {
  const rows = new Map<string, InboxItem>();
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
        });
      }
    }
  }

  return [...rows.values()].sort(
    (a, b) => Date.parse(a.waitingSince) - Date.parse(b.waitingSince) || a.id.localeCompare(b.id),
  );
}
