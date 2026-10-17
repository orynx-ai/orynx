import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  JiraConnectionRequestSchema,
  JiraConnectionSchema,
  JiraProjectListSchema,
  JiraSiteSchema,
} from './index.ts';
import { makeJiraConnection } from './testing.ts';

/** The first message zod gives for a value, the one a form shows under the field. */
function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.error?.issues[0]?.message;
}

const request = { site: 'your-team.atlassian.net', email: 'dev@example.com', apiToken: 'fake-token-abc' };

describe('JiraSiteSchema', () => {
  it.each([
    ['your-team', 'your-team.atlassian.net'],
    ['your-team.atlassian.net', 'your-team.atlassian.net'],
    ['  Your-Team.Atlassian.net  ', 'your-team.atlassian.net'],
    ['https://your-team.atlassian.net/jira/software/projects/PROJ/boards/1', 'your-team.atlassian.net'],
    ['http://your-team.atlassian.net', 'your-team.atlassian.net'],
    ['your-team.atlassian.net/browse/PROJ-1?focused=1#comment', 'your-team.atlassian.net'],
  ])('AC-7: reads %j as the site %s', (typed, site) => {
    expect(JiraSiteSchema.parse(typed)).toBe(site);
  });

  it('AC-7: asks for an address when the field is empty', () => {
    expect(firstMessage(JiraSiteSchema.safeParse('   '))).toBe('Enter the address you open Jira at.');
  });

  it.each([
    'your-team.atlasian.net',
    'jira.example.com',
    'your-team.atlassian.net.example.com',
    'someone@your-team.atlassian.net',
    'your-team.atlassian.net:8443',
    'ftp://your-team.atlassian.net',
    '-team.atlassian.net',
    'a.b.atlassian.net',
    'your team',
  ])('AC-7: refuses %j, so a typo never receives the token (Q2)', (typed) => {
    expect(firstMessage(JiraSiteSchema.safeParse(typed))).toBe(
      'Use your Jira Cloud address, like your-team.atlassian.net.',
    );
  });
});

describe('JiraConnectionRequestSchema', () => {
  it('AC-7: trims every field, because a pasted value often carries a space', () => {
    expect(
      JiraConnectionRequestSchema.parse({
        site: ' your-team ',
        email: ' dev@example.com ',
        apiToken: ' fake-token-abc\n',
      }),
    ).toEqual(request);
  });

  it.each(['', '   ', 'dev', 'dev@'])('AC-7: asks for the sign-in email when it is %j', (email) => {
    expect(firstMessage(JiraConnectionRequestSchema.safeParse({ ...request, email }))).toBe(
      'Enter the email you sign in to Jira with.',
    );
  });

  it('AC-7: refuses a token with a space or line break inside', () => {
    for (const apiToken of ['fake FfGF0', 'fake\nFfGF0']) {
      expect(firstMessage(JiraConnectionRequestSchema.safeParse({ ...request, apiToken }))).toBe(
        'Paste the token without spaces or line breaks.',
      );
    }
  });

  it('AC-7: refuses a token longer than 4096 characters with the message from spec 002', () => {
    expect(firstMessage(JiraConnectionRequestSchema.safeParse({ ...request, apiToken: 'a'.repeat(4097) }))).toBe(
      'A token has no spaces or line breaks and is at most 4096 characters.',
    );
  });

  it('AC-10, AC-12: lets the token be left out or left empty, to keep the saved one or use .env', () => {
    const { apiToken: _, ...withoutToken } = request;
    expect(JiraConnectionRequestSchema.parse(withoutToken)).toEqual(withoutToken);
    expect(JiraConnectionRequestSchema.parse({ ...request, apiToken: '  ' })).toEqual(withoutToken);
  });
});

describe('JiraConnectionSchema', () => {
  it('describes a saved connection and whether .env holds a token, never the token itself', () => {
    const body = { saved: { site: 'your-team.atlassian.net', email: 'dev@example.com' }, envToken: true };
    expect(JiraConnectionSchema.parse(body)).toEqual(body);
    expect(Object.keys(JiraConnectionSchema.shape)).toEqual(['saved', 'envToken']);
  });

  it('builds a valid connection for tests', () => {
    expect(makeJiraConnection()).toEqual({ saved: null, envToken: false });
    expect(makeJiraConnection({ saved: { site: 'your-team.atlassian.net', email: 'dev@example.com' } }).saved).toEqual({
      site: 'your-team.atlassian.net',
      email: 'dev@example.com',
    });
  });
});

describe('JiraProjectListSchema', () => {
  it('AC-5: lists projects by key and name', () => {
    const list = {
      projects: [
        { key: 'MOB', name: 'Mobile' },
        { key: 'PROJ', name: 'Intranet' },
      ],
    };
    expect(JiraProjectListSchema.parse(list)).toEqual(list);
    expect(apiRoutes.jiraProjects).toBe('/api/jira/projects');
  });

  it('refuses a key Jira would never make', () => {
    expect(JiraProjectListSchema.safeParse({ projects: [{ key: 'proj', name: 'Intranet' }] }).success).toBe(false);
  });
});
