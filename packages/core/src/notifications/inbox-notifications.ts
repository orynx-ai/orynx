import type { NotificationWhat } from '@devhub/contracts';
import type { DiscordMessageRecord } from '../integrations/discord/map.ts';
import type { PullRequestRecord } from '../integrations/github/map.ts';
import type { JiraIssueRecord } from '../integrations/jira/map.ts';
import type { SlackMessageRecord } from '../integrations/slack/map.ts';

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

/**
 * Slack's and Discord's messages that have waited your wait (spec 016, AC-25): who and where, never the message. Each
 * keeps its own id, so a message that waits through many syncs is told once.
 */
export function replyNotifications(
  tool: 'slack' | 'discord',
  after: readonly (SlackMessageRecord | DiscordMessageRecord)[],
  { replyWaitMs, now }: { replyWaitMs: number; now: number },
): InboxNotice[] {
  return after
    .filter((record) => now - Date.parse(record.waitingSince) >= replyWaitMs)
    .map((record) => ({
      id: `reply_waiting:${tool}:${record.id}`,
      what: {
        kind: 'reply_waiting',
        tool,
        from: record.from,
        channel: record.channel,
        server: 'server' in record ? record.server : null,
        url: record.url,
      },
    }));
}
