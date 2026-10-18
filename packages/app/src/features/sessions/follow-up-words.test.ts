import { describe, expect, it } from 'vitest';
import { cannotSendLine, followUpBox, followUpOffLine, sendFailedLine, tooLongLine } from './follow-up-words.ts';

describe('the follow-up box’s words (spec 013, Q10d)', () => {
  it('AC-11, AC-21: words the box as session.html draws it', () => {
    expect(followUpBox).toEqual({
      label: 'Message Claude',
      placeholder: 'Ask Claude to change something',
      hint: 'Enter to send · Shift+Enter for a new line',
      send: 'Send message',
    });
  });

  it('AC-14: says why there’s nothing to carry on, in place of the box', () => {
    expect(followUpOffLine({ kind: 'discarded' }, 'PROJ-1423')).toEqual({
      line: "The changes were discarded, so Claude can't carry on.",
      link: null,
    });
    expect(followUpOffLine({ kind: 'never_started' }, 'PROJ-1423')).toEqual({
      line: "Claude never started, so there's nothing to carry on. Start again from the ticket.",
      link: null,
    });
    expect(followUpOffLine({ kind: 'newer_session', sessionId: 'fedcba9876543210' }, 'PROJ-1423')).toEqual({
      line: 'PROJ-1423 has a newer session.',
      link: { label: 'Open it', sessionId: 'fedcba9876543210' },
    });
  });

  it('AC-15: says why a message didn’t go, under the box', () => {
    expect(cannotSendLine('too_many', 'PROJ-1423')).toBe('Three sessions are already working. Stop one, then send.');
    expect(cannotSendLine('discarded', 'PROJ-1423')).toBe("The changes were discarded, so Claude can't carry on.");
    expect(cannotSendLine('never_started', 'PROJ-1423')).toBe(
      "Claude never started, so there's nothing to carry on. Start again from the ticket.",
    );
    expect(cannotSendLine('newer_session', 'PROJ-1423')).toBe('PROJ-1423 has a newer session.');
    expect(sendFailedLine).toBe("Couldn't send your message. Try again.");
    expect(tooLongLine).toBe('Keep it under 10,000 characters.');
  });
});
