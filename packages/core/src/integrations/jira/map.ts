import { z } from 'zod';
import type { InboxProblem } from '@devhub/contracts';
import type { JiraAssignedIssue, JiraProblem } from './client.ts';

/**
 * An assigned, unfinished issue as the inbox keeps it in the cache (spec 007): titles and metadata only,
 * never a description or a comment.
 */
export const JiraIssueRecordSchema = z.object({
  key: z.string().min(1),
  summary: z.string().min(1),
  /** The status's own name, shown as it is. */
  status: z.string(),
  /** From the status category, never the name (integration-adapter skill). */
  category: z.enum(['to_do', 'in_progress']),
  /** A type named "Bug", in any case, with one of the site's two highest priorities (spec 007, Q2f). */
  highPriorityBug: z.boolean(),
  dueDate: z.iso.date().nullable(),
  /** When the issue entered its status category, or when it was created if Jira doesn't say. */
  waitingSince: z.iso.datetime(),
  url: z.url({ protocol: /^https$/ }),
});
export type JiraIssueRecord = z.infer<typeof JiraIssueRecordSchema>;

// A key that is safe to put in a link: project letters, a dash and a number.
const issueKey = /^[A-Z][A-Z0-9_]*-\d+$/;

/** Jira writes offsets as `+0000`; ISO wants `+00:00`. Null when it isn't a time at all. */
function isoTime(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const at = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}

function categoryOf(key: string): JiraIssueRecord['category'] | null {
  if (key === 'done') return null;
  return key === 'indeterminate' ? 'in_progress' : 'to_do';
}

/** The inbox's records for `site`, in Jira's order. Done issues and keys that can't make a safe link are left out. */
export function jiraRecords(
  site: string,
  issues: readonly JiraAssignedIssue[],
  priorityOrder: readonly string[],
): JiraIssueRecord[] {
  const highest = new Set(priorityOrder.slice(0, 2));
  return issues.flatMap(({ key, fields }) => {
    const category = categoryOf(fields.status.statusCategory.key);
    const waitingSince = isoTime(fields.statuscategorychangedate) ?? isoTime(fields.created);
    if (category === null || waitingSince === null || !issueKey.test(key)) return [];
    const summary = fields.summary?.trim() ?? '';
    const bug = fields.issuetype?.name.toLowerCase() === 'bug';
    const priority = fields.priority?.id;
    const dueDate = z.iso.date().safeParse(fields.duedate);
    return [
      {
        key,
        summary: summary === '' ? key : summary,
        status: fields.status.name,
        category,
        highPriorityBug: bug && priority !== undefined && highest.has(priority),
        dueDate: dueDate.success ? dueDate.data : null,
        waitingSince,
        url: `https://${site}/browse/${key}`,
      },
    ];
  });
}

/** A failed read in the inbox's terms (spec 007, Q5b). */
export function jiraInboxProblem(problem: JiraProblem, site: string): InboxProblem {
  switch (problem.kind) {
    case 'rejected':
      return { kind: 'rejected' };
    case 'sign_in_needed':
      return { kind: 'sign_in_needed', site };
    case 'not_found':
    case 'unreachable':
    case 'timeout':
    case 'jira_error':
      return { kind: 'no_answer' };
  }
}
