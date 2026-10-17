import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  acceptingIssueSearch,
  acceptingPrioritySearch,
  acceptingProjectSearch,
  goodBasicValue,
  issueSearchUrl,
  goodToken,
  jiraEmail,
  jiraSite,
  myselfUrl,
  prioritySearchUrl,
  projectSearchUrl,
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
        jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
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
