import type * as JiraCore from 'jira.js/core';
import { z } from 'zod';
import { JiraProjectKeySchema, type JiraProject } from '@devhub/contracts';
import { adfToMarkdown } from './adf-markdown.ts';

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

/** One issue as a session's brief needs it (spec 011): its description is Markdown, or null when it has none. */
export interface JiraIssueDetail {
  key: string;
  summary: string;
  type: string | null;
  description: string | null;
}

export type JiraIssue = { ok: true; issue: JiraIssueDetail } | { ok: false; problem: JiraProblem };

/**
 * One issue as the composer's brief needs it (spec 015, Q3): 011's fields, the last 20 comments oldest first
 * as Markdown, and each linked issue named by the link's own words from this issue's side.
 */
export interface JiraIssueContext extends JiraIssueDetail {
  comments: { author: string; created: string; body: string }[];
  links: { relation: string; key: string; summary: string; status: string | null }[];
  /**
   * What the ticket dialog shows besides (spec 022, Q8): the status's own name and Jira's category for it (`new`,
   * `indeterminate`, `done`), the priority's and people's names, the due day, labels, and Jira's own times.
   */
  status: { name: string; category: string } | null;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  dueDate: string | null;
  labels: string[];
  created: string | null;
  updated: string | null;
}

export type JiraIssueContextAnswer = { ok: true; issue: JiraIssueContext } | { ok: false; problem: JiraProblem };

/**
 * One issue a session's search found (spec 044): what a list of issues shows, by name, never a description, a
 * comment or anything about a person but their display name.
 */
export interface JiraFoundIssue {
  key: string;
  summary: string;
  type: string | null;
  status: string | null;
  /** Jira's category for the status: `new`, `indeterminate` or `done`. */
  category: string | null;
  priority: string | null;
  assignee: string | null;
  dueDate: string | null;
  updated: string | null;
}

/**
 * What a search found, and whether Jira found more; or why it couldn't: a problem, or, for a query Jira refused, Jira's
 * own words about it (spec 044, Q6).
 */
export type JiraSearch =
  | { ok: true; issues: JiraFoundIssue[]; more: boolean }
  | { ok: false; problem: JiraProblem }
  | { ok: false; refused: string };

/** Who the credentials belong to, for "Assigned to you" on a sprint Tickets reads by its id (spec 020). */
export type JiraAccount = { ok: true; accountId: string } | { ok: false; problem: JiraProblem };

/** A sprint as the Agile API's board and sprint reads give it, with only what Tickets uses (spec 020). */
export type JiraBoardSprint = z.infer<typeof BoardSprintSchema>;

/** A project's active then future sprints, each once (spec 020, AC-26). */
export type JiraProjectSprints = { ok: true; sprints: JiraBoardSprint[] } | { ok: false; problem: JiraProblem };

/** One sprint by its id; null when it's gone or hidden from these credentials. */
export type JiraSprint = { ok: true; sprint: JiraBoardSprint | null } | { ok: false; problem: JiraProblem };

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
   * The issues in no sprint that aren't Done (spec 020, AC-39), read as `sprintIssues` reads a sprint: the
   * project's (its backlog), or with no project, the ones assigned to these credentials.
   */
  issuesWithoutSprint(request: JiraCheckRequest, projectKey: string | null): Promise<JiraSprintIssues>;
  /**
   * Every status's category, by id (`GET /rest/api/3/status`, which any user may read). A board's columns
   * name their statuses by id only, so this says which column is the first in progress (spec 008, Q2).
   */
  statusCategories(request: JiraCheckRequest): Promise<JiraStatusCategories>;
  /**
   * One issue's summary, type and description (`GET /rest/api/3/issue/{key}`), for a session's brief
   * (spec 011). The only read that asks for a description; it's never cached or logged.
   */
  issue(request: JiraCheckRequest, key: string): Promise<JiraIssue>;
  /**
   * One issue for the composer's brief (`GET /rest/api/3/issue/{key}`, spec 015): what `issue()` reads, plus its
   * comments and linked issues. Never cached or logged.
   */
  issueContext(request: JiraCheckRequest, key: string): Promise<JiraIssueContextAnswer>;
  /** Who these credentials belong to (`GET /rest/api/3/myself`), for a sprint Tickets reads by its id (spec 020). */
  account(request: JiraCheckRequest): Promise<JiraAccount>;
  /**
   * Any JQL Claude sends from a session (spec 044), as it is: its first `limit` issues (`POST /rest/api/3/search/jql`)
   * and whether Jira found more. A query Jira refuses (400) comes back with Jira's own words, at most 500 characters.
   * shortcut: one page only, at most 100; Claude narrows the query rather than paging. Page on if that falls short.
   */
  search(request: JiraCheckRequest, jql: string, limit: number): Promise<JiraSearch>;
  /**
   * A project's active sprints, then its future ones (spec 020, AC-26): its Scrum boards
   * (`/rest/agile/1.0/board?projectKeyOrId=`, at most 10), then each board's open sprints
   * (`/rest/agile/1.0/board/{id}/sprint?state=active,future`, at most 50 each). A sprint on two boards shows
   * once; a board that's gone or hidden is skipped. Active ones end soonest first, future ones start soonest.
   */
  projectSprints(request: JiraCheckRequest, projectKey: string): Promise<JiraProjectSprints>;
  /** One sprint (`/rest/agile/1.0/sprint/{id}`), for the sprint Tickets holds (spec 020). */
  sprint(request: JiraCheckRequest, sprintId: number): Promise<JiraSprint>;
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

const nullableText = z
  .string()
  .nullish()
  .transform((text) => text ?? null);

const BoardSprintSchema = z.object({
  id: z.int().positive(),
  name: z.string().min(1),
  state: z.enum(['active', 'future', 'closed']),
  boardId: z
    .int()
    .positive()
    .nullish()
    .transform((boardId) => boardId ?? null),
  startDate: nullableText,
  endDate: nullableText,
});

/** The Agile API names a sprint's board `originBoardId`; the sprint field names it `boardId`. */
function boardSprint(found: unknown): JiraBoardSprint | null {
  if (typeof found !== 'object' || found === null) return null;
  const { originBoardId, ...rest } = found as Record<string, unknown>;
  const parsed = BoardSprintSchema.safeParse({ boardId: originBoardId, ...rest });
  return parsed.success ? parsed.data : null;
}

const BoardPageSchema = z.object({ values: z.array(z.object({ id: z.int().positive() })) });
const SprintPageSchema = z.object({ values: z.array(z.unknown()) });
const mostBoards = 10;
const mostSprintsPerBoard = 50;

/** When two sprints tie, one with no date comes last. */
function timeOf(date: string | null): number {
  const at = date === null ? Number.NaN : Date.parse(date);
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
}

/** Active sprints ending soonest, then future ones starting soonest, then by id. */
function inSprintOrder(a: JiraBoardSprint, b: JiraBoardSprint): number {
  if (a.state !== b.state) return a.state === 'active' ? -1 : b.state === 'active' ? 1 : 0;
  const when = a.state === 'active' ? timeOf(a.endDate) - timeOf(b.endDate) : timeOf(a.startDate) - timeOf(b.startDate);
  return when || a.id - b.id;
}

const IssueDetailSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string().nullish(),
    issuetype: z.object({ name: z.string() }).nullish(),
    // Atlassian's document format; adf-markdown.ts reads it without trusting its shape.
    description: z.unknown(),
  }),
});
const issueFields = ['summary', 'issuetype', 'description'];

// The composer's brief also reads comments and links (spec 015); each one is checked on its own, so an odd one
// is left out rather than failing the ticket.
const named = z
  .object({ displayName: z.string().min(1) })
  .nullish()
  .catch(null);
const IssueContextSchema = IssueDetailSchema.extend({
  fields: IssueDetailSchema.shape.fields.extend({
    comment: z.object({ comments: z.array(z.unknown()) }).nullish(),
    issuelinks: z.array(z.unknown()).nullish(),
    // The ticket dialog's fields (spec 022); an odd one reads as missing rather than failing the ticket.
    status: z
      .object({ name: z.string().min(1), statusCategory: z.object({ key: z.string() }) })
      .nullish()
      .catch(null),
    priority: z
      .object({ name: z.string().min(1) })
      .nullish()
      .catch(null),
    assignee: named,
    reporter: named,
    duedate: z.iso.date().nullish().catch(null),
    labels: z.array(z.string().min(1)).nullish().catch(null),
    created: z.string().nullish().catch(null),
    updated: z.string().nullish().catch(null),
  }),
});
const issueContextFields = [
  ...issueFields,
  'comment',
  'issuelinks',
  'status',
  'priority',
  'assignee',
  'reporter',
  'duedate',
  'labels',
  'created',
  'updated',
];
const CommentSchema = z.object({
  author: z.object({ displayName: z.string() }).nullish(),
  created: z.string(),
  body: z.unknown(),
});
const LinkedIssueSchema = z.object({
  key: z.string(),
  fields: z.object({ summary: z.string().nullish(), status: z.object({ name: z.string() }).nullish() }).nullish(),
});
const IssueLinkSchema = z.object({
  type: z.object({ inward: z.string(), outward: z.string() }),
  inwardIssue: LinkedIssueSchema.nullish(),
  outwardIssue: LinkedIssueSchema.nullish(),
});
/** The brief takes at most this many of a ticket's comments, the newest (Q3). */
const mostComments = 20;

function issueComments(found: readonly unknown[]): JiraIssueContext['comments'] {
  return found.slice(-mostComments).flatMap((item) => {
    const comment = CommentSchema.safeParse(item);
    if (!comment.success) return [];
    const body = adfToMarkdown(comment.data.body);
    if (body === null || body.trim() === '') return [];
    return [{ author: comment.data.author?.displayName ?? 'Someone', created: comment.data.created, body }];
  });
}

function issueLinks(found: readonly unknown[]): JiraIssueContext['links'] {
  return found.flatMap((item) => {
    const link = IssueLinkSchema.safeParse(item);
    if (!link.success) return [];
    const { type, outwardIssue, inwardIssue } = link.data;
    const other = outwardIssue ?? inwardIssue;
    if (other === null || other === undefined) return [];
    return [
      {
        relation: outwardIssue ? type.outward : type.inward,
        key: other.key,
        summary: other.fields?.summary ?? '',
        status: other.fields?.status?.name ?? null,
      },
    ];
  });
}

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

// Active sprints only: an issue sits in one open sprint at a time, so this leaves out the future ones,
// which would otherwise use up the 100 issues read.
const mySprintsJql = 'assignee = currentUser() AND sprint in openSprints() AND sprint not in futureSprints()';
const mostMySprintIssues = 100;

const sprintFields = ['summary', 'status', 'issuetype', 'priority', 'duedate', 'assignee'];
const foundFields = ['summary', 'issuetype', 'status', 'priority', 'assignee', 'duedate', 'updated'];

const FoundIssueSchema = z.object({
  key: z.string().min(1),
  fields: z.object({
    summary: z.string().nullish(),
    issuetype: z.object({ name: z.string() }).nullish(),
    status: z.object({ name: z.string(), statusCategory: z.object({ key: z.string() }) }).nullish(),
    priority: z.object({ name: z.string().nullish() }).nullish(),
    assignee: z.object({ displayName: z.string().nullish() }).nullish(),
    duedate: z.string().nullish(),
    updated: z.string().nullish(),
  }),
});

const FoundPageSchema = z.object({ issues: z.array(z.unknown()), isLast: z.boolean().nullish() });

/** Jira's error answer: its messages, and its words for each field. */
const JiraErrorBodySchema = z.object({
  errorMessages: z.array(z.string()).nullish(),
  errors: z.record(z.string(), z.string()).nullish(),
});

/** Jira's own words for what it refused, at most 500 characters (spec 044, Q6); never the request that carried it. */
function jiraReason(body: unknown): string {
  const parsed = JiraErrorBodySchema.safeParse(body);
  const words = parsed.success
    ? [...(parsed.data.errorMessages ?? []), ...Object.values(parsed.data.errors ?? {})]
    : [];
  const reason = words.join(' ').trim();
  return (reason === '' ? 'Jira refused it without saying why.' : reason).slice(0, 500);
}
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

  /**
   * Every issue `filter` finds, in rank order (`<filter> ORDER BY Rank ASC` through `search/jql`'s
   * `nextPageToken`), 100 a page, at most 300, and the priority order for the bars. When it finds more, your
   * own issues past the first 300 follow them (at most 300 more). Never a description or a comment.
   */
  async function rankedIssues(request: JiraCheckRequest, filter: string): Promise<JiraSprintIssues> {
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

      const first = await pages(`${filter} ORDER BY Rank ASC`);
      let issues = first.issues;
      if (first.more) {
        // A list cut short may leave out your own issues, and Assignee: Me is on by default. Any issue the
        // first 300 left out ranks after all of them, so yours follow them in their own rank order.
        const kept = new Set(issues.map((issue) => issue.key));
        const mine = await pages(`${filter} AND assignee = currentUser() ORDER BY Rank ASC`);
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
        // Side by side, so a slow Jira costs one wait, not two.
        const [me, fields] = await Promise.all([
          client.sendRequest({ url: '/rest/api/3/myself', method: 'GET', schema: MyselfSchema, signal }),
          client.sendRequest({ url: '/rest/api/3/field', method: 'GET', schema: FieldListSchema, signal }),
        ]);
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
      return rankedIssues(request, `sprint = ${String(sprintId)}`);
    },

    async issuesWithoutSprint(request, projectKey) {
      // A key the contract checked: project letters only. Quoted, so a key that is a JQL word (IS, ORDER) still reads.
      const whose = projectKey === null ? 'assignee = currentUser()' : `project = "${projectKey}"`;
      return rankedIssues(request, `${whose} AND sprint is EMPTY AND statusCategory != Done`);
    },

    async issue(request, key) {
      const answer = await withJira(request, (client) =>
        client.sendRequest({
          url: `/rest/api/3/issue/${encodeURIComponent(key)}`,
          method: 'GET',
          searchParams: { fields: issueFields.join(',') },
          schema: IssueDetailSchema,
          signal: AbortSignal.timeout(timeoutMs),
        }),
      );
      if (!answer.ok) return answer;
      const { fields } = answer.value;
      return {
        ok: true,
        issue: {
          key: answer.value.key,
          summary: fields.summary ?? '',
          type: fields.issuetype?.name ?? null,
          description: adfToMarkdown(fields.description),
        },
      };
    },

    async issueContext(request, key) {
      const answer = await withJira(request, (client) =>
        client.sendRequest({
          url: `/rest/api/3/issue/${encodeURIComponent(key)}`,
          method: 'GET',
          searchParams: { fields: issueContextFields.join(',') },
          schema: IssueContextSchema,
          signal: AbortSignal.timeout(timeoutMs),
        }),
      );
      if (!answer.ok) return answer;
      const { fields } = answer.value;
      return {
        ok: true,
        issue: {
          key: answer.value.key,
          summary: fields.summary ?? '',
          type: fields.issuetype?.name ?? null,
          description: adfToMarkdown(fields.description),
          comments: issueComments(fields.comment?.comments ?? []),
          links: issueLinks(fields.issuelinks ?? []),
          status:
            fields.status == null ? null : { name: fields.status.name, category: fields.status.statusCategory.key },
          priority: fields.priority?.name ?? null,
          assignee: fields.assignee?.displayName ?? null,
          reporter: fields.reporter?.displayName ?? null,
          dueDate: fields.duedate ?? null,
          labels: fields.labels ?? [],
          created: fields.created ?? null,
          updated: fields.updated ?? null,
        },
      };
    },

    async search(request, jql, limit) {
      const answer = await withJira(request, async (client, sdk) => {
        try {
          const page = await client.sendRequest({
            url: '/rest/api/3/search/jql',
            method: 'POST',
            body: { jql, fields: foundFields, maxResults: limit },
            schema: FoundPageSchema,
            signal: AbortSignal.timeout(timeoutMs),
          });
          const issues = page.issues.flatMap((found): JiraFoundIssue[] => {
            const issue = FoundIssueSchema.safeParse(found);
            if (!issue.success) return [];
            const { fields } = issue.data;
            return [
              {
                key: issue.data.key,
                summary: fields.summary ?? '',
                type: fields.issuetype?.name ?? null,
                status: fields.status?.name ?? null,
                category: fields.status?.statusCategory.key ?? null,
                priority: fields.priority?.name ?? null,
                assignee: fields.assignee?.displayName ?? null,
                dueDate: fields.duedate ?? null,
                updated: fields.updated ?? null,
              },
            ];
          });
          return { issues, more: page.isLast === false };
        } catch (error) {
          // Jira read the query and refused it: its words let Claude fix it.
          if (sdk.isApiError(error) && error.status === 400) return { refused: jiraReason(error.body) };
          throw error;
        }
      });
      if (!answer.ok) return answer;
      return 'refused' in answer.value ? { ok: false, refused: answer.value.refused } : { ok: true, ...answer.value };
    },

    async account(request) {
      const answer = await withJira(request, (client) =>
        client.sendRequest({
          url: '/rest/api/3/myself',
          method: 'GET',
          schema: MyselfSchema,
          signal: AbortSignal.timeout(timeoutMs),
        }),
      );
      return answer.ok ? { ok: true, accountId: answer.value.accountId } : answer;
    },

    async projectSprints(request, projectKey) {
      const answer = await withJira(request, async (client, sdk) => {
        // The boards and their sprints share one wait, like the project list.
        const signal = AbortSignal.timeout(timeoutMs);
        const boards = await client.sendRequest({
          url: '/rest/agile/1.0/board',
          method: 'GET',
          searchParams: { projectKeyOrId: projectKey, type: 'scrum', maxResults: mostBoards },
          schema: BoardPageSchema,
          signal,
        });
        // Side by side, so ten boards cost one wait, not ten.
        const pages = await Promise.all(
          boards.values.slice(0, mostBoards).map(async (board) => {
            try {
              const page = await client.sendRequest({
                url: `/rest/agile/1.0/board/${String(board.id)}/sprint`,
                method: 'GET',
                searchParams: { state: 'active,future', maxResults: mostSprintsPerBoard },
                schema: SprintPageSchema,
                signal,
              });
              return page.values;
            } catch (error) {
              // A board that's gone or hidden from you, or that keeps no sprints, is skipped.
              if (sdk.isNotFoundError(error) || sdk.isForbiddenError(error)) return [];
              if (sdk.isApiError(error) && error.status === 400) return [];
              throw error;
            }
          }),
        );
        const sprints = new Map<number, JiraBoardSprint>();
        for (const found of pages.flat()) {
          const sprint = boardSprint(found);
          if (sprint !== null && sprint.state !== 'closed' && !sprints.has(sprint.id)) sprints.set(sprint.id, sprint);
        }
        return [...sprints.values()].sort(inSprintOrder);
      });
      return answer.ok ? { ok: true, sprints: answer.value } : answer;
    },

    async sprint(request, sprintId) {
      const answer = await withJira(request, async (client, sdk) => {
        try {
          const found = await client.sendRequest({
            url: `/rest/agile/1.0/sprint/${String(sprintId)}`,
            method: 'GET',
            schema: z.unknown(),
            signal: AbortSignal.timeout(timeoutMs),
          });
          return boardSprint(found);
        } catch (error) {
          // A sprint that's gone or hidden from you is an answer: Tickets says it has no sprint.
          if (sdk.isNotFoundError(error) || sdk.isForbiddenError(error)) return null;
          throw error;
        }
      });
      return answer.ok ? { ok: true, sprint: answer.value } : answer;
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
