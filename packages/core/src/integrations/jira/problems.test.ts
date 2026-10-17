import { describe, expect, it } from 'vitest';
import { describeJiraProblem } from './problems.ts';

const site = 'your-team.atlassian.net';

describe('describeJiraProblem', () => {
  it.each([
    [{ kind: 'rejected' }, "Jira didn't accept this email and API token. Check both, or create a new token."],
    [
      { kind: 'sign_in_needed' },
      'Jira wants you to sign in on the web first. Sign in at your-team.atlassian.net, then try again.',
    ],
    [{ kind: 'not_found' }, "There's no Jira at your-team.atlassian.net. Check the address."],
    [
      { kind: 'unreachable', code: 'ENOTFOUND' },
      "Can't reach your-team.atlassian.net. Check your network or VPN, then try again.",
    ],
    [{ kind: 'timeout' }, "your-team.atlassian.net didn't answer in 10 seconds. Try again."],
    [{ kind: 'jira_error', status: 503 }, 'Jira answered with an error (503). Try again in a minute.'],
  ] as const)('AC-4, AC-5, AC-6: says %j in the words from Q5(c)', (problem, message) => {
    expect(describeJiraProblem(problem, site)).toBe(message);
  });
});
