import type { AgentBrief } from '../agents/agent-adapter.ts';
import type { JiraIssueDetail } from '../integrations/jira/client.ts';

/**
 * What Claude is sent when a session starts (spec 011, Q5). Until the composer arrives (015), the brief is
 * the ticket alone: one context chip and no message. The same text is saved as the session's `brief.md`,
 * so you can read exactly what Claude got.
 */
export function ticketBrief(issue: JiraIssueDetail): AgentBrief {
  const type = issue.type === null ? '' : ` (${issue.type})`;
  return {
    message: '',
    context: [
      {
        kind: 'jira',
        title: `Jira ticket ${issue.key}${type}: ${issue.summary}`,
        body: issue.description ?? 'No description.',
      },
    ],
  };
}

/** The brief as Claude reads it: your message, then each chip's title and body, a blank line apart. */
export function briefText(brief: AgentBrief): string {
  const parts = brief.message.trim() === '' ? [] : [brief.message.trim()];
  for (const chip of brief.context) parts.push(`${chip.title}\n\n${chip.body}`);
  return parts.join('\n\n');
}

/**
 * Added to Claude Code's own system prompt (Q5). The last two sentences change when approvals let commands
 * run (spec 012).
 */
export function sessionNote(branch: string): string {
  return [
    `You're working in a separate git worktree on the branch ${branch}.`,
    'Make the change the ticket asks for.',
    'If the repository has a CLAUDE.md, read it first.',
    "Don't push, open pull requests or change git settings.",
    "You can't run commands in this version, so say which ones you'd run to check your work.",
    "When you're done, summarise what you changed in a few sentences.",
  ].join(' ');
}
