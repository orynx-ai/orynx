import { describe, expect, it } from 'vitest';
import { describeGitHubProblem, type GitHubConnectProblem } from './problems.ts';

describe('describeGitHubProblem', () => {
  it.each([
    [
      { kind: 'gh_missing' },
      "DevHub can't find the gh command. Install it from cli.github.com, or use a personal access token.",
    ],
    [{ kind: 'gh_signed_out' }, "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again."],
    [
      { kind: 'gh_failed', exitCode: 4 },
      "The gh command didn't give a token. Run gh auth status in a terminal to see why.",
    ],
    [{ kind: 'gh_timeout' }, "The gh command didn't give a token. Run gh auth status in a terminal to see why."],
    [{ kind: 'unreachable', code: 'ENOTFOUND' }, "Can't reach github.com. Check your network or VPN, then try again."],
    [{ kind: 'timeout' }, "github.com didn't answer in 10 seconds. Try again."],
    [{ kind: 'github_error', status: 503 }, 'GitHub answered with an error (503). Try again in a minute.'],
    [
      { kind: 'rate_limited', resetAt: null },
      "GitHub's rate limit for this account is used up. Try again in a minute.",
    ],
  ] satisfies [GitHubConnectProblem, string][])(
    'AC-4, AC-8: says %j in the words from Q6 (c), whichever way was used',
    (problem, message) => {
      expect(describeGitHubProblem(problem, 'gh')).toBe(message);
      expect(describeGitHubProblem(problem, 'token')).toBe(message);
    },
  );

  it('AC-6: a refused token and a refused gh login say what to do for each', () => {
    expect(describeGitHubProblem({ kind: 'rejected' }, 'token')).toBe(
      "GitHub didn't accept this token. Check it, or create a new one.",
    );
    expect(describeGitHubProblem({ kind: 'rejected' }, 'gh')).toBe(
      "GitHub didn't accept your gh login. Run gh auth login in a terminal, then try again.",
    );
  });

  it('AC-7: a missing repo scope says how to fix it for each way', () => {
    expect(describeGitHubProblem({ kind: 'no_repo_scope' }, 'token')).toBe(
      "This token can't read private repositories. Create one with the repo scope.",
    );
    expect(describeGitHubProblem({ kind: 'no_repo_scope' }, 'gh')).toBe(
      "Your gh login can't read private repositories. Run gh auth refresh --scopes repo, then try again.",
    );
  });

  it('AC-8: names the local time the rate limit resets, as 24-hour hours and minutes', () => {
    const resetAt = new Date(2026, 9, 17, 14, 5, 30).getTime();
    expect(describeGitHubProblem({ kind: 'rate_limited', resetAt }, 'token')).toBe(
      "GitHub's rate limit for this account is used up. Try again after 14:05.",
    );
    const early = new Date(2026, 9, 17, 9, 0, 0).getTime();
    expect(describeGitHubProblem({ kind: 'rate_limited', resetAt: early }, 'gh')).toBe(
      "GitHub's rate limit for this account is used up. Try again after 09:00.",
    );
  });
});
