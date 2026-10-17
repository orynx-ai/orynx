import type { GitHubMethod } from '@devhub/contracts';
import type { GitHubProblem } from './client.ts';
import type { GhProblem } from './gh.ts';

/** Everything that can stop GitHub from connecting: gh, GitHub itself, or a token without `repo` (spec 004, Q3). */
export type GitHubConnectProblem = GhProblem | GitHubProblem | { kind: 'no_repo_scope' };

/** 24-hour local time, built by hand so it reads the same whatever the computer's locale. */
function clock(at: number): string {
  const time = new Date(at);
  return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
}

/** What went wrong, in the words from spec 004 Q6 (c). `method` is how the token was found. */
export function describeGitHubProblem(problem: GitHubConnectProblem, method: GitHubMethod): string {
  switch (problem.kind) {
    case 'gh_missing':
      return "DevHub can't find the gh command. Install it from cli.github.com, or use a personal access token.";
    case 'gh_signed_out':
      return "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again.";
    case 'gh_failed':
    case 'gh_timeout':
      return "The gh command didn't give a token. Run gh auth status in a terminal to see why.";
    case 'rejected':
      return method === 'gh'
        ? "GitHub didn't accept your gh login. Run gh auth login in a terminal, then try again."
        : "GitHub didn't accept this token. Check it, or create a new one.";
    case 'no_repo_scope':
      return method === 'gh'
        ? "Your gh login can't read private repositories. Run gh auth refresh --scopes repo, then try again."
        : "This token can't read private repositories. Create one with the repo scope.";
    case 'rate_limited':
      // Q6 gives only the timed wording; GitHub doesn't always say when the limit resets.
      return problem.resetAt === null
        ? "GitHub's rate limit for this account is used up. Try again in a minute."
        : `GitHub's rate limit for this account is used up. Try again after ${clock(problem.resetAt)}.`;
    case 'unreachable':
      return "Can't reach github.com. Check your network or VPN, then try again.";
    case 'timeout':
      return "github.com didn't answer in 10 seconds. Try again.";
    case 'github_error':
      return `GitHub answered with an error (${String(problem.status)}). Try again in a minute.`;
  }
}
