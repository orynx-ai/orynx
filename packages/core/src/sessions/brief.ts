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
 * Added to Claude Code's own system prompt (011 Q5). Where Claude can run commands, the last sentences say
 * how they run (012 Q8g); where the sandbox can't run, that it can't (012 Q2b).
 */
export function sessionNote(branch: string, commands: boolean): string {
  const ending = commands
    ? [
        'You can run commands in the worktree.',
        "They run in a sandbox with no network, and some wait for the user's approval.",
        "Run the project's tests and checks before you finish.",
        "When you're done, summarise what you changed and which checks you ran, in a few sentences.",
      ]
    : [
        "You can't run commands on this computer, so say which ones you'd run to check your work.",
        "When you're done, summarise what you changed in a few sentences.",
      ];
  return [
    `You're working in a separate git worktree on the branch ${branch}.`,
    'Make the change the ticket asks for.',
    'If the repository has a CLAUDE.md, read it first.',
    "Don't push, open pull requests or change git settings.",
    ...ending,
    // Claude can't ask mid-task: it asks in its summary, and you answer in the follow-up box (spec 013, Q2a).
    'If you need a decision from the user, finish and ask it in your summary. The user answers in a follow-up.',
  ].join(' ');
}

const briefTitle = /^Jira ticket [A-Z][A-Z0-9_]*-\d+(?: \(([^)\n]*)\))?: [^\n]*$/;

/**
 * The ticket's type and description, read back from a brief saved before spec 013 kept them with the session
 * (spec 013, AC-9): the first line as `ticketBrief` writes it, then the description. Null for any other brief.
 */
export function ticketFromBrief(text: string): { type: string | null; description: string | null } | null {
  const [first = '', ...rest] = text.split('\n\n');
  const title = briefTitle.exec(first);
  if (title === null) return null;
  const description = rest.join('\n\n');
  return {
    type: title[1] ?? null,
    description: description === '' || description === 'No description.' ? null : description,
  };
}
