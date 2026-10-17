import type { JiraProblem } from './client.ts';

/** What went wrong, in the words from spec 003 Q5(c). `site` is the bare host. */
export function describeJiraProblem(problem: JiraProblem, site: string): string {
  switch (problem.kind) {
    case 'rejected':
      return "Jira didn't accept this email and API token. Check both, or create a new token.";
    case 'sign_in_needed':
      return `Jira wants you to sign in on the web first. Sign in at ${site}, then try again.`;
    case 'not_found':
      return `There's no Jira at ${site}. Check the address.`;
    case 'unreachable':
      return `Can't reach ${site}. Check your network or VPN, then try again.`;
    case 'timeout':
      return `${site} didn't answer in 10 seconds. Try again.`;
    case 'jira_error':
      return `Jira answered with an error (${String(problem.status)}). Try again in a minute.`;
  }
}
