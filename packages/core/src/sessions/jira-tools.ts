import { z } from 'zod';
import { JiraIssueKeySchema, type SessionActivity } from '@devhub/contracts';
import type { OrynxTool } from '../agents/agent-adapter.ts';
import type { JiraCheckRequest, JiraClient, JiraProblem } from '../integrations/jira/client.ts';

/**
 * Orynx's Jira tools for a session (spec 044), on the `orynx` MCP server beside its ticket tools, while Jira is
 * connected: Claude finds and reads your Jira issues as you would in Jira. They run in Orynx with its saved login, so
 * Claude sees Jira's answers and never the login. Each one that did something is a step; one that failed is not.
 */

type JiraActivity = Extract<SessionActivity, { kind: 'jira' }>;

/** A step one of the tools did, as `jira` steps keep it: its action, and the fields that action needs. */
export type JiraStep = Pick<JiraActivity, 'action'> &
  Partial<Pick<JiraActivity, 'key' | 'summary' | 'found' | 'more' | 'to'>>;

export interface JiraToolsContext {
  jira: JiraClient;
  /** The saved Jira login, read for each call; null once Jira isn't connected or its token can't be read. */
  request(): Promise<JiraCheckRequest | null>;
  /** Adds the call's step to Claude's progress. */
  did(step: JiraStep): Promise<void>;
}

/** The tool's answer when a call failed: what Jira's problem means, in words Claude can act on (spec 044). */
function problemText(problem: JiraProblem, key?: string): string {
  switch (problem.kind) {
    case 'rejected':
    case 'sign_in_needed':
      return "Jira refused Orynx's saved login. Reconnect Jira in Settings › Connections.";
    case 'timeout':
      return 'Jira took too long to answer.';
    case 'not_found':
      return key === undefined ? "Orynx couldn't reach Jira." : `There's no Jira issue ${key}, or you can't see it.`;
    case 'unreachable':
    case 'jira_error':
      return "Orynx couldn't reach Jira.";
  }
}

const failed = (text: string) => ({ text, error: true as const });
const notConnected = failed("Jira isn't connected in Orynx any more. Connect it in Settings › Connections.");
const inputRefused = (error: z.ZodError) => failed(`Orynx couldn't take that: ${z.prettifyError(error)}`);

const SearchSchema = z.object({
  jql: z.string().trim().min(1, 'Send a JQL query.').max(2_000),
  limit: z.int().min(1).max(100, 'Ask for at most 100 issues; narrow the query for the rest.').default(50),
});
const IssueSchema = z.object({ key: JiraIssueKeySchema });

export function jiraTools(context: JiraToolsContext): OrynxTool[] {
  const { jira } = context;
  return [
    {
      name: 'list_jira_projects',
      description:
        'Lists the Jira projects the user can see, each with its key and name. Use it to turn a project\'s name ("acme") into the key JQL needs.',
      input: z.object({}),
      asks: () => Promise.resolve(null),
      async run() {
        const request = await context.request();
        if (request === null) return notConnected;
        const answer = await jira.projects(request);
        if (!answer.ok) return failed(problemText(answer.problem));
        await context.did({ action: 'projects' });
        return { text: JSON.stringify(answer.projects) };
      },
    },
    {
      name: 'search_jira',
      description:
        "Searches the user's Jira with JQL, as they would in Jira: `assignee = currentUser() AND issuetype = Bug AND project = MAG`. Answers with each issue's key, summary, type, status and its category, priority, assignee, due date and last update, at most `limit` (50 by default, at most 100), and whether Jira found more; narrow the query rather than asking for more. Read an issue's description and comments with get_jira_issue.",
      input: SearchSchema,
      asks: () => Promise.resolve(null),
      async run(input) {
        const search = SearchSchema.safeParse(input);
        if (!search.success) return inputRefused(search.error);
        const request = await context.request();
        if (request === null) return notConnected;
        const answer = await jira.search(request, search.data.jql, search.data.limit);
        if (!answer.ok)
          return failed(
            'refused' in answer ? `Jira refused the query: ${answer.refused}` : problemText(answer.problem),
          );
        await context.did({ action: 'searched', found: answer.issues.length, more: answer.more });
        return { text: JSON.stringify({ issues: answer.issues, more: answer.more }) };
      },
    },
    {
      name: 'get_jira_issue',
      description:
        'Reads one Jira issue by its key (MAG-1234): its summary, type, description in Markdown, status, priority, assignee, reporter, due date, labels, its last 20 comments and its linked issues.',
      input: IssueSchema,
      asks: () => Promise.resolve(null),
      async run(input) {
        const issue = IssueSchema.safeParse(input);
        if (!issue.success) return inputRefused(issue.error);
        const request = await context.request();
        if (request === null) return notConnected;
        const answer = await jira.issueContext(request, issue.data.key);
        if (!answer.ok) return failed(problemText(answer.problem, issue.data.key));
        await context.did({ action: 'read', key: answer.issue.key, summary: answer.issue.summary });
        return { text: JSON.stringify(answer.issue) };
      },
    },
  ];
}
