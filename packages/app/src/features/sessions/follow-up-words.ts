import type { CannotSendReason, SessionFollowUp } from '@devhub/contracts';

/** The follow-up box's words (spec 013, Q10d), as `session.html` draws the box. */
export const followUpBox = {
  label: 'Message Claude',
  placeholder: 'Ask Claude to change something',
  send: 'Send message',
};

const discarded = "The changes were discarded, so Claude can't carry on.";
const neverStarted = "Claude never started, so there's nothing to carry on. Start again from the ticket.";
const newer = (key: string) => `${key} has a newer session.`;

/** AC-14: the line in place of the box, with a link to the newer session when there is one. */
export function followUpOffLine(
  followUp: Exclude<SessionFollowUp, { kind: 'open' }>,
  key: string,
): { line: string; link: { label: string; sessionId: string } | null } {
  switch (followUp.kind) {
    case 'discarded':
      return { line: discarded, link: null };
    case 'never_started':
      return { line: neverStarted, link: null };
    case 'newer_session':
      return { line: newer(key), link: { label: 'Open it', sessionId: followUp.sessionId } };
  }
}

/** AC-15: why a message didn't go, under the box. */
export function cannotSendLine(reason: CannotSendReason, key: string): string {
  switch (reason) {
    case 'too_many':
      return 'Three sessions are already working. Stop one, then send.';
    case 'discarded':
      return discarded;
    case 'never_started':
      return neverStarted;
    case 'newer_session':
      return newer(key);
  }
}

export const sendFailedLine = "Couldn't send your message. Try again.";
export const tooLongLine = 'Keep it under 10,000 characters.';
