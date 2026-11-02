import { describe, expect, it } from 'vitest';
import { describeDiscordProblem } from './problems.ts';

describe('Discord problems (spec 016)', () => {
  it('AC-7: says to turn on Message Content Intent, in Q8 words', () => {
    expect(describeDiscordProblem({ kind: 'intent_off' })).toBe(
      'Turn on Message Content Intent for your bot, then connect again.',
    );
  });

  it('AC-8: asks for your user ID when a team owns the bot', () => {
    expect(describeDiscordProblem({ kind: 'user_id_needed' })).toBe(
      'A team owns this bot. Paste your Discord user ID too.',
    );
  });

  it('says Discord refused the token, and what to do when it is busy, out of reach, slow or erring', () => {
    expect(describeDiscordProblem({ kind: 'rejected' })).toBe(
      "Discord didn't accept this token. Check it, or reset it in the Developer Portal.",
    );
    expect(describeDiscordProblem({ kind: 'rate_limited', resetAt: null })).toBe(
      "Discord's rate limit is used up. Try again in a minute.",
    );
    expect(describeDiscordProblem({ kind: 'unreachable', code: 'ENOTFOUND' })).toBe(
      "Can't reach discord.com. Check your network or VPN, then try again.",
    );
    expect(describeDiscordProblem({ kind: 'timeout' })).toBe("discord.com didn't answer in 10 seconds. Try again.");
    expect(describeDiscordProblem({ kind: 'discord_error', status: 502 })).toBe(
      'Discord answered with an error (502). Try again in a minute.',
    );
  });
});
