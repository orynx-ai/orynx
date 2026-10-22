import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createJiraClient } from '../integrations/jira/client.ts';
import {
  acceptingIssue,
  acceptingIssueSearch,
  acceptingProjectSearch,
  goodToken,
  issueSearchUrl,
  jiraEmail,
  jiraSite,
  useFakeJira,
} from '../test/fake-jira.ts';
import { jiraTools, type JiraStep } from './jira-tools.ts';

const jira = useFakeJira();
const credentials = { site: jiraSite, email: jiraEmail, apiToken: goodToken };

function setUp({ apiToken = goodToken, connected = true }: { apiToken?: string; connected?: boolean } = {}) {
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
  });
  const run = (name: string, input: unknown) => {
    const tool = tools.find((one) => one.name === name);
    if (tool === undefined) throw new Error(`No ${name}`);
    return tool.run(input);
  };
  return { tools, steps, asked, run };
}

describe('Jira tools in a session (spec 044)', () => {
  it('AC-1, Q3: are three reads that never ask first', async () => {
    const { tools } = setUp();
    expect(tools.map((tool) => tool.name)).toEqual(['list_jira_projects', 'search_jira', 'get_jira_issue']);
    for (const tool of tools) expect(await tool.asks({})).toBeNull();
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
