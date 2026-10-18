import type { ComposerChip, ContextProblem } from '@devhub/contracts';
import type { GitHubClient, GitHubPullProblem } from '../integrations/github/client.ts';
import type { GitHubSyncCredentials } from '../integrations/github/connection.ts';
import type { JiraClient, JiraProblem } from '../integrations/jira/client.ts';
import type { JiraSyncCredentials } from '../integrations/jira/connection.ts';
import type { BriefChip } from './brief.ts';

/**
 * Reads what the composer's chips name before a session starts (spec 015): the ticket from Jira and each pull
 * request from GitHub, all at once. A file passes through as the browser read it. Nothing is cached, and
 * nothing read here is logged.
 */
export interface ContextReader {
  read(context: readonly ComposerChip[]): Promise<ContextRead>;
}

/** Every chip as the brief takes it, in the order you added them; or the first chip that failed, by its place. */
export type ContextRead = { ok: true; chips: BriefChip[] } | { ok: false; chip: number; problem: ContextProblem };

export interface ContextReaderOptions {
  jira: JiraClient;
  jiraConnection: { credentials(): Promise<JiraSyncCredentials | null> };
  github: GitHubClient;
  githubConnection: { credentials(): Promise<GitHubSyncCredentials | null> };
}

type ChipRead = { ok: true; chip: BriefChip } | { ok: false; problem: ContextProblem };

/** Refused credentials need connecting again; a missing ticket and a slow Jira are said as such. */
function fromJira(problem: JiraProblem): ContextProblem {
  switch (problem.kind) {
    case 'not_found':
      return 'not_found';
    case 'unreachable':
    case 'timeout':
      return 'unreachable';
    case 'rejected':
    case 'sign_in_needed':
      return 'not_connected';
    case 'jira_error':
      return 'other';
  }
}

function fromGitHub(problem: GitHubPullProblem): ContextProblem {
  switch (problem.kind) {
    case 'not_found':
      return 'not_found';
    case 'unreachable':
    case 'timeout':
      return 'unreachable';
    case 'rejected':
      return 'not_connected';
    case 'rate_limited':
    case 'github_error':
      return 'other';
  }
}

export function createContextReader({
  jira,
  jiraConnection,
  github,
  githubConnection,
}: ContextReaderOptions): ContextReader {
  async function readTicket(key: string): Promise<ChipRead> {
    const credentials = await jiraConnection.credentials();
    if (credentials?.ok !== true) return { ok: false, problem: 'not_connected' };
    const answer = await jira.issueContext(credentials.request, key);
    if (!answer.ok) return { ok: false, problem: fromJira(answer.problem) };
    return { ok: true, chip: { kind: 'jira', ...answer.issue } };
  }

  async function readPull(chip: Extract<ComposerChip, { kind: 'pull_request' }>): Promise<ChipRead> {
    const credentials = await githubConnection.credentials();
    if (credentials?.ok !== true) return { ok: false, problem: 'not_connected' };
    const ref = { owner: chip.owner, name: chip.name, number: chip.number };
    const [context, diff] = await Promise.all([
      github.pullContext(credentials.token, ref),
      github.pullDiff(credentials.token, ref),
    ]);
    if (!context.ok) return { ok: false, problem: fromGitHub(context.problem) };
    if (!diff.ok) return { ok: false, problem: fromGitHub(diff.problem) };
    const { files, ...pull } = context.pull;
    return {
      ok: true,
      chip: {
        kind: 'pull_request',
        ...ref,
        ...pull,
        diff: diff.diff.kind === 'text' ? diff.diff : { kind: 'too_large', files },
      },
    };
  }

  function readChip(chip: ComposerChip): Promise<ChipRead> {
    if (chip.kind === 'jira') return readTicket(chip.key);
    if (chip.kind === 'pull_request') return readPull(chip);
    return Promise.resolve({ ok: true, chip: { kind: 'file', name: chip.name, text: chip.text } });
  }

  return {
    async read(context) {
      const reads = await Promise.all(context.map(readChip));
      const chips: BriefChip[] = [];
      for (const [place, read] of reads.entries()) {
        if (!read.ok) return { ok: false, chip: place, problem: read.problem };
        chips.push(read.chip);
      }
      return { ok: true, chips };
    },
  };
}
