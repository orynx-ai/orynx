import { describe, expect, it } from 'vitest';
import { firstUnanswered, mentionWaits, type SlackMessage } from './rules.ts';

const me = 'U024BE7LH';
const since = Date.parse('2026-10-26T10:00:00.000Z');

function message(overrides: Partial<SlackMessage> = {}): SlackMessage {
  return {
    channel: 'C024BE91L',
    ts: '1793613600.000100',
    threadTs: null,
    user: 'U0NEHA0001',
    bot: false,
    text: `<@${me}> can you confirm the archive API returns 207?`,
    files: [],
    ...overrides,
  };
}

describe('Slack rules (spec 016, B)', () => {
  it('AC-10: a mention of you waits until you write in its thread after it', () => {
    const mention = message();
    expect(mentionWaits(mention, [], me, since)).toBe(true);
    expect(mentionWaits(mention, [message({ user: 'U0ARJUN001', ts: '1793613700.000100' })], me, since)).toBe(true);
    expect(mentionWaits(mention, [message({ user: me, ts: '1793613700.000100' })], me, since)).toBe(false);
    // Your own message before the mention doesn't answer it.
    expect(mentionWaits(mention, [message({ user: me, ts: '1793613500.000100' })], me, since)).toBe(true);
  });

  it('AC-14: @here, @channel, @everyone, a user group, a bot or you never count', () => {
    for (const text of [
      '<!here> deploy?',
      '<!channel> deploy?',
      '<!everyone> deploy?',
      '<!subteam^S0614TZR7> deploy?',
    ]) {
      expect(mentionWaits(message({ text }), [], me, since)).toBe(false);
    }
    expect(mentionWaits(message({ bot: true }), [], me, since)).toBe(false);
    expect(mentionWaits(message({ user: me }), [], me, since)).toBe(false);
  });

  it('AC-15: a mention from before the 7 days never counts', () => {
    expect(mentionWaits(message({ ts: '1792900000.000100' }), [], me, since)).toBe(false);
  });

  it('AC-11, AC-12: a DM waits from its first message after your last one, and not once you answered', () => {
    const history = [
      message({ channel: 'D0ARJUN01', user: 'U0ARJUN001', ts: '1793613000.000100', text: 'hey' }),
      message({ channel: 'D0ARJUN01', user: me, ts: '1793613100.000100', text: 'hi' }),
      message({ channel: 'D0ARJUN01', user: 'U0ARJUN001', ts: '1793613200.000100', text: 'Pushed the change' }),
      message({ channel: 'D0ARJUN01', user: 'U0ARJUN001', ts: '1793613300.000100', text: 'mind a look?' }),
    ];
    expect(firstUnanswered(history, me, since)?.ts).toBe('1793613200.000100');
    expect(firstUnanswered([...history, message({ user: me, ts: '1793613400.000100' })], me, since)).toBeNull();
    // A bot's DM never waits on you.
    expect(firstUnanswered([message({ channel: 'D0BOT0001', bot: true })], me, since)).toBeNull();
  });
});
