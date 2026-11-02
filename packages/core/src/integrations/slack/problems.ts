import type { SlackProblem } from './client.ts';

/** "a, b and c": a list as a sentence says it. */
function listed(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/** What went wrong, in the words spec 004 used for GitHub, and spec 016's Q8 for missing scopes. */
export function describeSlackProblem(problem: SlackProblem): string {
  switch (problem.kind) {
    case 'rejected':
      return "Slack didn't accept this token. Check it, or copy it again.";
    case 'missing_scopes':
      return `Slack's app is missing ${listed(problem.missing)}. Ask your admin to add them, then reinstall the app.`;
    case 'rate_limited':
      return "Slack's rate limit is used up. Try again in a minute.";
    case 'unreachable':
      return "Can't reach slack.com. Check your network or VPN, then try again.";
    case 'timeout':
      return "slack.com didn't answer in 10 seconds. Try again.";
    case 'slack_error':
      return `Slack answered with an error (${problem.error}). Try again in a minute.`;
  }
}
