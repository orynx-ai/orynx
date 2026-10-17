import type * as JiraCore from 'jira.js/core';
import { z } from 'zod';
import { JiraProjectKeySchema, type JiraProject } from '@devhub/contracts';

/**
 * The only file in DevHub that talks to Jira (integration-adapter skill). The token goes into the
 * Authorization header and nowhere else: a failure comes back as a {@link JiraProblem}, never as the
 * library's error, so nothing that held the request can travel on into a log or a response.
 */

/** What to check. `site` is a bare host that the contract has already limited to atlassian.net. */
export interface JiraCheckRequest {
  site: string;
  email: string;
  apiToken: string;
}

export type JiraProblem =
  /** Jira refused the email and token. */
  | { kind: 'rejected' }
  /** The credentials may be right, but Jira wants a sign-in on the web first (a CAPTCHA). */
  | { kind: 'sign_in_needed' }
  /** Nothing at that address answers the way Jira does. */
  | { kind: 'not_found' }
  /** The request never got an answer. `code` is safe to log, such as ENOTFOUND or a certificate error. */
  | { kind: 'unreachable'; code: string | undefined }
  | { kind: 'timeout' }
  /** Jira answered with an error that says nothing about the credentials. */
  | { kind: 'jira_error'; status: number };

export type JiraCheck = { ok: true } | { ok: false; problem: JiraProblem };

export type JiraProjects = { ok: true; projects: JiraProject[] } | { ok: false; problem: JiraProblem };

/** One assigned issue as Jira sends it, with only the fields the inbox asks for (spec 007). */
export type JiraAssignedIssue = z.infer<typeof AssignedIssueSchema>;

/**
 * Your unfinished issues, and the site's priority ids highest first. The order is read only when an issue
 * is a bug, because only a bug's priority matters to the inbox; otherwise it's empty.
 */
export type JiraAssigned =
  { ok: true; issues: JiraAssignedIssue[]; priorityOrder: string[] } | { ok: false; problem: JiraProblem };

export interface JiraClient {
  readonly timeoutMs: number;
  /** Asks Jira who these credentials belong to (`GET /rest/api/3/myself`). */
  check(request: JiraCheckRequest): Promise<JiraCheck>;
  /**
   * The projects these credentials can see, by key (`GET /rest/api/3/project/search`, 100 a page, at
   * most 1000). The whole list shares one timeout, so the answer always comes before the page's own
   * 20-second wait gives up (spec 005).
   */
  projects(request: JiraCheckRequest): Promise<JiraProjects>;
  /**
   * The issues assigned to these credentials whose status category isn't Done, at most 100
   * (`POST /rest/api/3/search/jql`), and the priority order for bugs. Never a description or a comment.
   */
  assigned(request: JiraCheckRequest): Promise<JiraAssigned>;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface JiraClientOptions {
  /** How long to wait for Jira; 10 seconds by default (spec 003). */
  timeoutMs?: number;
  /** The network. Only a test that needs a failure MSW can't make passes one. */
  fetch?: FetchLike;
}

const MyselfSchema = z.object({ accountId: z.string().min(1) });

const ProjectPageSchema = z.object({
  values: z.array(z.object({ key: z.string(), name: z.string() })),
  isLast: z.boolean().optional(),
});

const AssignedIssueSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string().nullish(),
    status: z.object({ name: z.string(), statusCategory: z.object({ key: z.string() }) }),
    issuetype: z.object({ name: z.string() }).nullish(),
    priority: z.object({ id: z.string() }).nullish(),
    duedate: z.string().nullish(),
    created: z.string(),
    statuscategorychangedate: z.string().nullish(),
  }),
});

const IssueSearchSchema = z.object({ issues: z.array(AssignedIssueSchema) });
const PrioritySearchSchema = z.object({ values: z.array(z.object({ id: z.string() })) });

/** Statuses are matched by category, never by name (integration-adapter skill). */
const assignedJql = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC';
const assignedFields = ['summary', 'status', 'issuetype', 'priority', 'duedate', 'created', 'statuscategorychangedate'];
const mostAssigned = 100;

const projectsPerPage = 100;
const mostProjects = 1000;

// Codes such as "ENOTFOUND" or "UNABLE_TO_GET_ISSUER_CERT_LOCALLY". Anything else is dropped.
const errorCode = /^[A-Z][A-Z0-9_]{0,63}$/;

export function createJiraClient({ timeoutMs = 10_000, fetch }: JiraClientOptions = {}): JiraClient {
  /** Runs `work` with a client for these credentials; any failure comes back as a problem, never the error. */
  async function withJira<T>(
    { site, email, apiToken }: JiraCheckRequest,
    work: (client: JiraCore.Client) => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; problem: JiraProblem }> {
    // Loaded on the first call, so starting DevHub never pays for it.
    const sdk = await import('jira.js/core');
    try {
      const client = sdk.createClient({
        host: `https://${site}`,
        auth: { type: 'basic', email, apiToken },
        // A page that isn't Jira's answer is an error, and the library writes nothing to the terminal.
        onSchemaMismatch: 'throw',
        ...(fetch ? { fetch } : {}),
      });
      return { ok: true, value: await work(client) };
    } catch (error) {
      return { ok: false, problem: problemOf(sdk, error) };
    }
  }

  return {
    timeoutMs,

    async check(request) {
      const answer = await withJira(request, (client) =>
        client.sendRequest({
          url: '/rest/api/3/myself',
          method: 'GET',
          schema: MyselfSchema,
          signal: AbortSignal.timeout(timeoutMs),
        }),
      );
      return answer.ok ? { ok: true } : answer;
    },

    async projects(request) {
      const answer = await withJira(request, async (client) => {
        const signal = AbortSignal.timeout(timeoutMs);
        const projects: JiraProject[] = [];
        // Jira may send fewer than asked for, so each page starts where the last one ended.
        for (let startAt = 0; startAt < mostProjects;) {
          const page = await client.sendRequest({
            url: '/rest/api/3/project/search',
            method: 'GET',
            searchParams: { startAt, maxResults: projectsPerPage, orderBy: 'key' },
            schema: ProjectPageSchema,
            signal,
          });
          // A key DevHub couldn't save in Settings is left out rather than failing the whole list.
          projects.push(...page.values.filter((project) => JiraProjectKeySchema.safeParse(project.key).success));
          if (page.isLast !== false || page.values.length === 0) break;
          startAt += page.values.length;
        }
        return projects.slice(0, mostProjects);
      });
      return answer.ok ? { ok: true, projects: answer.value } : answer;
    },

    async assigned(request) {
      const answer = await withJira(request, async (client) => {
        // Both requests share one wait, like the project list.
        const signal = AbortSignal.timeout(timeoutMs);
        const { issues } = await client.sendRequest({
          url: '/rest/api/3/search/jql',
          method: 'POST',
          body: { jql: assignedJql, fields: assignedFields, maxResults: mostAssigned },
          schema: IssueSearchSchema,
          signal,
        });
        const anyBug = issues.some((issue) => issue.fields.issuetype?.name.toLowerCase() === 'bug');
        if (!anyBug) return { issues, priorityOrder: [] };
        const priorities = await client.sendRequest({
          url: '/rest/api/3/priority/search',
          method: 'GET',
          searchParams: { maxResults: 50 },
          schema: PrioritySearchSchema,
          signal,
        });
        return { issues, priorityOrder: priorities.values.map((priority) => priority.id) };
      });
      return answer.ok ? { ok: true, ...answer.value } : answer;
    },
  };
}

function problemOf(sdk: typeof JiraCore, error: unknown): JiraProblem {
  if (error instanceof Error && error.name === 'TimeoutError') return { kind: 'timeout' };
  // jira.js reads X-Seraph-LoginReason: a refusal can arrive as 401, as 200 (answered anonymously),
  // or as 403 when Jira wants the CAPTCHA answered on the web.
  if (sdk.isAuthError(error)) return error.status === 403 ? { kind: 'sign_in_needed' } : { kind: 'rejected' };
  if (sdk.isNotFoundError(error) || sdk.isSchemaMismatchError(error)) return { kind: 'not_found' };
  if (sdk.isApiError(error)) return { kind: 'jira_error', status: error.status };
  const code = sdk.isNetworkError(error) ? error.code : undefined;
  return { kind: 'unreachable', code: code !== undefined && errorCode.test(code) ? code : undefined };
}
