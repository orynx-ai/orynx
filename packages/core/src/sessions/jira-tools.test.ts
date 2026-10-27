import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createJiraClient } from '../integrations/jira/client.ts';
import {
  acceptingIssue,
  acceptingIssueSearch,
  acceptingJiraChanges,
  acceptingProjectSearch,
  type FakeJiraWrite,
  issueUrl,
  myAccountId,
  goodToken,
  issueSearchUrl,
  jiraEmail,
  jiraSite,
  useFakeJira,
} from '../test/fake-jira.ts';
import { jiraTools, type JiraStep } from './jira-tools.ts';

const jira = useFakeJira();
const credentials = { site: jiraSite, email: jiraEmail, apiToken: goodToken };

function setUp({
  apiToken = goodToken,
  connected = true,
  changesAllowed = false,
}: { apiToken?: string; connected?: boolean; changesAllowed?: boolean } = {}) {
  const steps: JiraStep[] = [];
  const asked: string[] = [];
  jira.events.on('request:start', ({ request }) => {
    asked.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  const tools = jiraTools({
    jira: createJiraClient({ timeoutMs: 200 }),
    request: () => Promise.resolve(connected ? { ...credentials, apiToken } : null),
    did: (step) => {
      steps.push(step);
      return Promise.resolve();
    },
    changesAllowed: () => Promise.resolve(changesAllowed),
  });
  const named = (name: string) => {
    const tool = tools.find((one) => one.name === name);
    if (tool === undefined) throw new Error(`No ${name}`);
    return tool;
  };
  const run = (name: string, input: unknown) => named(name).run(input);
  const asks = (name: string, input: Record<string, unknown>) => named(name).asks(input);
  return { tools, steps, asked, run, asks };
}

const writes = ['comment_on_jira_issue', 'transition_jira_issue', 'assign_jira_issue'];

describe('Jira tools in a session (spec 044)', () => {
  it('AC-1, Q3: are three reads that never ask first, then three changes', async () => {
    const { tools } = setUp();
    expect(tools.map((tool) => tool.name)).toEqual(['list_jira_projects', 'search_jira', 'get_jira_issue', ...writes]);
    for (const tool of tools.slice(0, 3)) expect(await tool.asks({})).toBeNull();
  });

  it('AC-1: lists the projects by key and name, and says so as a step', async () => {
    jira.use(acceptingProjectSearch([{ key: 'MAG', name: 'Acme' }]));
    const { run, steps } = setUp();

    expect(await run('list_jira_projects', {})).toEqual({ text: '[{"key":"MAG","name":"Acme"}]' });
    expect(steps).toEqual([{ action: 'projects' }]);
  });

  it('AC-1, AC-9: searches with the JQL, 50 issues unless asked for up to 100, and a step with how many', async () => {
    const limits: unknown[] = [];
    jira.use(
      http.post(issueSearchUrl(), async ({ request }) => {
        limits.push(((await request.clone().json()) as { maxResults: number }).maxResults);
        return undefined;
      }),
      acceptingIssueSearch([{ key: 'MAG-12', summary: 'Crash on save', type: 'Bug' }]),
    );
    const { run, steps } = setUp();

    const answer = await run('search_jira', { jql: 'assignee = currentUser() AND issuetype = Bug' });
    await run('search_jira', { jql: 'project = MAG', limit: 100 });

    expect(JSON.parse(answer.text)).toMatchObject({
      more: false,
      issues: [{ key: 'MAG-12', summary: 'Crash on save' }],
    });
    expect(limits).toEqual([50, 100]);
    expect(steps).toEqual([
      { action: 'searched', found: 1, more: false },
      { action: 'searched', found: 1, more: false },
    ]);
  });

  it('AC-17 (spec 048): Claude reads every page by passing `next` back', async () => {
    const issues = Array.from({ length: 250 }, (_, n) => ({ key: `MAG-${String(n + 1)}` }));
    jira.use(acceptingIssueSearch(issues));
    const { run, tools } = setUp();

    const sizes: number[] = [];
    let next: string | null = null;
    do {
      const answer = await run('search_jira', { jql: 'project = MAG', limit: 100, ...(next === null ? {} : { next }) });
      const page = JSON.parse(answer.text) as { issues: unknown[]; more: boolean; next: string | null };
      sizes.push(page.issues.length);
      next = page.next ?? null;
    } while (next !== null && sizes.length < 5);

    expect(sizes).toEqual([100, 100, 50]);
    expect(tools.find((tool) => tool.name === 'search_jira')?.description).toContain(
      'pass `next` to read the next page',
    );
  });

  it('AC-9, AC-10: refuses more than 100, an empty query or a key that isn’t one, and never asks Jira', async () => {
    const { run, steps, asked } = setUp();

    const many = await run('search_jira', { jql: 'project = MAG', limit: 500 });
    const empty = await run('search_jira', { jql: '  ' });
    const key = await run('get_jira_issue', { key: 'mag 12' });

    expect(many).toMatchObject({ error: true });
    expect(many.text).toContain('Ask for at most 100 issues');
    expect(empty.text).toContain('Send a JQL query.');
    expect(key).toMatchObject({ error: true });
    expect(asked).toEqual([]);
    expect(steps).toEqual([]);
  });

  it('AC-7: a query Jira refuses answers with Jira’s own words, and adds no step', async () => {
    jira.use(
      http.post(issueSearchUrl(), () =>
        HttpResponse.json(
          { errorMessages: ["The value 'NOPE' does not exist for the field 'project'."] },
          { status: 400 },
        ),
      ),
    );
    const { run, steps } = setUp();

    expect(await run('search_jira', { jql: 'project = NOPE' })).toEqual({
      text: "Jira refused the query: The value 'NOPE' does not exist for the field 'project'.",
      error: true,
    });
    expect(steps).toEqual([]);
  });

  it('AC-2: reads one issue with its comments and links, and the step names it with its summary', async () => {
    jira.use(acceptingIssue({ key: 'MAG-12', summary: 'Crash on save', status: { name: 'To Do', category: 'new' } }));
    const { run, steps } = setUp();

    const answer = await run('get_jira_issue', { key: 'MAG-12' });

    expect(JSON.parse(answer.text)).toMatchObject({ key: 'MAG-12', summary: 'Crash on save', comments: [], links: [] });
    expect(steps).toEqual([{ action: 'read', key: 'MAG-12', summary: 'Crash on save' }]);
  });

  it('AC-8: says what went wrong in words Claude can act on, and adds no step', async () => {
    jira.use(
      acceptingIssue({ key: 'MAG-12' }),
      http.get('https://your-team.atlassian.net/rest/api/3/project/search', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );

    const missing = await setUp().run('get_jira_issue', { key: 'MAG-404' });
    const refused = await setUp({ apiToken: 'fake-wrong-token' }).run('get_jira_issue', { key: 'MAG-12' });
    const slow = await setUp().run('list_jira_projects', {});
    const gone = setUp({ connected: false });

    expect(missing).toEqual({ text: "There's no Jira issue MAG-404, or you can't see it.", error: true });
    expect(refused).toEqual({
      text: "Jira refused Orynx's saved login. Reconnect Jira in Settings › Connections.",
      error: true,
    });
    expect(slow).toEqual({ text: 'Jira took too long to answer.', error: true });
    expect(await gone.run('search_jira', { jql: 'project = MAG' })).toEqual({
      text: "Jira isn't connected in Orynx any more. Connect it in Settings › Connections.",
      error: true,
    });
    expect(gone.steps).toEqual([]);
  });
});

describe('Jira changes in a session (spec 044)', () => {
  it('AC-13, AC-16: a comment or an assignment asks first, unless Claude changes Jira is on', async () => {
    const off = setUp();
    expect(await off.asks('comment_on_jira_issue', { key: 'MAG-12', text: 'Fixed in main.' })).toEqual({
      kind: 'jira',
      key: 'MAG-12',
      change: { action: 'comment', text: 'Fixed in main.' },
    });
    expect(await off.asks('assign_jira_issue', { key: 'MAG-12', to: 'nobody' })).toEqual({
      kind: 'jira',
      key: 'MAG-12',
      change: { action: 'assign', to: 'nobody' },
    });

    const on = setUp({ changesAllowed: true });
    expect(await on.asks('comment_on_jira_issue', { key: 'MAG-12', text: 'Fixed in main.' })).toBeNull();
    expect(await on.asks('assign_jira_issue', { key: 'MAG-12', to: 'me' })).toBeNull();
  });

  it('AC-10: a change that isn’t one is refused, never asked about and never allowed, even with the row on', async () => {
    const { asks, asked } = setUp({ changesAllowed: true });
    for (const [name, input] of [
      ['comment_on_jira_issue', { key: 'MAG-12', text: ' ' }],
      ['assign_jira_issue', { key: 'MAG-12', to: 'someone@example.com' }],
      ['transition_jira_issue', { key: 'mag 12', status: 'Done' }],
    ] as const) {
      expect(await asks(name, input)).toMatchObject({
        refused: expect.stringContaining("Orynx couldn't take that") as unknown,
      });
    }
    expect(asked).toEqual([]);
  });

  it('AC-14: a move asks with where the issue is and where it goes, found in its own workflow by any case', async () => {
    jira.use(...acceptingJiraChanges([]));
    expect(await setUp().asks('transition_jira_issue', { key: 'MAG-12', status: 'in review' })).toEqual({
      kind: 'jira',
      key: 'MAG-12',
      change: { action: 'transition', from: 'To Do', to: 'In Review' },
    });
  });

  it('AC-15: a status the issue can’t reach is refused with where it can go, and nothing is asked or written', async () => {
    const changes: FakeJiraWrite[] = [];
    jira.use(...acceptingJiraChanges(changes));
    expect(await setUp().asks('transition_jira_issue', { key: 'MAG-12', status: 'Shipped' })).toEqual({
      refused: "MAG-12 can't move to Shipped. From To Do it can move to: In Progress, In Review.",
    });
    expect(changes).toEqual([]);
  });

  it('AC-13, AC-14: once allowed, each change reaches Jira and is a step', async () => {
    const changes: FakeJiraWrite[] = [];
    jira.use(...acceptingJiraChanges(changes));
    const { run, steps } = setUp();

    expect(await run('comment_on_jira_issue', { key: 'MAG-12', text: 'Fixed in main.' })).toEqual({
      text: 'Commented on MAG-12.',
    });
    expect(await run('transition_jira_issue', { key: 'MAG-12', status: 'In Review' })).toEqual({
      text: 'Moved MAG-12 to In Review.',
    });
    expect(await run('assign_jira_issue', { key: 'MAG-12', to: 'me' })).toEqual({
      text: 'Assigned MAG-12 to the user.',
    });
    expect(await run('assign_jira_issue', { key: 'MAG-12', to: 'nobody' })).toEqual({ text: 'Unassigned MAG-12.' });

    expect(changes.map(({ path, body }) => [path, body])).toEqual([
      ['comment', { body: expect.objectContaining({ type: 'doc' }) as unknown }],
      ['transitions', { transition: { id: '31' } }],
      ['assignee', { accountId: myAccountId }],
      ['assignee', { accountId: null }],
    ]);
    expect(steps).toEqual([
      { action: 'commented', key: 'MAG-12' },
      { action: 'moved', key: 'MAG-12', to: 'In Review' },
      { action: 'assigned', key: 'MAG-12', to: 'me' },
      { action: 'assigned', key: 'MAG-12', to: 'nobody' },
    ]);
  });

  it('AC-18: a change Jira refuses answers with Jira’s own words, and adds no step', async () => {
    jira.use(
      http.post(`${issueUrl('MAG-12')}/comment`, () =>
        HttpResponse.json({ errorMessages: ['You do not have permission to comment on this issue.'] }, { status: 403 }),
      ),
    );
    const { run, steps } = setUp();

    expect(await run('comment_on_jira_issue', { key: 'MAG-12', text: 'Hi' })).toEqual({
      text: 'Jira refused it: You do not have permission to comment on this issue.',
      error: true,
    });
    expect(steps).toEqual([]);
  });
});
