import type { AlwaysAskReason, SessionApproval } from '@devhub/contracts';

/**
 * The words of the approval callout and the pill (spec 012, Q8a, Q8b, Q8d, Q8e, Q9). The server sends what
 * waits and why; these say it.
 */

export function approvalTitle(approval: SessionApproval): string {
  if (approval.kind === 'command') return 'Claude wants to run a command';
  return approval.creates ? 'Claude wants to create a file' : 'Claude wants to edit a file';
}

export const approvalButtons = { allowOnce: 'Allow once', deny: 'Deny' } as const;

/** "Always allow npm test": the entry Always allow would save (Q4). */
export function alwaysAllowLabel(entry: string): string {
  return `Always allow ${entry}`;
}

const runsOutside = 'If you allow it, it runs once outside the sandbox.';

/** Why a command asks in every mode (Q8b). */
export function alwaysAskLine(reason: AlwaysAskReason): string {
  switch (reason) {
    case 'network':
      return `This reaches the network, so it always asks. ${runsOutside}`;
    case 'delete_outside':
      return `This deletes outside the worktree, so it always asks. ${runsOutside}`;
    case 'unsandboxed':
      return 'Claude asked to run this outside the sandbox, so it always asks.';
  }
}

export type AnswerError = { kind: 'not_sent' } | { kind: 'not_saved'; entry: string };

/** What went wrong with an answer (Q8e); the call keeps waiting. */
export function answerErrorLine(error: AnswerError): string {
  return error.kind === 'not_sent'
    ? "Couldn't send your answer. Try again."
    : `Couldn't save ${error.entry} to your allow list. Try again, or allow it once.`;
}

/** The lines of a change past the ones shown (Q9). */
export function moreLinesText(count: number): string {
  return `and ${String(count)} more ${count === 1 ? 'line' : 'lines'}`;
}

/** The Session screen's pill while a call waits (Q8d); the sidebar and Home say "Needs you". */
export const needsApprovalLabel = 'Needs your approval';
