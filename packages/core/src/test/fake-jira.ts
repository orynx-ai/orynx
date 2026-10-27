import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

/** A site, email and token Jira Cloud accepts in these tests. */
export const jiraSite = 'your-team.atlassian.net';
export const jiraEmail = 'dev@example.com';
export const goodToken = 'fake-good-token';
/** What `Authorization: Basic …` carries for the good email and token; it must never be logged either. */
export const goodBasicValue = Buffer.from(`${jiraEmail}:${goodToken}`).toString('base64');

export const myselfUrl = (site: string = jiraSite) => `https://${site}/rest/api/3/myself`;
export const projectSearchUrl = (site: string = jiraSite) => `https://${site}/rest/api/3/project/search`;
export const issueSearchUrl = (site: string = jiraSite) => `https://${site}/rest/api/3/search/jql`;
export const prioritySearchUrl = (site: string = jiraSite) => `https://${site}/rest/api/3/priority/search`;
export const fieldListUrl = (site: string = jiraSite) => `https://${site}/rest/api/3/field`;
export const boardConfigurationUrl = (boardId: number, site: string = jiraSite) =>
  `https://${site}/rest/agile/1.0/board/${String(boardId)}/configuration`;

/** The account /myself answers with for the good credentials. */
export const issueUrl = (key: string, site: string = jiraSite) => `https://${site}/rest/api/3/issue/${key}`;
export const boardSearchUrl = (site: string = jiraSite) => `https://${site}/rest/agile/1.0/board`;
export const boardSprintsUrl = (boardId: number, site: string = jiraSite) =>
  `https://${site}/rest/agile/1.0/board/${String(boardId)}/sprint`;
export const sprintUrl = (sprintId: number, site: string = jiraSite) =>
  `https://${site}/rest/agile/1.0/sprint/${String(sprintId)}`;

export const myAccountId = '5b10ac8d82e05b22cc7d4ef5';

/** The sprint field's id on these tests' site. A site names the field as it likes; its type is fixed. */
export const sprintFieldId = 'customfield_10020';
const sprintFieldType = 'com.pyxis.greenhopper.jira:gh-sprint';

export interface FakeSprint {
  id: number;
  name?: string;
  state?: 'active' | 'future' | 'closed';
  /** Null for a sprint Jira gives no board. */
  boardId?: number | null;
  /** As Jira writes it; null for a sprint with no end date. */
  endDate?: string | null;
}

/** A sprint as an issue's sprint field holds it. */
export function jiraSprint(sprint: FakeSprint) {
  return {
    id: sprint.id,
    name: sprint.name ?? `Sprint ${String(sprint.id)}`,
    state: sprint.state ?? 'active',
    ...(sprint.boardId === null ? {} : { boardId: sprint.boardId ?? 7 }),
    goal: '',
    startDate: '2026-10-10T09:00:00.000Z',
    ...(sprint.endDate === null ? {} : { endDate: sprint.endDate ?? '2026-10-24T17:00:00.000Z' }),
  };
}

export const statusListUrl = (site: string = jiraSite) => `https://${site}/rest/api/3/status`;

/** The statuses of the design's board, with their categories. */
export const designStatuses = [
  { id: '10000', name: 'To Do', category: 'new' },
  { id: '3', name: 'In Progress', category: 'indeterminate' },
  { id: '10001', name: 'In Review', category: 'indeterminate' },
  { id: '10002', name: 'Done', category: 'done' },
] as const;

/** Jira's list of statuses with their categories, for the good credentials. */
export function acceptingStatusList(
  statuses: readonly { id: string; name: string; category: string }[] = designStatuses,
  { site = jiraSite }: { site?: string } = {},
) {
  return http.get(statusListUrl(site), ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    return HttpResponse.json(
      statuses.map((status) => ({
        id: status.id,
        name: status.name,
        self: `https://${site}/rest/api/3/status/${status.id}`,
        statusCategory: { id: 2, key: status.category, colorName: 'blue-gray', name: status.name },
      })),
    );
  });
}

/** The columns of the design's board, with the status ids a fresh Jira Software project gives them. */
export const designBoardColumns = [
  { name: 'To Do', statusIds: ['10000'] },
  { name: 'In Progress', statusIds: ['3'] },
  { name: 'In Review', statusIds: ['10001'] },
  { name: 'Done', statusIds: ['10002'] },
] as const;

/** Jira's default priorities, highest first, as a fresh Jira Cloud site lists them. */
export const defaultPriorities = [
  { id: '1', name: 'Highest' },
  { id: '2', name: 'High' },
  { id: '3', name: 'Medium' },
  { id: '4', name: 'Low' },
  { id: '5', name: 'Lowest' },
] as const;

export interface FakeIssue {
  key: string;
  summary?: string;
  status?: string;
  /** Jira's status category key: `new` (To Do), `indeterminate` (In Progress) or `done`. */
  category?: 'new' | 'indeterminate' | 'done' | 'undefined';
  type?: string;
  /** A priority id from {@link defaultPriorities}, or null for none. */
  priority?: string | null;
  duedate?: string | null;
  created?: string;
  /** As Jira writes it, with a `+0000` offset; left out when Jira doesn't say. */
  statuscategorychangedate?: string;
  /** The issue's sprints, in the sprint field; left out when the site has no sprint field. */
  sprints?: readonly FakeSprint[];
  /** The status's id; by default the one {@link designBoardColumns} gives the category. */
  statusId?: string;
  /** Who it's assigned to; you, by default. Null for nobody. */
  assignee?: { accountId: string; displayName: string } | null;
}

const statusIdOf = { new: '10000', indeterminate: '3', done: '10002', undefined: '1' } as const;

/** One issue as `search/jql` returns it, with every field the inbox asks for. */
export function jiraIssue(issue: FakeIssue) {
  const priority = issue.priority === undefined ? '3' : issue.priority;
  return {
    id: String(10_000 + issue.key.length),
    key: issue.key,
    fields: {
      summary: issue.summary ?? `Summary of ${issue.key}`,
      status: {
        id: issue.statusId ?? statusIdOf[issue.category ?? 'indeterminate'],
        name: issue.status ?? 'In Progress',
        statusCategory: { id: 4, key: issue.category ?? 'indeterminate', name: 'In Progress' },
      },
      issuetype: { id: '10001', name: issue.type ?? 'Task' },
      priority:
        priority === null ? null : { id: priority, name: defaultPriorities.find((p) => p.id === priority)?.name },
      duedate: issue.duedate ?? null,
      assignee: issue.assignee === undefined ? { accountId: myAccountId, displayName: 'Dev Example' } : issue.assignee,
      created: issue.created ?? '2026-10-01T09:00:00.000+0000',
      ...(issue.statuscategorychangedate === undefined
        ? {}
        : { statuscategorychangedate: issue.statuscategorychangedate }),
      ...(issue.sprints === undefined ? {} : { [sprintFieldId]: issue.sprints.map(jiraSprint) }),
    },
  };
}

/**
 * Jira's enhanced search (`POST /rest/api/3/search/jql`) for the good credentials, answering with `issues`, paged as
 * Jira pages: `maxResults` at a time, `nextPageToken` carries on, and `isLast` says when it's done.
 */
export function acceptingIssueSearch(issues: readonly FakeIssue[], { site = jiraSite }: { site?: string } = {}) {
  return http.post(issueSearchUrl(site), async ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    const body = (await request.clone().json()) as { maxResults?: number; nextPageToken?: string };
    const startAt = Number(body.nextPageToken ?? 0);
    const page = issues.slice(startAt, startAt + (body.maxResults ?? 50));
    const next = startAt + page.length;
    return HttpResponse.json({
      issues: page.map(jiraIssue),
      isLast: next >= issues.length,
      ...(next >= issues.length ? {} : { nextPageToken: String(next) }),
    });
  });
}

/** Jira's priority list, highest first, for the good credentials. */
export function acceptingPrioritySearch(
  priorities: readonly { id: string; name: string }[] = defaultPriorities,
  { site = jiraSite }: { site?: string } = {},
) {
  return http.get(prioritySearchUrl(site), ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    return HttpResponse.json({
      startAt: 0,
      maxResults: 50,
      total: priorities.length,
      isLast: true,
      values: priorities,
    });
  });
}

/**
 * Jira's field list for the good credentials: a few system and custom fields, and the sprint field under
 * `sprintFieldName`. `sprintFieldName: null` is a site without Jira Software, which has no sprint field.
 */
export function acceptingFieldList({
  site = jiraSite,
  sprintFieldName = 'Sprint',
}: { site?: string; sprintFieldName?: string | null } = {}) {
  return http.get(fieldListUrl(site), ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    return HttpResponse.json([
      { id: 'summary', key: 'summary', name: 'Summary', custom: false, schema: { type: 'string', system: 'summary' } },
      {
        id: 'customfield_10014',
        key: 'customfield_10014',
        name: 'Epic Link',
        custom: true,
        schema: { type: 'any', custom: 'com.pyxis.greenhopper.jira:gh-epic-link', customId: 10_014 },
      },
      ...(sprintFieldName === null
        ? []
        : [
            {
              id: sprintFieldId,
              key: sprintFieldId,
              name: sprintFieldName,
              custom: true,
              schema: { type: 'array', items: 'json', custom: sprintFieldType, customId: 10_020 },
            },
          ]),
    ]);
  });
}

/**
 * Jira's enhanced search for your issues in open sprints, for the good credentials. Any other search falls
 * through to the next handler.
 */
export function acceptingMySprintSearch(issues: readonly FakeIssue[], { site = jiraSite }: { site?: string } = {}) {
  return http.post(issueSearchUrl(site), async ({ request }) => {
    const body = (await request.clone().json()) as { jql?: string };
    if (body.jql?.includes('sprint in openSprints()') !== true) return undefined;
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    return HttpResponse.json({ issues: issues.map(jiraIssue), isLast: true });
  });
}

/**
 * Jira's enhanced search for the issues in one sprint, for the good credentials, paged the way search/jql
 * pages: `nextPageToken` carries on, and `isLast` says when it's done. Jira may send fewer than asked for:
 * `pageCap` is the most it sends in one page. Any other search falls through to the next handler.
 */
export function acceptingSprintIssueSearch(
  sprintId: number,
  issues: readonly FakeIssue[],
  { site = jiraSite, pageCap = 100 }: { site?: string; pageCap?: number } = {},
) {
  return http.post(issueSearchUrl(site), async ({ request }) => {
    const body = (await request.clone().json()) as { jql?: string; maxResults?: number; nextPageToken?: string };
    if (body.jql?.startsWith(`sprint = ${String(sprintId)} `) !== true) return undefined;
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    // Your own issues only, as `assignee = currentUser()` asks; an issue is yours unless it says otherwise.
    const asked = body.jql.includes('assignee = currentUser()')
      ? issues.filter((issue) => issue.assignee === undefined || issue.assignee?.accountId === myAccountId)
      : issues;
    const startAt = Number(body.nextPageToken ?? 0);
    const page = asked.slice(startAt, startAt + Math.min(body.maxResults ?? 50, pageCap));
    const next = startAt + page.length;
    return HttpResponse.json({
      issues: page.map(jiraIssue),
      isLast: next >= asked.length,
      ...(next >= asked.length ? {} : { nextPageToken: String(next) }),
    });
  });
}

/** A board's configuration as the agile API answers it, with its columns in order. */
export function acceptingBoardConfiguration(
  boardId: number,
  columns: readonly { name: string; statusIds: readonly string[] }[] = designBoardColumns,
  { site = jiraSite }: { site?: string } = {},
) {
  return http.get(boardConfigurationUrl(boardId, site), ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    return HttpResponse.json({
      id: boardId,
      name: 'PROJ board',
      type: 'scrum',
      self: `https://${site}/rest/agile/1.0/board/${String(boardId)}/configuration`,
      location: { type: 'project', key: 'PROJ', id: '10000' },
      filter: { id: '10001', self: `https://${site}/rest/api/2/filter/10001` },
      columnConfig: {
        columns: columns.map((column) => ({
          name: column.name,
          statuses: column.statusIds.map((id) => ({ id, self: `https://${site}/rest/api/2/status/${id}` })),
        })),
        constraintType: 'issueCount',
      },
      ranking: { rankCustomFieldId: 10_019 },
    });
  });
}

const refused = () =>
  HttpResponse.json(
    { errorMessages: ['Client must be authenticated to access this resource.'] },
    { status: 401, headers: { 'X-Seraph-LoginReason': 'AUTHENTICATED_FAILED' } },
  );

/** One issue as `GET /rest/api/3/issue/{key}` answers it, with a description in Atlassian's document format. */
/** An issue linked to another, as Jira nests it under `issuelinks` (spec 015). */
interface FakeLinkedIssue {
  key: string;
  summary: string;
  status: string | null;
}

export interface FakeIssueDetail {
  key: string;
  summary?: string;
  type?: string;
  /** The description as Jira stores it; null for none. */
  description?: unknown;
  /** Oldest first, as Jira gives them (spec 015); `author: null` is a comment by someone Jira no longer names. */
  comments?: readonly { author: string | null; created: string; body: unknown }[];
  /** The link's type names it from each side; one of `outwardIssue` or `inwardIssue` is the other ticket. */
  links?: readonly {
    type: { inward: string; outward: string };
    outwardIssue?: FakeLinkedIssue;
    inwardIssue?: FakeLinkedIssue;
  }[];
  /** What the ticket dialog shows besides (spec 022); each left out is missing from Jira's answer. */
  status?: { name: string; category: 'new' | 'indeterminate' | 'done' };
  priority?: string;
  assignee?: string;
  reporter?: string;
  /** A calendar day, as Jira gives a due date. */
  dueDate?: string;
  labels?: readonly string[];
  /** Jira's own times, such as `2026-10-01T09:00:00.000+0100`. */
  created?: string;
  updated?: string;
}

function linkedIssue(issue: FakeLinkedIssue | undefined) {
  if (issue === undefined) return undefined;
  return {
    id: '10500',
    key: issue.key,
    fields: { summary: issue.summary, status: issue.status === null ? undefined : { name: issue.status } },
  };
}

/** A description of two paragraphs and a list, as Jira's editor saves it. */
export const designDescription = {
  type: 'doc',
  version: 1,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Content managers need to archive many items at once.' }],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Checkbox on each row' }] }],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Partial failures show which items failed' }] },
          ],
        },
      ],
    },
  ],
};

/** Jira's single issue for the good credentials; any other key is 404, as Jira answers a key it hides. */
export function acceptingIssue(
  issues: FakeIssueDetail | readonly FakeIssueDetail[],
  { site = jiraSite }: { site?: string } = {},
) {
  const known: readonly FakeIssueDetail[] = 'key' in issues ? [issues] : issues;
  return http.get(`https://${site}/rest/api/3/issue/:key`, ({ request, params }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    const issue = known.find((candidate) => candidate.key === params['key']);
    if (issue === undefined) {
      return HttpResponse.json(
        { errorMessages: ['Issue does not exist or you do not have permission to see it.'] },
        { status: 404 },
      );
    }
    return HttpResponse.json({
      id: '10423',
      key: issue.key,
      fields: {
        summary: issue.summary ?? `Summary of ${issue.key}`,
        issuetype: { id: '10001', name: issue.type ?? 'Story' },
        description: issue.description === undefined ? designDescription : issue.description,
        comment: {
          startAt: 0,
          maxResults: 5000,
          total: issue.comments?.length ?? 0,
          comments: (issue.comments ?? []).map((comment, n) => ({
            id: String(20000 + n),
            author: comment.author === null ? undefined : { displayName: comment.author },
            created: comment.created,
            body: comment.body,
          })),
        },
        issuelinks: (issue.links ?? []).map((link, n) => ({
          id: String(30000 + n),
          type: { id: '10000', name: 'Link', ...link.type },
          outwardIssue: linkedIssue(link.outwardIssue),
          inwardIssue: linkedIssue(link.inwardIssue),
        })),
        status:
          issue.status === undefined
            ? undefined
            : { id: '3', name: issue.status.name, statusCategory: { id: 4, key: issue.status.category } },
        priority: issue.priority === undefined ? undefined : { id: '2', name: issue.priority },
        assignee: issue.assignee === undefined ? null : { accountId: 'fake-account', displayName: issue.assignee },
        reporter: issue.reporter === undefined ? null : { accountId: 'fake-reporter', displayName: issue.reporter },
        duedate: issue.dueDate ?? null,
        labels: issue.labels ?? [],
        created: issue.created,
        updated: issue.updated,
      },
    });
  });
}

/** A sprint as the Agile API's board and sprint reads give it: its board is `originBoardId` there. */
export function agileSprint(sprint: FakeSprint & { startDate?: string | null }) {
  const { boardId, ...rest } = jiraSprint(sprint);
  return {
    ...rest,
    ...(sprint.startDate === null ? { startDate: undefined } : { startDate: sprint.startDate ?? rest.startDate }),
    ...(boardId === undefined ? {} : { originBoardId: boardId }),
    self: `https://${jiraSite}/rest/agile/1.0/sprint/${String(sprint.id)}`,
  };
}

/**
 * The Agile API for a project's Scrum boards and their open sprints (spec 020), for the good credentials:
 * `boards` maps each project key to its boards, each with its sprints. Asked for active and future sprints,
 * it leaves out the closed ones, as Jira does.
 */
export function acceptingProjectSprints(
  boards: Readonly<
    Record<string, readonly { id: number; sprints: readonly (FakeSprint & { startDate?: string | null })[] }[]>
  >,
  { site = jiraSite }: { site?: string } = {},
) {
  const all = Object.values(boards).flat();
  return [
    http.get(boardSearchUrl(site), ({ request }) => {
      if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
      const params = new URL(request.url).searchParams;
      const project = params.get('projectKeyOrId') ?? '';
      const values = (boards[project] ?? []).map((board) => ({
        id: board.id,
        name: `${project} board`,
        type: 'scrum',
      }));
      return HttpResponse.json({ maxResults: 50, startAt: 0, isLast: true, values });
    }),
    ...all.map((board) =>
      http.get(boardSprintsUrl(board.id, site), ({ request }) => {
        if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
        const states = (new URL(request.url).searchParams.get('state') ?? '').split(',');
        const values = board.sprints
          .map((sprint) => agileSprint({ boardId: board.id, ...sprint }))
          .filter((sprint) => states.includes(sprint.state));
        return HttpResponse.json({ maxResults: 50, startAt: 0, isLast: true, values });
      }),
    ),
    ...all.flatMap((board) =>
      board.sprints.map((sprint) =>
        http.get(sprintUrl(sprint.id, site), ({ request }) => {
          if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
          return HttpResponse.json(agileSprint({ boardId: board.id, ...sprint }));
        }),
      ),
    ),
  ];
}

/** Jira's /myself as Atlassian answers it: the user for good credentials, 401 otherwise. */
export function acceptingMyself(site: string = jiraSite) {
  return http.get(myselfUrl(site), ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    return HttpResponse.json({ accountId: myAccountId, displayName: 'Dev Example', active: true });
  });
}

/**
 * Jira's paged project search as Atlassian answers it, for the good credentials: `startAt` and
 * `maxResults` pick the page, and `isLast` says whether more follow. Jira may send fewer than asked for:
 * `pageCap` is the most it sends in one page.
 */
export function acceptingProjectSearch(
  projects: readonly { key: string; name: string }[],
  { site = jiraSite, pageCap = 100 }: { site?: string; pageCap?: number } = {},
) {
  return http.get(projectSearchUrl(site), ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    const params = new URL(request.url).searchParams;
    const startAt = Number(params.get('startAt') ?? 0);
    const maxResults = Math.min(Number(params.get('maxResults') ?? 50), pageCap);
    const values = projects.slice(startAt, startAt + maxResults);
    return HttpResponse.json({
      startAt,
      maxResults,
      total: projects.length,
      isLast: startAt + values.length >= projects.length,
      values: values.map((project, index) => ({ id: String(10_000 + startAt + index), ...project })),
    });
  });
}

/**
 * MSW standing in for Jira Cloud, an outside service, for the test file that calls this. It answers
 * /myself on the test site and fails any other request, so no test can reach the real internet.
 */
export function useFakeJira() {
  const server = setupServer(acceptingMyself());
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
    // A listener a failed test left behind must not count another test's requests.
    server.events.removeAllListeners();
  });
  afterAll(() => {
    server.close();
  });
  return server;
}

/** A change a session made in Jira (spec 044), as the fake Jira kept it. */
export interface FakeJiraWrite {
  method: string;
  key: string;
  path: 'comment' | 'transitions' | 'assignee';
  body: unknown;
}

/** The fake issue's workflow from To Do (spec 044): Start leads to In Progress, Review to In Review. */
export const fakeTransitions = [
  { id: '21', name: 'Start', to: { id: '3', name: 'In Progress' } },
  { id: '31', name: 'Review', to: { id: '10003', name: 'In Review' } },
] as const;

/**
 * Jira's writes a session makes (spec 044), for the good credentials: a comment, an issue's status and transitions
 * (`?expand=transitions`; any other read of an issue goes on to the next handler), a transition, and the assignee.
 * Each write lands in `writes`. A key not in `keys` is 404, as Jira answers a key it hides.
 */
export function acceptingJiraChanges(
  writes: FakeJiraWrite[],
  { keys = ['MAG-12'], site = jiraSite }: { keys?: readonly string[]; site?: string } = {},
) {
  const answer = async (
    request: Request,
    key: string,
    write: Omit<FakeJiraWrite, 'body' | 'key'> | null,
    ok: () => Response,
  ) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    if (!keys.includes(key)) {
      return HttpResponse.json(
        { errorMessages: ['Issue does not exist or you do not have permission to see it.'] },
        { status: 404 },
      );
    }
    if (write !== null) writes.push({ ...write, key, body: await request.json() });
    return ok();
  };
  const issue = (path: string) => `https://${site}/rest/api/3/issue/:key${path}`;
  return [
    http.get(issue(''), ({ request, params }) => {
      if (new URL(request.url).searchParams.get('expand') !== 'transitions') return undefined;
      return answer(request, String(params['key']), null, () =>
        HttpResponse.json({
          key: params['key'],
          fields: { status: { id: '10000', name: 'To Do', statusCategory: { key: 'new' } } },
          transitions: fakeTransitions,
        }),
      );
    }),
    http.post(issue('/comment'), ({ request, params }) =>
      answer(request, String(params['key']), { method: 'POST', path: 'comment' }, () =>
        HttpResponse.json({ id: '10100' }, { status: 201 }),
      ),
    ),
    http.post(issue('/transitions'), ({ request, params }) =>
      answer(
        request,
        String(params['key']),
        { method: 'POST', path: 'transitions' },
        () => new HttpResponse(null, { status: 204 }),
      ),
    ),
    http.put(issue('/assignee'), ({ request, params }) =>
      answer(
        request,
        String(params['key']),
        { method: 'PUT', path: 'assignee' },
        () => new HttpResponse(null, { status: 204 }),
      ),
    ),
  ];
}
