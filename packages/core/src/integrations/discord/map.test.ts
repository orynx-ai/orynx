import { describe, expect, it } from 'vitest';
import { discordRecord, plainText, titleOf } from './map.ts';
import type { DiscordMessage } from './rules.ts';

const names = new Map([['80351110224678912', 'Rakesh D.']]);

describe('Discord map (spec 016, B)', () => {
  it('AC-16: writes mentions, roles, channels and custom emoji as Discord shows them', () => {
    expect(
      plainText(
        '<@80351110224678912> <@!80351110224678912> see <#1100000000000000002> <@&1100000000000000077> <:party:1100000000000000088>',
        names,
      ),
    ).toBe('@Rakesh D. @Rakesh D. see #channel @role :party:');
    expect(plainText('<@1100000000000000060>', names)).toBe('@someone');
  });

  it('AC-16: a row’s title is the first line, up to 120 characters; a file alone is named', () => {
    expect(titleOf('First\nsecond', [], names)).toBe('First');
    expect(titleOf('', [{ name: 'trace.log' }], names)).toBe('trace.log');
  });

  it('AC-16, AC-24: a record keeps only the row, with the server, and links to discord.com', () => {
    const message: DiscordMessage = {
      id: '1434477000000000001',
      channel: '1100000000000000002',
      author: { id: '1100000000000000050', name: 'Neha K.', bot: false },
      content: '<@80351110224678912> can you confirm?\nDetails that stay in Discord.',
      mentions: ['80351110224678912'],
      at: '2026-11-02T10:00:00.000Z',
      files: [],
    };
    expect(
      discordRecord(message, { guild: '1100000000000000001', server: 'Acme', channel: 'web-platform' }, names),
    ).toEqual({
      id: '1100000000000000002/1434477000000000001',
      title: '@Rakesh D. can you confirm?',
      from: 'Neha K.',
      channel: 'web-platform',
      server: 'Acme',
      waitingSince: '2026-11-02T10:00:00.000Z',
      url: 'https://discord.com/channels/1100000000000000001/1100000000000000002/1434477000000000001',
    });
  });
});
