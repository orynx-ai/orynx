import type { AlwaysAskReason, JiraChangeAsk, SessionApproval } from '@devhub/contracts';

/**
 * The words of the approval callout and the pill (spec 012, Q8a, Q8b, Q8d, Q8e, Q9). The server sends what
 * waits and why; these say it.
 */

/** What a Jira change asks (spec 044, Q10): "Claude wants to move MAG-12 to In Review". */
function jiraChangeTitle(key: string, change: JiraChangeAsk): string {
  switch (change.action) {
    case 'comment':
      return `Claude wants to comment on ${key}`;
    case 'transition':
      return `Claude wants to move ${key} to ${change.to}`;
    case 'assign':
      return change.to === 'me' ? `Claude wants to assign ${key} to you` : `Claude wants to unassign ${key}`;
  }
}

/** Where a move goes from and to (spec 044): "To Do → In Review". */
export function jiraMoveLine(change: Extract<JiraChangeAsk, { action: 'transition' }>): string {
  return `${change.from ?? 'Its status'} → ${change.to}`;
}

export function approvalTitle(approval: SessionApproval): string {
  if (approval.kind === 'command') return 'Claude wants to run a command';
  if (approval.kind === 'jira') return jiraChangeTitle(approval.key, approval.change);
  if (approval.kind === 'ticket') return 'Claude wants to delete a ticket';
  if (approval.kind === 'server') return 'Claude wants to start a server';
  return approval.creates ? 'Claude wants to create a file' : 'Claude wants to edit a file';
}

/** What a ticket's delete asks (spec 037, Q12i): "Delete ORX-7 · Flaky date test?". */
export function ticketDeleteLine(approval: Extract<SessionApproval, { kind: 'ticket' }>): string {
  return `Delete ${approval.key}${approval.title === null ? '' : ` · ${approval.title}`}?`;
}

export const approvalButtons = {
  allowOnce: 'Allow once',
  deny: 'Deny',
  // A server's Always allow covers the session's repository (spec 042, Q7).
  alwaysServer: 'Always allow in this repository',
  // A Jira change's Always allow turns Claude changes Jira on (spec 044, AC-17).
  alwaysJira: 'Always allow Jira changes',
} as const;

/** Where a server would run, and what that means (spec 042, Q7). */
export function serverLine(approval: Extract<SessionApproval, { kind: 'server' }>): string {
  const where = approval.folder === '.' ? 'In the worktree' : `In ${approval.folder}`;
  return `${where}. It runs in a Terminal tab, outside the sandbox, and keeps running after Claude finishes.`;
}

/** "Always allow npm test": the entry Always allow would save (Q4). */
export function alwaysAllowLabel(entry: string): string {
  return `Always allow ${entry}`;
}

const runsOutside = 'If you allow it, it runs once outside the sandbox.';

/** Why a command asks with Allow once and Deny only (Q8b): its row in Settings › Coding agent says Ask (spec 026). */
export function alwaysAskLine(reason: AlwaysAskReason): string {
  switch (reason) {
    case 'network':
      return `This reaches the network, so it asks first. ${runsOutside}`;
    case 'delete_outside':
      return `This deletes outside the worktree, so it asks first. ${runsOutside}`;
    case 'unsandboxed':
      return 'Claude asked to run this outside the sandbox, so it asks first.';
    case 'push':
      return `This pushes the branch to GitHub, so it asks first. ${runsOutside}`;
    case 'pull_request':
      return `This opens a pull request on GitHub, so it asks first. ${runsOutside}`;
  }
}

export type AnswerError = { kind: 'not_sent' } | { kind: 'not_saved'; entry: string } | { kind: 'jira_not_on' };

/** What went wrong with an answer (Q8e); the call keeps waiting. */
export function answerErrorLine(error: AnswerError): string {
  switch (error.kind) {
    case 'not_sent':
      return "Couldn't send your answer. Try again.";
    case 'not_saved':
      return `Couldn't save ${error.entry} to your allow list. Try again, or allow it once.`;
    case 'jira_not_on':
      return "Couldn't turn on Claude changes Jira. Try again, or allow it once.";
  }
}

/** The lines of a change past the ones shown (Q9). */
export function moreLinesText(count: number): string {
  return `and ${String(count)} more ${count === 1 ? 'line' : 'lines'}`;
}

/** The Session screen's pill while a call waits (Q8d); the sidebar and Home say "Needs you". */
export const needsApprovalLabel = 'Needs your approval';

/** The bar pinned to the window's bottom while the waiting call is out of view (the user's call, 19 Oct 2026). */
export const approvalBar = { title: 'Claude is waiting for your approval', review: 'Review' };
