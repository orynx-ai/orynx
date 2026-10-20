import type { NotificationWhat, Session, SessionApproval } from '@devhub/contracts';

/** What one session change means for the bell (spec 029). */
export interface SessionNotices {
  /** New notifications, each under the id it's kept by, so the same change twice raises one. */
  added: { id: string; what: NotificationWhat }[];
  /** Approval notifications whose call ended: they lose their buttons and leave Needs you (AC-12). */
  ended: string[];
}

/** One id per waiting call, so its notification can be found again when the call ends. */
export function approvalNotificationId(sessionId: string, approvalId: string): string {
  return `approval:${sessionId}:${approvalId}`;
}

function aboutOf(approval: SessionApproval): Extract<NotificationWhat, { kind: 'approval' }>['about'] {
  if (approval.kind === 'edit' || approval.kind === 'ticket') return approval.kind;
  return approval.alwaysAsk === 'push' || approval.alwaysAsk === 'pull_request' ? approval.alwaysAsk : 'command';
}

function endedKind(after: Session): 'session_finished' | 'session_stopped' | 'session_failed' | 'session_limit' {
  if (after.state === 'done') return 'session_finished';
  if (after.problem === null) return 'session_stopped';
  return after.problem.kind === 'limit' ? 'session_limit' : 'session_failed';
}

/**
 * The notifications a change to one session raises. `quiet` is a change Orynx made itself (Discard, or Orynx
 * closing), which only ends waiting calls: you know about it already.
 */
export function sessionNotifications(before: Session, after: Session, { quiet = false } = {}): SessionNotices {
  const asked = new Set(before.approvals.map((approval) => approval.id));
  const still = new Set(after.approvals.map((approval) => approval.id));
  const ended = before.approvals
    .filter((approval) => !still.has(approval.id))
    .map((approval) => approvalNotificationId(after.id, approval.id));
  if (quiet || after.discardedAt !== null) return { added: [], ended };

  const session = { id: after.id, title: after.title, source: after.source };
  const added: SessionNotices['added'] = after.approvals
    .filter((approval) => !asked.has(approval.id))
    .map((approval) => ({
      id: approvalNotificationId(after.id, approval.id),
      what: {
        kind: 'approval',
        session,
        approvalId: approval.id,
        about: aboutOf(approval),
        command: approval.kind === 'command' ? approval.command : null,
        waiting: true,
      },
    }));
  const finishedOrStopped = (after.state === 'done' || after.state === 'stopped') && after.state !== before.state;
  if (finishedOrStopped) {
    const kind = endedKind(after);
    // A follow-up can finish the same session again, so each end is its own notification.
    added.push({ id: `${kind}:${after.id}:${after.endedAt ?? after.updatedAt}`, what: { kind, session } });
  }
  return { added, ended };
}
