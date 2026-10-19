import { TicketDetailSchema, type TicketColumn, type TicketDetail } from '@devhub/contracts';
import type { JiraIssueContext } from './client.ts';
import { isoTime } from './map.ts';
import { columnOf } from './sprint-map.ts';

/**
 * One ticket as the ticket dialog shows it (spec 022, Q8), from Jira's answer. The column is the board's when
 * Tickets holds the ticket, else its status category's; the link is built from the saved site, never taken from
 * Jira. Times become ISO, and a comment with a time Jira wrote oddly keeps its text without the time.
 */
export function ticketDetailOf(
  issue: JiraIssueContext,
  { site, column, session }: { site: string; column: TicketColumn | null; session: TicketDetail['session'] },
): TicketDetail {
  return TicketDetailSchema.parse({
    key: issue.key,
    url: `https://${site}/browse/${issue.key}`,
    title: issue.summary,
    type: issue.type,
    status:
      issue.status === null
        ? null
        : { name: issue.status.name, column: column ?? columnOf({ id: '', category: issue.status.category }, null) },
    priority: issue.priority,
    assignee: issue.assignee,
    reporter: issue.reporter,
    dueDate: issue.dueDate,
    labels: issue.labels,
    created: isoTime(issue.created),
    updated: isoTime(issue.updated),
    description: issue.description,
    links: issue.links.map(({ summary, ...link }) => ({ ...link, title: summary })),
    comments: issue.comments.map((comment) => ({ ...comment, created: isoTime(comment.created) })),
    session,
  });
}
