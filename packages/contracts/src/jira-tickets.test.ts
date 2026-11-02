import { describe, expect, it } from 'vitest';
import {
  apiPaths,
  apiRoutes,
  JiraTicketTypesQuerySchema,
  JiraTicketTypesSchema,
  NewJiraTicketAnswerSchema,
  NewJiraTicketSchema,
} from './index.ts';
import { makeJiraTicketTypes, makeNewJiraTicket } from './testing.ts';

describe('a new Jira ticket (spec 019)', () => {
  it('AC-2: a project’s types each carry their priorities, Jira’s default and whether they have a due date', () => {
    const { types } = makeJiraTicketTypes();
    expect(types.map((type) => type.name)).toEqual(['Task', 'Story', 'Bug']);
    expect(types[0]).toMatchObject({ defaultPriorityId: '3', dueDate: true });
    expect(types[0]?.priorities.map((priority) => priority.name)).toEqual([
      'Highest',
      'High',
      'Medium',
      'Low',
      'Lowest',
    ]);
    // A type whose create screen has no priority lists none.
    expect(
      JiraTicketTypesSchema.parse({
        types: [{ id: '1', name: 'Epic', priorities: [], defaultPriorityId: null, dueDate: false }],
      }).types,
    ).toHaveLength(1);
    expect(JiraTicketTypesQuerySchema.safeParse({ project: 'MAI' }).success).toBe(true);
    expect(JiraTicketTypesQuerySchema.safeParse({ project: 'mai' }).success).toBe(false);
  });

  it('AC-13, AC-18: the server takes only a ticket the form would take, in a project and an optional sprint', () => {
    const ticket = makeNewJiraTicket();
    expect(NewJiraTicketSchema.parse(ticket)).toEqual(ticket);
    expect(NewJiraTicketSchema.safeParse({ ...ticket, title: '  ' }).error?.issues[0]?.message).toBe('Add a title.');
    expect(NewJiraTicketSchema.safeParse({ ...ticket, title: 'x'.repeat(256) }).success).toBe(false);
    expect(NewJiraTicketSchema.safeParse({ ...ticket, description: 'x'.repeat(32_001) }).success).toBe(false);
    expect(NewJiraTicketSchema.safeParse({ ...ticket, sprintId: null, priorityId: null, dueDate: null }).success).toBe(
      true,
    );
    for (const wrong of [
      { projectKey: 'mai' },
      { sprintId: 0 },
      { column: 'later' },
      { typeId: '' },
      { dueDate: 'Tue' },
    ]) {
      expect(NewJiraTicketSchema.safeParse({ ...ticket, ...wrong }).success).toBe(false);
    }
  });

  it('AC-3, AC-9, AC-10, AC-11: the answer is made, made but missing a step, refused in Jira’s words, or unreachable', () => {
    const url = 'https://your-team.atlassian.net/browse/MAI-142';
    expect(NewJiraTicketAnswerSchema.parse({ result: 'made', key: 'MAI-142', url }).result).toBe('made');
    expect(
      NewJiraTicketAnswerSchema.parse({ result: 'made_but', key: 'MAI-142', url, missed: 'column', reason: 'No.' }),
    ).toMatchObject({ missed: 'column' });
    expect(
      NewJiraTicketAnswerSchema.safeParse({
        result: 'made_but',
        key: 'MAI-142',
        url,
        missed: 'assignee',
        reason: 'No.',
      }).success,
    ).toBe(false);
    expect(NewJiraTicketAnswerSchema.parse({ result: 'refused', reason: 'Epic Name is required.' }).result).toBe(
      'refused',
    );
    expect(NewJiraTicketAnswerSchema.safeParse({ result: 'refused', reason: 'x'.repeat(501) }).success).toBe(false);
    expect(NewJiraTicketAnswerSchema.parse({ result: 'unreachable' }).result).toBe('unreachable');
    // A link only to the Jira Cloud site, over https.
    expect(
      NewJiraTicketAnswerSchema.safeParse({ result: 'made', key: 'MAI-142', url: 'http://evil.example/MAI-142' })
        .success,
    ).toBe(false);
  });

  it('has its two paths under /api/tickets/jira, clear of /tickets/:key', () => {
    expect(apiPaths.jiraTicketTypes).toBe('/tickets/jira/types');
    expect(apiRoutes.jiraTickets).toBe('/api/tickets/jira');
  });
});
