import type { Notification } from '@devhub/contracts';
import { Button } from '@devhub/ui';
import { useRespondToApproval } from '../../sessions/queries.ts';

/**
 * Allow once and Review on a waiting approval (spec 029, Q3). Allow once is only for a command, and sends the same
 * answer as the Session screen's; an edit, a push or a pull request is answered there, so they get Review alone.
 * An answered approval has no buttons.
 */
export function NotificationActions({
  notification,
  onReview,
  onAllowed,
}: {
  notification: Notification;
  /** Opens the session, whose approval callout answers it. */
  onReview: () => void;
  /** Allow once was sent: the notification is read. */
  onAllowed: () => void;
}) {
  const { what } = notification;
  const sessionId = what.kind === 'approval' ? what.session.id : '';
  const respond = useRespondToApproval(sessionId);
  if (what.kind !== 'approval' || !what.waiting) return null;

  return (
    <>
      {what.about === 'command' ? (
        <Button
          size="sm"
          variant="secondary"
          pending={respond.isPending}
          onClick={() => {
            respond.mutate({ approvalId: what.approvalId, decision: 'allow_once' }, { onSuccess: onAllowed });
          }}
        >
          Allow once
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onReview}>
        Review
      </Button>
    </>
  );
}
