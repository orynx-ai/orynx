import { describe, expect, it } from 'vitest';
import { messageLink, plainText, slackRecord, slackTime, titleOf } from './map.ts';
import type { SlackMessage } from './rules.ts';

const names = new Map([['U024BE7LH', 'Rakesh D.']]);

describe('Slack map (spec 016, B)', () => {
  it('AC-10: writes mentions, channels and links as Slack shows them, and decodes its three escapes', () => {
    expect(
      plainText('<@U024BE7LH> see <#C024BE91L|web-platform> and <https://x.example/a|the doc> &lt;3 &amp; more', names),
    ).toBe('@Rakesh D. see #web-platform and the doc <3 & more');
    expect(plainText('<@U0UNKNOWN> <https://x.example/a> <!here>', names)).toBe('@someone https://x.example/a @here');
  });

  it('AC-10: a row’s title is the first line, up to 120 characters; a file alone is named', () => {
    expect(titleOf('First line\nsecond line', [], names)).toBe('First line');
    expect(titleOf('a'.repeat(130), [], names)).toBe(`${'a'.repeat(119)}…`);
    expect(titleOf('', [{ name: 'trace.log' }], names)).toBe('trace.log');
    expect(titleOf('   ', [], names)).toBe('A message with no text');
  });

  it('reads a ts as its time, and links a message the way Slack does, a reply with its thread', () => {
    expect(slackTime('1793613600.000100')).toBe('2026-11-02T10:00:00.000Z');
    expect(messageLink('https://acme.slack.com/', 'C024BE91L', '1793613600.000100', null)).toBe(
      'https://acme.slack.com/archives/C024BE91L/p1793613600000100',
    );
    expect(messageLink('https://acme.slack.com/', 'C024BE91L', '1793613700.000200', '1793613600.000100')).toBe(
      'https://acme.slack.com/archives/C024BE91L/p1793613700000200?thread_ts=1793613600.000100&cid=C024BE91L',
    );
  });

  it('AC-24: a record keeps only the row: who, where, the first line, when and the link', () => {
    const message: SlackMessage = {
      channel: 'C024BE91L',
      ts: '1793613600.000100',
      threadTs: null,
      user: 'U0NEHA0001',
      bot: false,
      text: '<@U024BE7LH> can you confirm?\nLong details that stay in Slack.',
      files: [],
    };
    expect(
      slackRecord(message, { from: 'Neha K.', channel: 'web-platform' }, 'https://acme.slack.com/', names),
    ).toEqual({
      id: 'C024BE91L/1793613600.000100',
      title: '@Rakesh D. can you confirm?',
      from: 'Neha K.',
      channel: 'web-platform',
      waitingSince: '2026-11-02T10:00:00.000Z',
      url: 'https://acme.slack.com/archives/C024BE91L/p1793613600000100',
    });
  });
});
