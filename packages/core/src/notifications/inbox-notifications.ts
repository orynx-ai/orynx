import type { NotificationWhat } from '@devhub/contracts';
import type { PullRequestRecord } from '../integrations/github/map.ts';
import type { JiraIssueRecord } from '../integrations/jira/map.ts';

/** A notification a sync raises, under the id it's kept by (spec 029). */
export interface InboxNotice {
  id: string;
  what: NotificationWhat;
}

function pullRequestOf(record: PullRequestRecord) {
  return { repository: record.repository, number: record.number, title: record.title, url: record.url };
}

/**
 * What GitHub's sync found that its last one didn't (AC-22): a review asked of you, or asked again, and checks
 * that started failing on your own pull request.
 */
export function githubNotifications(
  before: readonly PullRequestRecord[],
  after: readonly PullRequestRecord[],
): InboxNotice[] {
  const last = new Map(before.map((record) => [record.id, record]));
  return after.flatMap((record): InboxNotice[] => {
    const was = last.get(record.id);
    const notices: InboxNotice[] = [];
    const asked = record.reviewRequestedAt;
    if (!record.mine && asked !== null && asked !== was?.reviewRequestedAt) {
      notices.push({
        id: `review_requested:${record.id}:${asked}`,
        what: { kind: 'review_requested', pullRequest: pullRequestOf(record), by: record.author },
      });
    }
    const failed = record.checksFailedAt;
    if (record.mine && failed !== null && failed !== was?.checksFailedAt) {
      notices.push({
        id: `checks_failed:${record.id}:${failed}`,
        what: { kind: 'checks_failed', pullRequest: pullRequestOf(record) },
      });
    }
    return notices;
  });
}

/** Tickets assigned to you that Jira's last sync didn't have (AC-22). One that left and came back is new again. */
export function jiraNotifications(
  before: readonly JiraIssueRecord[],
  after: readonly JiraIssueRecord[],
  at: string,
): InboxNotice[] {
  const last = new Set(before.map((record) => record.key));
  return after
    .filter((record) => !last.has(record.key))
    .map((record) => ({
      id: `jira_assigned:${record.key}:${at}`,
      what: { kind: 'jira_assigned', ticket: { key: record.key, title: record.summary, url: record.url } },
    }));
}
