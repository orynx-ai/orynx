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
}

/** One issue as `search/jql` returns it, with every field the inbox asks for. */
export function jiraIssue(issue: FakeIssue) {
  const priority = issue.priority === undefined ? '3' : issue.priority;
  return {
    id: String(10_000 + issue.key.length),
    key: issue.key,
    fields: {
      summary: issue.summary ?? `Summary of ${issue.key}`,
      status: {
        name: issue.status ?? 'In Progress',
        statusCategory: { id: 4, key: issue.category ?? 'indeterminate', name: 'In Progress' },
      },
      issuetype: { id: '10001', name: issue.type ?? 'Task' },
      priority:
        priority === null ? null : { id: priority, name: defaultPriorities.find((p) => p.id === priority)?.name },
      duedate: issue.duedate ?? null,
      created: issue.created ?? '2026-10-01T09:00:00.000+0000',
      ...(issue.statuscategorychangedate === undefined
        ? {}
        : { statuscategorychangedate: issue.statuscategorychangedate }),
    },
  };
}

/** Jira's enhanced search (`POST /rest/api/3/search/jql`) for the good credentials, answering with `issues`. */
export function acceptingIssueSearch(issues: readonly FakeIssue[], { site = jiraSite }: { site?: string } = {}) {
  return http.post(issueSearchUrl(site), ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    return HttpResponse.json({ issues: issues.map(jiraIssue), isLast: true });
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

const refused = () =>
  HttpResponse.json(
    { errorMessages: ['Client must be authenticated to access this resource.'] },
    { status: 401, headers: { 'X-Seraph-LoginReason': 'AUTHENTICATED_FAILED' } },
  );

/** Jira's /myself as Atlassian answers it: the user for good credentials, 401 otherwise. */
export function acceptingMyself(site: string = jiraSite) {
  return http.get(myselfUrl(site), ({ request }) => {
    if (request.headers.get('authorization') !== `Basic ${goodBasicValue}`) return refused();
    return HttpResponse.json({ accountId: '5b10ac8d82e05b22cc7d4ef5', displayName: 'Dev Example', active: true });
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
  });
  afterAll(() => {
    server.close();
  });
  return server;
}
