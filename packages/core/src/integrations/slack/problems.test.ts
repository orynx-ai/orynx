import { describe, expect, it } from 'vitest';
import { describeSlackProblem } from './problems.ts';

describe('Slack problems (spec 016)', () => {
  it('AC-3: names the missing scopes and says to ask the admin, in Q8 words', () => {
    expect(describeSlackProblem({ kind: 'missing_scopes', missing: ['im:history', 'chat:write'] })).toBe(
      "Slack's app is missing im:history and chat:write. Ask your admin to add them, then reinstall the app.",
    );
    expect(describeSlackProblem({ kind: 'missing_scopes', missing: ['a', 'b', 'c'] })).toBe(
      "Slack's app is missing a, b and c. Ask your admin to add them, then reinstall the app.",
    );
  });

  it('AC-4: says Slack refused the token', () => {
    expect(describeSlackProblem({ kind: 'rejected' })).toBe(
      "Slack didn't accept this token. Check it, or copy it again.",
    );
  });

  it('says what to do when Slack is busy, out of reach, slow or erring', () => {
    expect(describeSlackProblem({ kind: 'rate_limited', resetAt: null })).toBe(
      "Slack's rate limit is used up. Try again in a minute.",
    );
    expect(describeSlackProblem({ kind: 'unreachable', code: 'ENOTFOUND' })).toBe(
      "Can't reach slack.com. Check your network or VPN, then try again.",
    );
    expect(describeSlackProblem({ kind: 'timeout' })).toBe("slack.com didn't answer in 10 seconds. Try again.");
    expect(describeSlackProblem({ kind: 'slack_error', error: 'internal_error' })).toBe(
      'Slack answered with an error (internal_error). Try again in a minute.',
    );
  });
});
