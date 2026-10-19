import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  acceptingBoardConfiguration,
  acceptingProjectSprints,
  boardSearchUrl,
  boardSprintsUrl,
  sprintUrl,
  acceptingFieldList,
  acceptingIssueSearch,
  acceptingMySprintSearch,
  acceptingPrioritySearch,
  acceptingProjectSearch,
  acceptingSprintIssueSearch,
  acceptingStatusList,
  boardConfigurationUrl,
  designBoardColumns,
  fieldListUrl,
  goodBasicValue,
  acceptingIssue,
  issueUrl,
  issueSearchUrl,
  goodToken,
  jiraEmail,
  jiraIssue,
  jiraSite,
  myAccountId,
  myselfUrl,
  prioritySearchUrl,
  projectSearchUrl,
  sprintFieldId,
  statusListUrl,
  useFakeJira,
} from '../../test/fake-jira.ts';
import { createJiraClient, type JiraCheck } from './client.ts';

const jira = useFakeJira();
const client = createJiraClient({ timeoutMs: 200 });
const credentials = { site: jiraSite, email: jiraEmail, apiToken: goodToken };

function answerMyself(response: () => Response | Promise<Response>) {
  jira.use(http.get(myselfUrl(), response));
}

/** No outcome may carry the token, or the Basic value built from it (AC-15). */
function expectNoSecret(check: JiraCheck) {
  const text = JSON.stringify(check);
  expect(text).not.toContain(goodToken);
  expect(text).not.toContain(goodBasicValue);
}

describe('Jira client', () => {
  it('AC-3: Jira accepts the email and token with Basic auth on https', async () => {
    const seen: Request[] = [];
    jira.events.on('request:start', ({ request }) => {
      seen.push(request.clone());
    });

    expect(await client.check(credentials)).toEqual({ ok: true });
    expect(seen.map((request) => request.url)).toEqual([myselfUrl()]);
    expect(seen[0]?.headers.get('authorization')).toBe(`Basic ${goodBasicValue}`);
    jira.events.removeAllListeners();
  });

  it('AC-4: Jira refuses a wrong token with 401', async () => {
    const check = await client.check({ ...credentials, apiToken: 'fake-wrong-token' });
    expect(check).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expectNoSecret(check);
  });

  it('AC-4: Jira answers as an anonymous user, which still means the token was refused', async () => {
    answerMyself(() => HttpResponse.json({}, { headers: { 'X-Seraph-LoginReason': 'AUTHENTICATED_FAILED' } }));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'rejected' } });
  });

  it('AC-6: Jira wants a sign-in on the web first', async () => {
    answerMyself(() =>
      HttpResponse.json(
        {},
        {
          status: 403,
          headers: {
            'X-Seraph-LoginReason': 'AUTHENTICATION_DENIED',
            'X-Authentication-Denied-Reason': 'CAPTCHA_CHALLENGE; login-url=https://your-team.atlassian.net/login.jsp',
          },
        },
      ),
    );
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'sign_in_needed' } });
  });

  it('AC-5: there is no Jira at that address (404)', async () => {
    answerMyself(() => HttpResponse.text('Not found', { status: 404 }));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'not_found' } });
  });

  it('AC-5: the address answers, but not as Jira does', async () => {
    answerMyself(() => HttpResponse.html('<html><body>Site unavailable</body></html>'));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'not_found' } });
  });

  it('AC-5: the address answers JSON that is not a Jira user', async () => {
    answerMyself(() => HttpResponse.json({ hello: 'world' }));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'not_found' } });
  });

  it("AC-5: the site can't be reached", async () => {
    answerMyself(() => HttpResponse.error());
    const check = await client.check(credentials);
    expect(check).toEqual({ ok: false, problem: { kind: 'unreachable', code: undefined } });
    expectNoSecret(check);
  });

  it("AC-5: the site doesn't answer in time", async () => {
    answerMyself(async () => {
      await delay('infinite');
      return HttpResponse.json({});
    });
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });

  it.each([429, 500, 503])('AC-5: Jira answers with an error (%i)', async (status) => {
    answerMyself(() => HttpResponse.json({ errorMessages: ['Busy'] }, { status }));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'jira_error', status } });
  });

  it('AC-5: a 403 without a sign-in challenge is a Jira error, not a refused token', async () => {
    answerMyself(() => HttpResponse.json({}, { status: 403 }));
    expect(await client.check(credentials)).toEqual({ ok: false, problem: { kind: 'jira_error', status: 403 } });
  });

  it.each([
    ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'],
    ['ENOTFOUND', 'ENOTFOUND'],
    ['fake-good-token', undefined],
  ])('AC-5: keeps the network error code %s for the terminal only when it looks like a code', async (code, kept) => {
    // MSW can't fail a request with a code, so this one stands in for fetch, the network itself.
    const failing = createJiraClient({
      fetch: () =>
        Promise.reject(new TypeError('fetch failed', { cause: Object.assign(new Error('connect failed'), { code }) })),
    });
    expect(await failing.check(credentials)).toEqual({ ok: false, problem: { kind: 'unreachable', code: kept } });
  });

  it('waits 10 seconds by default', () => {
    expect(createJiraClient().timeoutMs).toBe(10_000);
  });
});

describe('Jira client: projects', () => {
  const twoHundredAndFive = Array.from({ length: 205 }, (_, index) => ({
    key: `P${String(index).padStart(3, '0')}`,
    name: `Project ${String(index)}`,
  }));

  it('AC-5: reads every page of the projects the token can see, 100 at a time, in key order', async () => {
    jira.use(acceptingProjectSearch(twoHundredAndFive));
    const urls: URL[] = [];
    jira.events.on('request:start', ({ request }) => {
      urls.push(new URL(request.url));
    });

    const answer = await client.projects(credentials);

    expect(answer).toEqual({ ok: true, projects: twoHundredAndFive });
    expect(urls.map((url) => [url.searchParams.get('startAt'), url.searchParams.get('maxResults')])).toEqual([
      ['0', '100'],
      ['100', '100'],
      ['200', '100'],
    ]);
    expect(urls.every((url) => url.searchParams.get('orderBy') === 'key')).toBe(true);
    jira.events.removeAllListeners();
  });

  it('AC-5: moves on by what Jira sent, when Jira sends fewer per page than asked for', async () => {
    jira.use(acceptingProjectSearch(twoHundredAndFive, { pageCap: 50 }));

    expect(await client.projects(credentials)).toEqual({ ok: true, projects: twoHundredAndFive });
  });

  it('stops at 1000 projects', async () => {
    const many = Array.from({ length: 1500 }, (_, index) => ({ key: `K${String(index)}`, name: `K ${String(index)}` }));
    jira.use(acceptingProjectSearch(many));

    const answer = await client.projects(credentials);

    expect(answer.ok && answer.projects.length).toBe(1000);
  });

  it('leaves out a project whose key DevHub could not save', async () => {
    jira.use(
      acceptingProjectSearch([
        { key: 'PROJ', name: 'Intranet' },
        { key: 'old-key', name: 'Legacy' },
      ]),
    );

    expect(await client.projects(credentials)).toEqual({ ok: true, projects: [{ key: 'PROJ', name: 'Intranet' }] });
  });

  it('AC-9: says Jira refused the token, without the token', async () => {
    jira.use(acceptingProjectSearch(twoHundredAndFive));

    const answer = await client.projects({ ...credentials, apiToken: 'fake-wrong-token' });

    expect(answer).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expect(JSON.stringify(answer)).not.toContain('fake-wrong-token');
  });

  it("AC-9: says Jira didn't answer in time", async () => {
    jira.use(
      http.get(projectSearchUrl(), async () => {
        await delay(1000);
        return HttpResponse.json({ values: [], isLast: true });
      }),
    );

    expect(await client.projects(credentials)).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });

  it('AC-9: gives the whole list one wait, so slow pages add up to a timeout the page can still show', async () => {
    // Each page alone is quicker than the 200 ms wait; the two together are not.
    jira.use(
      http.get(projectSearchUrl(), async ({ request }) => {
        await delay(120);
        const startAt = Number(new URL(request.url).searchParams.get('startAt'));
        return HttpResponse.json({ values: [{ key: `P${String(startAt)}`, name: 'Slow' }], isLast: startAt > 0 });
      }),
    );

    expect(await client.projects(credentials)).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });

  it("AC-9: says Jira can't be reached", async () => {
    jira.use(http.get(projectSearchUrl(), () => HttpResponse.error()));

    expect(await client.projects(credentials)).toEqual({
      ok: false,
      problem: { kind: 'unreachable', code: undefined },
    });
  });
});

describe('Jira client: assigned issues (spec 007)', () => {
  it('AC-2: asks for your unfinished issues by status category, with only the fields a row shows', async () => {
    const bodies: unknown[] = [];
    jira.use(acceptingIssueSearch([{ key: 'PROJ-1423', summary: 'Add bulk archive to the content list' }]));
    jira.events.on('request:start', ({ request }) => {
      if (request.url === issueSearchUrl())
        void request
          .clone()
          .json()
          .then((body) => bodies.push(body));
    });

    const answer = await client.assigned(credentials);

    expect(answer).toMatchObject({ ok: true, issues: [{ key: 'PROJ-1423' }], priorityOrder: [] });
    expect(bodies).toEqual([
      {
        jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY created ASC',
        fields: ['summary', 'status', 'issuetype', 'priority', 'duedate', 'created', 'statuscategorychangedate'],
        maxResults: 100,
      },
    ]);
    jira.events.removeAllListeners();
  });

  it('AC-5: reads the site’s priority order only when an issue is a bug', async () => {
    const asked: string[] = [];
    jira.use(acceptingIssueSearch([{ key: 'PROJ-1377', type: 'Bug', priority: '1' }]), acceptingPrioritySearch());
    jira.events.on('request:start', ({ request }) => {
      asked.push(new URL(request.url).pathname);
    });

    const answer = await client.assigned(credentials);

    expect(answer).toMatchObject({ ok: true, priorityOrder: ['1', '2', '3', '4', '5'] });
    expect(asked).toEqual(['/rest/api/3/search/jql', '/rest/api/3/priority/search']);
    jira.events.removeAllListeners();
  });

  it('leaves out an issue it can’t read, and keeps the rest', async () => {
    jira.use(
      http.post(issueSearchUrl(), () =>
        HttpResponse.json({
          issues: [{ key: 'PROJ-1', fields: { summary: 'No status' } }, jiraIssue({ key: 'PROJ-2' })],
        }),
      ),
    );

    const answer = await client.assigned(credentials);

    expect(answer.ok && answer.issues.map((issue) => issue.key)).toEqual(['PROJ-2']);
  });

  it('AC-25: a refused token comes back as a problem, never as the library’s error', async () => {
    jira.use(acceptingIssueSearch([]));

    const answer = await client.assigned({ ...credentials, apiToken: 'fake-wrong-token' });

    expect(answer).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expect(JSON.stringify(answer)).not.toContain('fake-wrong-token');
  });

  it('AC-24: a slow Jira is a timeout', async () => {
    jira.use(
      http.post(issueSearchUrl(), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );

    expect(await client.assigned(credentials)).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });

  it('AC-24: a priority list that fails fails the read, so a bug is never shown as the wrong priority', async () => {
    jira.use(
      acceptingIssueSearch([{ key: 'PROJ-1377', type: 'Bug' }]),
      http.get(prioritySearchUrl(), () => HttpResponse.json({ errorMessages: ['Oops'] }, { status: 500 })),
    );

    expect(await client.assigned(credentials)).toEqual({ ok: false, problem: { kind: 'jira_error', status: 500 } });
  });
});

describe('Jira client: your sprints (spec 008)', () => {
  it('AC-1: asks who you are, finds the sprint field by its type, and reads your issues in open sprints with it', async () => {
    const bodies: unknown[] = [];
    jira.use(
      // A site may name the field as it likes; DevHub finds it by its type.
      acceptingFieldList({ sprintFieldName: 'Sprints (team)' }),
      acceptingMySprintSearch([
        {
          key: 'PROJ-1423',
          sprints: [
            { id: 41, state: 'closed' },
            { id: 42, name: 'Sprint 42', boardId: 7 },
          ],
        },
      ]),
    );
    jira.events.on('request:start', ({ request }) => {
      if (request.url === issueSearchUrl())
        void request
          .clone()
          .json()
          .then((body) => bodies.push(body));
    });

    const answer = await client.mySprints(credentials);

    expect(answer).toEqual({
      ok: true,
      accountId: myAccountId,
      issues: [
        {
          key: 'PROJ-1423',
          sprints: [
            { id: 41, name: 'Sprint 41', state: 'closed', boardId: 7, endDate: '2026-10-24T17:00:00.000Z' },
            { id: 42, name: 'Sprint 42', state: 'active', boardId: 7, endDate: '2026-10-24T17:00:00.000Z' },
          ],
        },
      ],
    });
    expect(bodies).toEqual([
      {
        jql: 'assignee = currentUser() AND sprint in openSprints() AND sprint not in futureSprints()',
        fields: [sprintFieldId],
        maxResults: 100,
      },
    ]);
    jira.events.removeAllListeners();
  });

  it('asks who you are and for the field list side by side, so a slow Jira costs one wait, not two', async () => {
    const started: string[] = [];
    const answer = (url: string) => async () => {
      started.push(url);
      // Neither answers until both have been asked.
      while (started.length < 2) await delay(5);
      return url === myselfUrl()
        ? HttpResponse.json({ accountId: myAccountId, displayName: 'Dev Example', active: true })
        : HttpResponse.json([]);
    };
    jira.use(http.get(myselfUrl(), answer(myselfUrl())), http.get(fieldListUrl(), answer(fieldListUrl())));

    expect(await client.mySprints(credentials)).toEqual({ ok: true, accountId: myAccountId, issues: [] });
    expect([...started].sort()).toEqual([fieldListUrl(), myselfUrl()].sort());
  });

  it('AC-22: a site without Jira Software has no sprint field, so it asks for no issues', async () => {
    const asked: string[] = [];
    jira.use(acceptingFieldList({ sprintFieldName: null }), acceptingMySprintSearch([]));
    jira.events.on('request:start', ({ request }) => {
      asked.push(request.url);
    });

    const answer = await client.mySprints(credentials);

    expect(answer).toEqual({ ok: true, accountId: myAccountId, issues: [] });
    expect(asked).toEqual([myselfUrl(), fieldListUrl()]);
    jira.events.removeAllListeners();
  });

  it('keeps a sprint with no board or end date, and leaves out a sprint or an issue it can’t read', async () => {
    jira.use(
      acceptingFieldList(),
      http.post(issueSearchUrl(), () =>
        HttpResponse.json({
          issues: [
            { key: 'PROJ-1', fields: { [sprintFieldId]: 'not a list' } },
            {
              key: 'PROJ-2',
              fields: { [sprintFieldId]: [{ name: 'No id' }, { id: 42, name: 'Sprint 42', state: 'active' }] },
            },
            { key: 'PROJ-3', fields: { [sprintFieldId]: null } },
          ],
          isLast: true,
        }),
      ),
    );

    const answer = await client.mySprints(credentials);

    expect(answer).toEqual({
      ok: true,
      accountId: myAccountId,
      issues: [
        { key: 'PROJ-2', sprints: [{ id: 42, name: 'Sprint 42', state: 'active', boardId: null, endDate: null }] },
        { key: 'PROJ-3', sprints: [] },
      ],
    });
  });

  it('AC-24: a refused token comes back as a problem, never as the library’s error', async () => {
    jira.use(acceptingFieldList(), acceptingMySprintSearch([]));

    const answer = await client.mySprints({ ...credentials, apiToken: 'fake-wrong-token' });

    expect(answer).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expect(JSON.stringify(answer)).not.toContain('fake-wrong-token');
  });

  it('AC-23: a slow field list is a timeout', async () => {
    jira.use(
      http.get(fieldListUrl(), async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );

    expect(await client.mySprints(credentials)).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });
});

describe('Jira client: board columns (spec 008)', () => {
  it('AC-4: reads a board’s columns in order, each with its status ids', async () => {
    jira.use(
      acceptingBoardConfiguration(7, [
        { name: 'To Do', statusIds: ['10000'] },
        { name: 'In Progress', statusIds: ['3'] },
        { name: 'Code Review', statusIds: ['10001'] },
        { name: 'QA', statusIds: ['10003', '10004'] },
        { name: 'Done', statusIds: ['10002'] },
      ]),
    );

    expect(await client.boardColumns(credentials, 7)).toEqual({
      ok: true,
      columns: [
        { name: 'To Do', statusIds: ['10000'] },
        { name: 'In Progress', statusIds: ['3'] },
        { name: 'Code Review', statusIds: ['10001'] },
        { name: 'QA', statusIds: ['10003', '10004'] },
        { name: 'Done', statusIds: ['10002'] },
      ],
    });
  });

  it.each([
    ['gone', 404],
    ['hidden from you', 403],
  ])('AC-5: a board that’s %s has no columns, rather than a problem', async (_why, status) => {
    jira.use(
      http.get(boardConfigurationUrl(7), () =>
        HttpResponse.json(
          { errorMessages: ['The board does not exist or you do not have permission to see it.'] },
          { status },
        ),
      ),
    );

    expect(await client.boardColumns(credentials, 7)).toEqual({ ok: true, columns: null });
  });

  it('AC-24: a refused token is still a problem', async () => {
    jira.use(acceptingBoardConfiguration(7, designBoardColumns));

    expect(await client.boardColumns({ ...credentials, apiToken: 'fake-wrong-token' }, 7)).toEqual({
      ok: false,
      problem: { kind: 'rejected' },
    });
  });

  it('AC-23: a slow board is a timeout', async () => {
    jira.use(
      http.get(boardConfigurationUrl(7), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );

    expect(await client.boardColumns(credentials, 7)).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });
});

describe('Jira client: the issues in a sprint (spec 008)', () => {
  const someoneElse = { accountId: 'someone-else', displayName: 'Priya Shah' };
  // Someone else's issues, so a sprint cut short has none of yours to add.
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      key: `PROJ-${String(index + 1)}`,
      priority: null,
      assignee: someoneElse,
    }));

  /** The search bodies MSW saw, in order. */
  function searchBodies(): unknown[] {
    const bodies: unknown[] = [];
    jira.events.on('request:start', ({ request }) => {
      if (request.url === issueSearchUrl())
        void request
          .clone()
          .json()
          .then((body) => bodies.push(body));
    });
    return bodies;
  }

  it('AC-1: reads every issue in the sprint in rank order, with only the fields a card shows', async () => {
    jira.use(
      acceptingSprintIssueSearch(42, [
        { key: 'PROJ-1377', summary: 'Search returns archived sites for guest users', type: 'Bug', priority: null },
        { key: 'PROJ-1402', summary: 'Add empty state to saved searches', category: 'new', priority: null },
      ]),
    );
    const bodies = searchBodies();

    const answer = await client.sprintIssues(credentials, 42);

    expect(answer).toMatchObject({
      ok: true,
      truncated: false,
      priorityOrder: [],
      issues: [
        {
          key: 'PROJ-1377',
          fields: {
            summary: 'Search returns archived sites for guest users',
            status: { id: '3', name: 'In Progress', statusCategory: { key: 'indeterminate' } },
            issuetype: { name: 'Bug' },
            assignee: { accountId: myAccountId, displayName: 'Dev Example' },
          },
        },
        { key: 'PROJ-1402', fields: { status: { id: '10000', statusCategory: { key: 'new' } } } },
      ],
    });
    expect(bodies).toEqual([
      {
        jql: 'sprint = 42 ORDER BY Rank ASC',
        fields: ['summary', 'status', 'issuetype', 'priority', 'duedate', 'assignee'],
        maxResults: 100,
      },
    ]);
    jira.events.removeAllListeners();
  });

  it('AC-26: follows nextPageToken 100 at a time and stops at 300, saying more were left', async () => {
    jira.use(acceptingSprintIssueSearch(42, many(340)));
    const bodies = searchBodies();

    const answer = await client.sprintIssues(credentials, 42);

    expect(answer.ok && answer.issues.length).toBe(300);
    expect(answer.ok && answer.issues.at(-1)?.key).toBe('PROJ-300');
    expect(answer).toMatchObject({ ok: true, truncated: true });
    expect(bodies).toMatchObject([
      {},
      { nextPageToken: '100' },
      { nextPageToken: '200' },
      { jql: 'sprint = 42 AND assignee = currentUser() ORDER BY Rank ASC' },
    ]);
    jira.events.removeAllListeners();
  });

  it('AC-1, AC-26: in a sprint cut short, your own issues past the first 300 still come, after them, in rank order', async () => {
    // Yours (no assignee given means you): the 5th, the 310th and the 320th in rank order.
    const sprint = Array.from({ length: 340 }, (_, index) => ({
      key: `PROJ-${String(index + 1)}`,
      priority: null,
      ...([5, 310, 320].includes(index + 1) ? {} : { assignee: someoneElse }),
    }));
    jira.use(acceptingSprintIssueSearch(42, sprint));
    const bodies = searchBodies();

    const answer = await client.sprintIssues(credentials, 42);

    expect(answer.ok && answer.issues.length).toBe(302);
    expect(answer.ok && answer.issues.slice(-3).map((issue) => issue.key)).toEqual([
      'PROJ-300',
      'PROJ-310',
      'PROJ-320',
    ]);
    expect(answer.ok && answer.issues.filter((issue) => issue.key === 'PROJ-5')).toHaveLength(1);
    expect(answer).toMatchObject({ ok: true, truncated: true });
    expect(bodies).toContainEqual(
      expect.objectContaining({ jql: 'sprint = 42 AND assignee = currentUser() ORDER BY Rank ASC' }),
    );
    jira.events.removeAllListeners();
  });

  it('AC-26: a sprint of exactly 300 is whole', async () => {
    jira.use(acceptingSprintIssueSearch(42, many(300)));

    expect(await client.sprintIssues(credentials, 42)).toMatchObject({ ok: true, truncated: false });
  });

  it('moves on by what Jira sent, when Jira sends fewer per page than asked for', async () => {
    jira.use(acceptingSprintIssueSearch(42, many(90), { pageCap: 40 }));

    const answer = await client.sprintIssues(credentials, 42);

    expect(answer.ok && answer.issues.map((issue) => issue.key)).toEqual(many(90).map((issue) => issue.key));
    expect(answer).toMatchObject({ ok: true, truncated: false });
  });

  it('AC-2: reads the site’s priority order when an issue has a priority, for the bars', async () => {
    jira.use(acceptingSprintIssueSearch(42, [{ key: 'PROJ-1423', priority: '2' }]), acceptingPrioritySearch());

    expect(await client.sprintIssues(credentials, 42)).toMatchObject({
      ok: true,
      priorityOrder: ['1', '2', '3', '4', '5'],
      issues: [{ key: 'PROJ-1423', fields: { priority: { id: '2', name: 'High' } } }],
    });
  });

  it('leaves out an issue it can’t read, and keeps the rest', async () => {
    jira.use(
      http.post(issueSearchUrl(), () =>
        HttpResponse.json({
          issues: [{ key: 'PROJ-1', fields: { summary: 'No status' } }, jiraIssue({ key: 'PROJ-2', priority: null })],
          isLast: true,
        }),
      ),
    );

    const answer = await client.sprintIssues(credentials, 42);

    expect(answer.ok && answer.issues.map((issue) => issue.key)).toEqual(['PROJ-2']);
  });

  it('AC-24: a refused token comes back as a problem, never as the library’s error', async () => {
    jira.use(acceptingSprintIssueSearch(42, []));

    const answer = await client.sprintIssues({ ...credentials, apiToken: 'fake-wrong-token' }, 42);

    expect(answer).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expect(JSON.stringify(answer)).not.toContain('fake-wrong-token');
  });

  it('AC-23: the pages share one wait, so a slow later page is a timeout', async () => {
    jira.use(
      http.post(issueSearchUrl(), async ({ request }) => {
        const body = (await request.clone().json()) as { nextPageToken?: string };
        if (body.nextPageToken !== undefined) await delay('infinite');
        return HttpResponse.json({
          issues: [jiraIssue({ key: 'PROJ-1', priority: null })],
          isLast: false,
          nextPageToken: '1',
        });
      }),
    );

    expect(await client.sprintIssues(credentials, 42)).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });
});

describe('Jira client: status categories (spec 008)', () => {
  it('AC-4: reads each status’s category by id, since a board’s columns name statuses by id only', async () => {
    jira.use(acceptingStatusList());

    const answer = await client.statusCategories(credentials);

    expect(answer.ok && [...answer.categories]).toEqual([
      ['10000', 'new'],
      ['3', 'indeterminate'],
      ['10001', 'indeterminate'],
      ['10002', 'done'],
    ]);
  });

  it('leaves out a status it can’t read, and keeps the rest', async () => {
    jira.use(
      http.get(statusListUrl(), () =>
        HttpResponse.json([
          { id: '1', name: 'No category' },
          { id: '3', statusCategory: { key: 'indeterminate' } },
        ]),
      ),
    );

    const answer = await client.statusCategories(credentials);

    expect(answer.ok && [...answer.categories]).toEqual([['3', 'indeterminate']]);
  });

  it('AC-24: a refused token comes back as a problem', async () => {
    jira.use(acceptingStatusList());

    expect(await client.statusCategories({ ...credentials, apiToken: 'fake-wrong-token' })).toEqual({
      ok: false,
      problem: { kind: 'rejected' },
    });
  });
});

describe('Jira client: one issue (spec 011)', () => {
  it('AC-3: reads the summary, the type and the description as Markdown, with only those fields', async () => {
    const seen: Request[] = [];
    jira.events.on('request:start', ({ request }) => {
      seen.push(request.clone());
    });
    jira.use(acceptingIssue({ key: 'PROJ-1423', summary: 'Add bulk archive to the content list' }));

    expect(await client.issue(credentials, 'PROJ-1423')).toEqual({
      ok: true,
      issue: {
        key: 'PROJ-1423',
        summary: 'Add bulk archive to the content list',
        type: 'Story',
        description:
          'Content managers need to archive many items at once.\n\n- Checkbox on each row\n- Partial failures show which items failed',
      },
    });
    const url = new URL(seen[0]?.url ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(issueUrl('PROJ-1423'));
    expect(url.searchParams.get('fields')).toBe('summary,issuetype,description');
    expect(seen[0]?.headers.get('authorization')).toBe(`Basic ${goodBasicValue}`);
  });

  it('AC-3: an issue with no description or type says so', async () => {
    jira.use(
      http.get(issueUrl('PROJ-7'), () =>
        HttpResponse.json({ key: 'PROJ-7', fields: { summary: 'Fix it', issuetype: null, description: null } }),
      ),
    );
    expect(await client.issue(credentials, 'PROJ-7')).toEqual({
      ok: true,
      issue: { key: 'PROJ-7', summary: 'Fix it', type: null, description: null },
    });
  });

  it('AC-13: an issue Jira hides or doesn’t have is a problem', async () => {
    jira.use(acceptingIssue({ key: 'PROJ-1423' }));
    expect(await client.issue(credentials, 'PROJ-9')).toEqual({ ok: false, problem: { kind: 'not_found' } });
  });

  it('AC-13: a refused token comes back as a problem, without the token', async () => {
    jira.use(acceptingIssue({ key: 'PROJ-1423' }));
    const answer = await client.issue({ ...credentials, apiToken: 'fake-wrong-token' }, 'PROJ-1423');
    expect(answer).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expect(JSON.stringify(answer)).not.toContain('fake-wrong-token');
  });

  it('AC-13: a slow Jira is a timeout', async () => {
    jira.use(
      http.get(issueUrl('PROJ-1423'), async () => {
        await delay(1000);
        return HttpResponse.json({});
      }),
    );
    expect(await client.issue(credentials, 'PROJ-1423')).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });
});

describe('Jira client: a ticket for the composer (spec 015)', () => {
  const text = (words: string) => ({
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text: words }] }],
  });

  it('AC-20 (Q3): reads the ticket with its last 20 comments, oldest first, and its linked issues, asking for only those fields', async () => {
    const seen: Request[] = [];
    jira.events.on('request:start', ({ request }) => {
      seen.push(request.clone());
    });
    const comments = Array.from({ length: 25 }, (_, n) => ({
      author: n === 24 ? null : `Person ${String(n)}`,
      created: `2026-10-${String(n + 1).padStart(2, '0')}T09:00:00.000+0100`,
      body: text(`Comment ${String(n)}`),
    }));
    jira.use(
      acceptingIssue({
        key: 'PROJ-1423',
        summary: 'Add bulk archive to the content list',
        comments,
        links: [
          {
            type: { inward: 'is blocked by', outward: 'blocks' },
            outwardIssue: { key: 'PROJ-1400', summary: 'Release 4.2', status: 'In progress' },
          },
          {
            type: { inward: 'is cloned by', outward: 'clones' },
            inwardIssue: { key: 'PROJ-1500', summary: 'Bulk archive on mobile', status: null },
          },
          { type: { inward: 'relates to', outward: 'relates to' } },
        ],
      }),
    );

    const answer = await client.issueContext(credentials, 'PROJ-1423');
    expect(answer).toMatchObject({
      ok: true,
      issue: {
        key: 'PROJ-1423',
        summary: 'Add bulk archive to the content list',
        type: 'Story',
        links: [
          { relation: 'blocks', key: 'PROJ-1400', summary: 'Release 4.2', status: 'In progress' },
          { relation: 'is cloned by', key: 'PROJ-1500', summary: 'Bulk archive on mobile', status: null },
        ],
      },
    });
    const read = answer.ok ? answer.issue.comments : [];
    expect(read).toHaveLength(20);
    expect(read[0]).toEqual({ author: 'Person 5', created: '2026-10-06T09:00:00.000+0100', body: 'Comment 5' });
    expect(read.at(-1)).toEqual({ author: 'Someone', created: '2026-10-25T09:00:00.000+0100', body: 'Comment 24' });
    expect(new URL(seen[0]?.url ?? '').searchParams.get('fields')).toBe(
      'summary,issuetype,description,comment,issuelinks',
    );
  });

  it('AC-20: a ticket with no comments or links has none, and an empty comment is left out', async () => {
    jira.use(
      http.get(issueUrl('PROJ-7'), () =>
        HttpResponse.json({
          key: 'PROJ-7',
          fields: {
            summary: 'Fix it',
            issuetype: null,
            description: null,
            comment: {
              comments: [{ author: { displayName: 'Sam' }, created: '2026-10-01T09:00:00.000Z', body: null }],
            },
          },
        }),
      ),
    );
    expect(await client.issueContext(credentials, 'PROJ-7')).toEqual({
      ok: true,
      issue: { key: 'PROJ-7', summary: 'Fix it', type: null, description: null, comments: [], links: [] },
    });
  });

  it('AC-21: a ticket Jira hides, refused credentials and a slow Jira are problems, without the token', async () => {
    jira.use(acceptingIssue({ key: 'PROJ-1423' }));
    expect(await client.issueContext(credentials, 'PROJ-9999')).toEqual({ ok: false, problem: { kind: 'not_found' } });
    const refused = await client.issueContext({ ...credentials, apiToken: 'fake-wrong-token' }, 'PROJ-1423');
    expect(refused).toEqual({ ok: false, problem: { kind: 'rejected' } });
    expect(JSON.stringify(refused)).not.toContain('fake-wrong-token');
    jira.use(
      http.get(issueUrl('PROJ-1423'), async () => {
        await delay(1000);
        return HttpResponse.json({});
      }),
    );
    expect(await client.issueContext(credentials, 'PROJ-1423')).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });
});

describe('Jira client: a project’s sprints (spec 020)', () => {
  it('AC-26: lists a project’s active sprints ending soonest, then its future ones starting soonest, each once', async () => {
    jira.use(
      ...acceptingProjectSprints({
        WEB: [
          {
            id: 11,
            sprints: [
              { id: 43, name: 'Web 43', state: 'future', startDate: '2026-10-27T09:00:00.000Z', endDate: null },
              { id: 42, name: 'Web 42', state: 'active', endDate: '2026-10-24T17:00:00.000Z' },
              { id: 41, name: 'Web 41', state: 'closed' },
            ],
          },
          {
            id: 12,
            sprints: [
              // On both boards: listed once.
              { id: 42, name: 'Web 42', state: 'active', endDate: '2026-10-24T17:00:00.000Z' },
              { id: 7, name: 'Platform 7', state: 'active', endDate: '2026-10-21T17:00:00.000Z' },
              { id: 44, name: 'Web 44', state: 'future', startDate: '2026-11-10T09:00:00.000Z', endDate: null },
            ],
          },
        ],
      }),
    );

    const answer = await client.projectSprints(credentials, 'WEB');

    expect(answer).toEqual({
      ok: true,
      sprints: [
        {
          id: 7,
          name: 'Platform 7',
          state: 'active',
          boardId: 12,
          startDate: '2026-10-10T09:00:00.000Z',
          endDate: '2026-10-21T17:00:00.000Z',
        },
        {
          id: 42,
          name: 'Web 42',
          state: 'active',
          boardId: 11,
          startDate: '2026-10-10T09:00:00.000Z',
          endDate: '2026-10-24T17:00:00.000Z',
        },
        { id: 43, name: 'Web 43', state: 'future', boardId: 11, startDate: '2026-10-27T09:00:00.000Z', endDate: null },
        { id: 44, name: 'Web 44', state: 'future', boardId: 12, startDate: '2026-11-10T09:00:00.000Z', endDate: null },
      ],
    });
  });

  it('AC-26: asks for Scrum boards of the project, and only active and future sprints', async () => {
    const asked: string[] = [];
    jira.use(
      http.get(boardSearchUrl(), ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({ values: [{ id: 11 }] });
      }),
      http.get(boardSprintsUrl(11), ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({ values: [] });
      }),
    );

    await client.projectSprints(credentials, 'WEB');

    expect(asked).toEqual(['?projectKeyOrId=WEB&type=scrum&maxResults=10', '?state=active%2Cfuture&maxResults=50']);
  });

  it('AC-28: a project with no Scrum board, or none that keeps sprints, has no open sprints', async () => {
    jira.use(...acceptingProjectSprints({ OPS: [] }));
    expect(await client.projectSprints(credentials, 'OPS')).toEqual({ ok: true, sprints: [] });

    jira.use(
      http.get(boardSearchUrl(), () => HttpResponse.json({ values: [{ id: 21 }, { id: 22 }] })),
      http.get(boardSprintsUrl(21), () =>
        HttpResponse.json({ errorMessages: ['The board does not support sprints'] }, { status: 400 }),
      ),
      http.get(boardSprintsUrl(22), () => HttpResponse.json({ errorMessages: ['Hidden'] }, { status: 403 })),
    );
    expect(await client.projectSprints(credentials, 'OPS')).toEqual({ ok: true, sprints: [] });
  });

  it('AC-28: a refused token or a slow Jira is a problem', async () => {
    jira.use(...acceptingProjectSprints({ WEB: [{ id: 11, sprints: [{ id: 42 }] }] }));
    expect(await client.projectSprints({ ...credentials, apiToken: 'fake-wrong-token' }, 'WEB')).toEqual({
      ok: false,
      problem: { kind: 'rejected' },
    });

    jira.use(
      http.get(boardSearchUrl(), async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    expect(await client.projectSprints(credentials, 'WEB')).toEqual({ ok: false, problem: { kind: 'timeout' } });
  });
});

describe('Jira client: one sprint and who you are (spec 020)', () => {
  it('AC-27: reads the sprint Tickets holds, with its board', async () => {
    jira.use(...acceptingProjectSprints({ WEB: [{ id: 11, sprints: [{ id: 42, name: 'Web 42', state: 'closed' }] }] }));

    expect(await client.sprint(credentials, 42)).toEqual({
      ok: true,
      sprint: {
        id: 42,
        name: 'Web 42',
        state: 'closed',
        boardId: 11,
        startDate: '2026-10-10T09:00:00.000Z',
        endDate: '2026-10-24T17:00:00.000Z',
      },
    });
  });

  it('AC-27: a sprint that’s gone or hidden is no sprint, rather than a problem', async () => {
    jira.use(http.get(sprintUrl(99), () => HttpResponse.json({ errorMessages: ['Gone'] }, { status: 404 })));
    expect(await client.sprint(credentials, 99)).toEqual({ ok: true, sprint: null });
  });

  it('says who the credentials belong to', async () => {
    expect(await client.account(credentials)).toEqual({ ok: true, accountId: myAccountId });
    expect(await client.account({ ...credentials, apiToken: 'fake-wrong-token' })).toEqual({
      ok: false,
      problem: { kind: 'rejected' },
    });
  });
});

describe('Jira client: issues in no sprint (spec 020)', () => {
  it('AC-39: asks for a project’s backlog, or your own issues in no sprint, that aren’t Done, in rank order', async () => {
    const asked: string[] = [];
    jira.use(
      http.post(issueSearchUrl(), async ({ request }) => {
        const body = (await request.json()) as { jql: string };
        asked.push(body.jql);
        return HttpResponse.json({ issues: [jiraIssue({ key: 'WEB-1', priority: null })], isLast: true });
      }),
    );

    const project = await client.issuesWithoutSprint(credentials, 'WEB');
    const yours = await client.issuesWithoutSprint(credentials, null);

    expect(project.ok && project.issues.map((issue) => issue.key)).toEqual(['WEB-1']);
    expect(yours.ok).toBe(true);
    expect(asked).toEqual([
      'project = "WEB" AND sprint is EMPTY AND statusCategory != Done ORDER BY Rank ASC',
      'assignee = currentUser() AND sprint is EMPTY AND statusCategory != Done ORDER BY Rank ASC',
    ]);
  });
});
