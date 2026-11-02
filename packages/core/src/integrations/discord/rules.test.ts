import { describe, expect, it } from 'vitest';
import { mentionWaits, snowflakeAt, type DiscordMessage } from './rules.ts';

const me = '80351110224678912';
const since = Date.parse('2026-10-26T10:00:00.000Z');

function message(overrides: Partial<DiscordMessage> = {}): DiscordMessage {
  return {
    id: '1434477000000000001',
    channel: '1100000000000000002',
    author: { id: '1100000000000000050', name: 'Neha K.', bot: false },
    content: `<@${me}> can you confirm the archive API returns 207?`,
    mentions: [me],
    at: '2026-11-02T10:00:00.000Z',
    files: [],
    ...overrides,
  };
}

describe('Discord rules (spec 016, B)', () => {
  it('AC-16: a mention of you waits until you write in its channel or thread after it', () => {
    expect(mentionWaits(message(), [], me, since)).toBe(true);
    expect(
      mentionWaits(
        message(),
        [message({ id: '1434477000000000002', author: { id: me, name: 'me', bot: false } })],
        me,
        since,
      ),
    ).toBe(false);
    expect(mentionWaits(message(), [message({ id: '1434477000000000002' })], me, since)).toBe(true);
  });

  it('AC-14: @everyone, a role, a bot or you never count, only a mention of you by name', () => {
    expect(mentionWaits(message({ mentions: [] }), [], me, since)).toBe(false);
    expect(
      mentionWaits(message({ author: { id: '1100000000000000051', name: 'Deploys', bot: true } }), [], me, since),
    ).toBe(false);
    expect(mentionWaits(message({ author: { id: me, name: 'me', bot: false } }), [], me, since)).toBe(false);
  });

  it('AC-15: a mention from before the 7 days never counts', () => {
    expect(mentionWaits(message({ at: '2026-10-25T10:00:00.000Z' }), [], me, since)).toBe(false);
  });

  it('turns a time into the smallest Discord id from then, for "after" searches', () => {
    expect(snowflakeAt(Date.parse('2015-01-01T00:00:00.000Z'))).toBe('0');
    expect(snowflakeAt(Date.parse('2026-10-26T10:00:00.000Z'))).toBe(String((BigInt(since) - 1420070400000n) << 22n));
  });
});
