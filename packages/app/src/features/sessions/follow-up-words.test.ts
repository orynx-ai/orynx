import { describe, expect, it } from 'vitest';
import { cannotSendLine, followUpBox, followUpOffLine, sendFailedLine, tooLongLine } from './follow-up-words.ts';

describe('the follow-up box’s words (spec 013, Q10d)', () => {
  it('AC-11, AC-21: words the box as session.html draws it', () => {
    expect(followUpBox).toEqual({
      label: 'Message Claude',
      placeholder: 'Ask Claude to change something',
      send: 'Send message',
    });
  });

  it('AC-14: says why there’s nothing to carry on, in place of the box', () => {
    expect(followUpOffLine({ kind: 'discarded' })).toBe("The changes were discarded, so Claude can't carry on.");
    expect(followUpOffLine({ kind: 'never_started' })).toBe(
      "Claude never started, so there's nothing to carry on. Start again from the ticket.",
    );
  });

  it('AC-15: says why a message didn’t go, under the box', () => {
    expect(cannotSendLine('too_many')).toBe('Three sessions are already working. Stop one, then send.');
    expect(cannotSendLine('discarded')).toBe("The changes were discarded, so Claude can't carry on.");
    expect(cannotSendLine('never_started')).toBe(
      "Claude never started, so there's nothing to carry on. Start again from the ticket.",
    );
    expect(sendFailedLine).toBe("Couldn't send your message. Try again.");
    expect(tooLongLine).toBe('Keep it under 10,000 characters.');
  });
});
