import { z } from 'zod';
import { JiraIssueKeySchema, type SessionActivity } from '@devhub/contracts';
import type { AgentAsk, OrynxTool } from '../agents/agent-adapter.ts';
import type { JiraCheckRequest, JiraClient, JiraProblem } from '../integrations/jira/client.ts';

/**
 * Orynx's Jira tools for a session (spec 044), on the `orynx` MCP server beside its ticket tools, while Jira is
 * connected: Claude finds and reads your Jira issues as you would in Jira, and comments on, moves or assigns one once
 * you allow it. They run in Orynx with its saved login, so Claude sees Jira's answers and never the login. Each one that
 * did something is a step; one that failed is not.
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
  /** Whether Claude changes Jira is on (Q8), read again for each change: off, every change asks. */
  changesAllowed(): Promise<boolean>;
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
  limit: z.int().min(1).max(100, 'Ask for at most 100 issues a page; pass `next` for the rest.').default(50),
  next: z.string().min(1).max(2_000).optional(),
});
const IssueSchema = z.object({ key: JiraIssueKeySchema });
const CommentSchema = z.object({
  key: JiraIssueKeySchema,
  text: z.string().trim().min(1, 'Send the comment.').max(30_000),
});
const MoveSchema = z.object({ key: JiraIssueKeySchema, status: z.string().trim().min(1, "Send the status's name.") });
const AssignSchema = z.object({ key: JiraIssueKeySchema, to: z.enum(['me', 'nobody']) });

/** The issue's transition to `status`, by the name of the status it leads to, in this issue's own workflow only. */
function transitionTo(transitions: readonly { id: string; to: string }[], status: string) {
  return transitions.find((transition) => transition.to.trim().toLowerCase() === status.toLowerCase());
}

/** Why a move can't happen, with where the issue can go instead (spec 044, AC-15). */
function cannotMove(key: string, status: string, from: string | null, transitions: readonly { to: string }[]): string {
  const places = transitions.map((transition) => transition.to).join(', ');
  const where = places === '' ? 'nowhere' : places;
  return `${key} can't move to ${status}. ${from === null ? 'It' : `From ${from} it`} can move to: ${where}.`;
}

export function jiraTools(context: JiraToolsContext): OrynxTool[] {
  const { jira } = context;

  /**
   * What you're asked before a change (spec 044): null only while Claude changes Jira is on. Input that isn't a change
   * is refused, never asked about.
   */
  async function changeAsk(ask: AgentAsk): Promise<AgentAsk | null> {
    return (await context.changesAllowed()) ? null : ask;
  }

  /** The answer to a change Jira made, refused, or couldn't. */
  function changed(
    answer: { ok: true } | { ok: false; problem: JiraProblem } | { ok: false; refused: string },
    key: string,
    done: string,
  ) {
    if (answer.ok) return { text: done };
    return failed('refused' in answer ? `Jira refused it: ${answer.refused}` : problemText(answer.problem, key));
  }

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
        "Searches the user's Jira with JQL, as they would in Jira: `assignee = currentUser() AND issuetype = Bug AND project = MAG`. Answers with each issue's key, summary, type, status and its category, priority, assignee, due date and last update, at most `limit` (50 by default, at most 100), whether Jira found more, and `next` while it has more: pass `next` to read the next page; narrow the query when you only need a few. Read an issue's description and comments with get_jira_issue.",
      input: SearchSchema,
      asks: () => Promise.resolve(null),
      async run(input) {
        const search = SearchSchema.safeParse(input);
        if (!search.success) return inputRefused(search.error);
        const request = await context.request();
        if (request === null) return notConnected;
        const answer = await jira.search(request, search.data.jql, search.data.limit, search.data.next);
        if (!answer.ok)
          return failed(
            'refused' in answer ? `Jira refused the query: ${answer.refused}` : problemText(answer.problem),
          );
        await context.did({ action: 'searched', found: answer.issues.length, more: answer.more });
        return { text: JSON.stringify({ issues: answer.issues, more: answer.more, next: answer.next }) };
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
    {
      name: 'comment_on_jira_issue',
      description:
        'Comments on a Jira issue, in Markdown (headings, lists, code, bold). The user is asked first, unless they let you change Jira without asking.',
      input: CommentSchema,
      async asks(input) {
        const comment = CommentSchema.safeParse(input);
        if (!comment.success) return { refused: inputRefused(comment.error).text };
        const { key, text } = comment.data;
        return changeAsk({ kind: 'jira', key, change: { action: 'comment', text } });
      },
      async run(input) {
        const comment = CommentSchema.safeParse(input);
        if (!comment.success) return inputRefused(comment.error);
        const request = await context.request();
        if (request === null) return notConnected;
        const { key, text } = comment.data;
        const answer = await jira.comment(request, key, text);
        if (answer.ok) await context.did({ action: 'commented', key });
        return changed(answer, key, `Commented on ${key}.`);
      },
    },
    {
      name: 'transition_jira_issue',
      description:
        "Moves a Jira issue to another status, by the status's name (\"In Review\"), through the issue's own workflow. The user is asked first, unless they let you change Jira without asking. If the issue can't move there, the answer says where it can.",
      input: MoveSchema,
      async asks(input) {
        const move = MoveSchema.safeParse(input);
        if (!move.success) return { refused: inputRefused(move.error).text };
        const { key, status } = move.data;
        const request = await context.request();
        if (request === null) return { refused: notConnected.text };
        const where = await jira.transitions(request, key);
        if (!where.ok) return { refused: problemText(where.problem, key) };
        const to = transitionTo(where.transitions, status);
        if (to === undefined) return { refused: cannotMove(key, status, where.status, where.transitions) };
        return changeAsk({ kind: 'jira', key, change: { action: 'transition', from: where.status, to: to.to } });
      },
      async run(input) {
        const move = MoveSchema.safeParse(input);
        if (!move.success) return inputRefused(move.error);
        const request = await context.request();
        if (request === null) return notConnected;
        const { key, status } = move.data;
        // Read again: the issue may have moved since you were asked.
        const where = await jira.transitions(request, key);
        if (!where.ok) return failed(problemText(where.problem, key));
        const to = transitionTo(where.transitions, status);
        if (to === undefined) return failed(cannotMove(key, status, where.status, where.transitions));
        const answer = await jira.transition(request, key, to.id);
        if (answer.ok) await context.did({ action: 'moved', key, to: to.to });
        return changed(answer, key, `Moved ${key} to ${to.to}.`);
      },
    },
    {
      name: 'assign_jira_issue',
      description:
        'Assigns a Jira issue to the user (`me`), or to nobody (`nobody`). The user is asked first, unless they let you change Jira without asking.',
      input: AssignSchema,
      async asks(input) {
        const assign = AssignSchema.safeParse(input);
        if (!assign.success) return { refused: inputRefused(assign.error).text };
        const { key, to } = assign.data;
        return changeAsk({ kind: 'jira', key, change: { action: 'assign', to } });
      },
      async run(input) {
        const assign = AssignSchema.safeParse(input);
        if (!assign.success) return inputRefused(assign.error);
        const request = await context.request();
        if (request === null) return notConnected;
        const { key, to } = assign.data;
        let accountId: string | null = null;
        if (to === 'me') {
          const me = await jira.account(request);
          if (!me.ok) return failed(problemText(me.problem, key));
          accountId = me.accountId;
        }
        const answer = await jira.assign(request, key, accountId);
        if (answer.ok) await context.did({ action: 'assigned', key, to });
        return changed(answer, key, to === 'me' ? `Assigned ${key} to the user.` : `Unassigned ${key}.`);
      },
    },
  ];
}
