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

/** A sprint as an issue's sprint field holds it, with only what Tickets uses (spec 008). */
export type JiraSprintRef = z.infer<typeof SprintRefSchema>;

/**
 * Who the credentials belong to, and each of their issues in an open sprint with that issue's sprints
 * (active, future and closed ones alike: the sprint field keeps them all).
 */
export type JiraMySprints =
  | { ok: true; accountId: string; issues: { key: string; sprints: JiraSprintRef[] }[] }
  | { ok: false; problem: JiraProblem };

/** One issue in a sprint as Jira sends it, with only the fields a card shows (spec 008). */
export type JiraSprintIssue = z.infer<typeof SprintIssueSchema>;

/**
 * A sprint's issues in rank order, at most 300, whether Jira had more, and the site's priority ids highest
 * first (read only when an issue has a priority, for its bars).
 */
export type JiraSprintIssues =
  | { ok: true; issues: JiraSprintIssue[]; truncated: boolean; priorityOrder: string[] }
  | { ok: false; problem: JiraProblem };

/** Each status's category key (`new`, `indeterminate`, `done`), by status id. */
export type JiraStatusCategories =
  { ok: true; categories: ReadonlyMap<string, string> } | { ok: false; problem: JiraProblem };

/** A board's columns, left to right, each with its statuses by id. */
export interface JiraBoardColumn {
  name: string;
  statusIds: string[];
}

/** Null columns: the board is gone, or hidden from these credentials. */
export type JiraBoardColumns = { ok: true; columns: JiraBoardColumn[] | null } | { ok: false; problem: JiraProblem };

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
  /**
   * Who these credentials belong to (`/myself`), and their issues in open sprints with each one's sprints
   * (spec 008, Q1), at most 100. The sprint field is found by its type in `/rest/api/3/field`, never by its
   * name; a site without one (no Jira Software) has no sprints, so no issues are asked for.
   */
  mySprints(request: JiraCheckRequest): Promise<JiraMySprints>;
  /** A board's columns in order (`/rest/agile/1.0/board/{id}/configuration`), for In review (spec 008, Q2). */
  boardColumns(request: JiraCheckRequest, boardId: number): Promise<JiraBoardColumns>;
  /**
   * Every issue in the sprint in rank order (`sprint = <id> ORDER BY Rank ASC` through `search/jql`'s
   * `nextPageToken`), 100 a page, at most 300, and the priority order for the bars. When the sprint holds
   * more, your own issues past the first 300 follow them (at most 300 more). Never a description or a comment.
   */
  sprintIssues(request: JiraCheckRequest, sprintId: number): Promise<JiraSprintIssues>;
  /**
   * Every status's category, by id (`GET /rest/api/3/status`, which any user may read). A board's columns
   * name their statuses by id only, so this says which column is the first in progress (spec 008, Q2).
   */
  statusCategories(request: JiraCheckRequest): Promise<JiraStatusCategories>;
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

const SprintRefSchema = z.object({
  id: z.int().positive(),
  name: z.string().min(1),
  state: z.string(),
  boardId: z
    .int()
    .positive()
    .nullish()
    .transform((boardId) => boardId ?? null),
  endDate: z
    .string()
    .nullish()
    .transform((endDate) => endDate ?? null),
});

const FieldListSchema = z.array(
  z.object({ id: z.string(), schema: z.object({ custom: z.string() }).partial().nullish() }),
);

/** The sprint field's type; its name and id differ from site to site. */
const sprintFieldType = 'com.pyxis.greenhopper.jira:gh-sprint';

const MySprintIssueSchema = z.object({ key: z.string(), fields: z.record(z.string(), z.unknown()) });

const BoardConfigurationSchema = z.object({
  columnConfig: z.object({
    columns: z.array(z.object({ name: z.string(), statuses: z.array(z.object({ id: z.string() })) })),
  }),
});

// Each status is checked on its own, so one odd status is left out instead of failing the list.
const StatusListSchema = z.array(z.unknown());
const StatusSchema = z.object({ id: z.string(), statusCategory: z.object({ key: z.string() }) });

const SprintIssueSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string().nullish(),
    status: z.object({ id: z.string(), name: z.string(), statusCategory: z.object({ key: z.string() }) }),
    issuetype: z.object({ name: z.string() }).nullish(),
    priority: z.object({ id: z.string(), name: z.string() }).nullish(),
    duedate: z.string().nullish(),
    assignee: z.object({ accountId: z.string(), displayName: z.string().nullish() }).nullish(),
  }),
});

// Each issue is checked on its own, so one odd issue is left out instead of failing the whole read.
const IssueSearchSchema = z.object({ issues: z.array(z.unknown()) });
const IssuePageSchema = z.object({
  issues: z.array(z.unknown()),
  nextPageToken: z.string().nullish(),
  isLast: z.boolean().optional(),
});
const PrioritySearchSchema = z.object({ values: z.array(z.object({ id: z.string() })) });

/**
 * Statuses are matched by category, never by name (integration-adapter skill). Oldest first, so the 100
 * kept are the ones that have waited longest, as Home sorts them.
 */
const assignedJql = 'assignee = currentUser() AND statusCategory != Done ORDER BY created ASC';
const assignedFields = ['summary', 'status', 'issuetype', 'priority', 'duedate', 'created', 'statuscategorychangedate'];
const mostAssigned = 100;

const mySprintsJql = 'assignee = currentUser() AND sprint in openSprints()';
const mostMySprintIssues = 100;

const sprintFields = ['summary', 'status', 'issuetype', 'priority', 'duedate', 'assignee'];
const sprintIssuesPerPage = 100;
const mostSprintIssues = 300;

const projectsPerPage = 100;
const mostProjects = 1000;

// Codes such as "ENOTFOUND" or "UNABLE_TO_GET_ISSUER_CERT_LOCALLY". Anything else is dropped.
const errorCode = /^[A-Z][A-Z0-9_]{0,63}$/;

export function createJiraClient({ timeoutMs = 10_000, fetch }: JiraClientOptions = {}): JiraClient {
  /** Runs `work` with a client for these credentials; any failure comes back as a problem, never the error. */
  async function withJira<T>(
    { site, email, apiToken }: JiraCheckRequest,
    work: (client: JiraCore.Client, sdk: typeof JiraCore) => Promise<T>,
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
      return { ok: true, value: await work(client, sdk) };
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
        const page = await client.sendRequest({
          url: '/rest/api/3/search/jql',
          method: 'POST',
          body: { jql: assignedJql, fields: assignedFields, maxResults: mostAssigned },
          schema: IssueSearchSchema,
          signal,
        });
        const issues = page.issues.flatMap((found) => {
          const issue = AssignedIssueSchema.safeParse(found);
          return issue.success ? [issue.data] : [];
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

    async mySprints(request) {
      const answer = await withJira(request, async (client) => {
        // The three requests share one wait, like the project list.
        const signal = AbortSignal.timeout(timeoutMs);
        const me = await client.sendRequest({ url: '/rest/api/3/myself', method: 'GET', schema: MyselfSchema, signal });
        const fields = await client.sendRequest({
          url: '/rest/api/3/field',
          method: 'GET',
          schema: FieldListSchema,
          signal,
        });
        const sprintField = fields.find((field) => field.schema?.custom === sprintFieldType)?.id;
        if (sprintField === undefined) return { accountId: me.accountId, issues: [] };
        const page = await client.sendRequest({
          url: '/rest/api/3/search/jql',
          method: 'POST',
          body: { jql: mySprintsJql, fields: [sprintField], maxResults: mostMySprintIssues },
          schema: IssueSearchSchema,
          signal,
        });
        const issues = page.issues.flatMap((found) => {
          const issue = MySprintIssueSchema.safeParse(found);
          if (!issue.success) return [];
          const held = issue.data.fields[sprintField];
          if (held !== null && held !== undefined && !Array.isArray(held)) return [];
          const sprints = (held ?? []).flatMap((sprint: unknown) => {
            const parsed = SprintRefSchema.safeParse(sprint);
            return parsed.success ? [parsed.data] : [];
          });
          return [{ key: issue.data.key, sprints }];
        });
        return { accountId: me.accountId, issues };
      });
      return answer.ok ? { ok: true, ...answer.value } : answer;
    },

    async boardColumns(request, boardId) {
      const answer = await withJira(request, async (client, sdk) => {
        try {
          const board = await client.sendRequest({
            url: `/rest/agile/1.0/board/${String(boardId)}/configuration`,
            method: 'GET',
            schema: BoardConfigurationSchema,
            signal: AbortSignal.timeout(timeoutMs),
          });
          return board.columnConfig.columns.map((column) => ({
            name: column.name,
            statusIds: column.statuses.map((status) => status.id),
          }));
        } catch (error) {
          // A board that's gone or hidden from you is an answer: the sprint shows without In review (AC-5).
          if (sdk.isNotFoundError(error) || sdk.isForbiddenError(error)) return null;
          throw error;
        }
      });
      return answer.ok ? { ok: true, columns: answer.value } : answer;
    },

    async sprintIssues(request, sprintId) {
      const answer = await withJira(request, async (client) => {
        // Every page and the priority list share one wait, like the project list.
        const signal = AbortSignal.timeout(timeoutMs);

        /** Up to 300 issues for `jql` in rank order, following `nextPageToken`, and whether Jira had more. */
        async function pages(jql: string): Promise<{ issues: JiraSprintIssue[]; more: boolean }> {
          const found: unknown[] = [];
          let nextPageToken: string | undefined;
          let more = true;
          while (more && found.length < mostSprintIssues) {
            const page = await client.sendRequest({
              url: '/rest/api/3/search/jql',
              method: 'POST',
              body: {
                jql,
                fields: sprintFields,
                maxResults: Math.min(sprintIssuesPerPage, mostSprintIssues - found.length),
                ...(nextPageToken === undefined ? {} : { nextPageToken }),
              },
              schema: IssuePageSchema,
              signal,
            });
            found.push(...page.issues);
            nextPageToken = page.nextPageToken ?? undefined;
            // Jira may send fewer than asked for: only isLast, or no token to go on with, ends the read.
            more = page.isLast === false && nextPageToken !== undefined && page.issues.length > 0;
          }
          const issues = found.slice(0, mostSprintIssues).flatMap((issue) => {
            const parsed = SprintIssueSchema.safeParse(issue);
            return parsed.success ? [parsed.data] : [];
          });
          return { issues, more: more || found.length > mostSprintIssues };
        }

        const sprint = `sprint = ${String(sprintId)}`;
        const first = await pages(`${sprint} ORDER BY Rank ASC`);
        let issues = first.issues;
        if (first.more) {
          // A sprint cut short may leave out your own issues, and Assigned to me is on by default. Any issue
          // the first 300 left out ranks after all of them, so yours follow them in their own rank order.
          const kept = new Set(issues.map((issue) => issue.key));
          const mine = await pages(`${sprint} AND assignee = currentUser() ORDER BY Rank ASC`);
          issues = [...issues, ...mine.issues.filter((issue) => !kept.has(issue.key))];
        }
        const truncated = first.more;
        if (!issues.some((issue) => issue.fields.priority)) return { issues, truncated, priorityOrder: [] };
        const priorities = await client.sendRequest({
          url: '/rest/api/3/priority/search',
          method: 'GET',
          searchParams: { maxResults: 50 },
          schema: PrioritySearchSchema,
          signal,
        });
        return { issues, truncated, priorityOrder: priorities.values.map((priority) => priority.id) };
      });
      return answer.ok ? { ok: true, ...answer.value } : answer;
    },

    async statusCategories(request) {
      const answer = await withJira(request, (client) =>
        client.sendRequest({
          url: '/rest/api/3/status',
          method: 'GET',
          schema: StatusListSchema,
          signal: AbortSignal.timeout(timeoutMs),
        }),
      );
      if (!answer.ok) return answer;
      const categories = new Map<string, string>();
      for (const found of answer.value) {
        const status = StatusSchema.safeParse(found);
        if (status.success) categories.set(status.data.id, status.data.statusCategory.key);
      }
      return { ok: true, categories };
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
