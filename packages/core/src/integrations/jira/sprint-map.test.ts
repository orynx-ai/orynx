import { describe, expect, it } from 'vitest';
import { jiraIssue, jiraSprint, myAccountId, type FakeIssue, type FakeSprint } from '../../test/fake-jira.ts';
import type { JiraBoardColumn, JiraSprintIssue, JiraSprintRef } from './client.ts';
import { boardLayout, columnOf, pickSprint, priorityLevel, sprintRecord, SprintRecordSchema } from './sprint-map.ts';

const site = 'your-team.atlassian.net';

function ref(sprint: FakeSprint): JiraSprintRef {
  const made = jiraSprint(sprint);
  return {
    id: made.id,
    name: made.name,
    state: made.state,
    boardId: 'boardId' in made ? made.boardId : null,
    endDate: made.endDate ?? null,
  };
}

/** An issue in the sprint as the client hands it over. */
function issue(fake: FakeIssue): JiraSprintIssue {
  return jiraIssue(fake) as unknown as JiraSprintIssue;
}

const designColumns: JiraBoardColumn[] = [
  { name: 'To Do', statusIds: ['10000'] },
  { name: 'In Progress', statusIds: ['3'] },
  { name: 'Code Review', statusIds: ['10001'] },
  { name: 'QA', statusIds: ['10003', '10004'] },
  { name: 'Done', statusIds: ['10002'] },
];
const designCategories = new Map([
  ['10000', 'new'],
  ['3', 'indeterminate'],
  ['10001', 'indeterminate'],
  ['10003', 'indeterminate'],
  ['10004', 'indeterminate'],
  ['10002', 'done'],
]);

describe('pickSprint (Q1)', () => {
  it('AC-1: picks the active sprint that holds the most of your issues', () => {
    const issues = [
      { key: 'PROJ-1', sprints: [ref({ id: 41, state: 'closed' }), ref({ id: 42 })] },
      { key: 'PROJ-2', sprints: [ref({ id: 42 })] },
      { key: 'WEB-7', sprints: [ref({ id: 90, boardId: 12 })] },
    ];

    expect(pickSprint(issues)?.id).toBe(42);
  });

  it('AC-1: leaves out future and closed sprints, even when they hold more of your issues', () => {
    const issues = [
      { key: 'PROJ-1', sprints: [ref({ id: 43, state: 'future' })] },
      { key: 'PROJ-2', sprints: [ref({ id: 43, state: 'future' })] },
      { key: 'PROJ-3', sprints: [ref({ id: 41, state: 'closed' })] },
      { key: 'PROJ-4', sprints: [ref({ id: 42 })] },
    ];

    expect(pickSprint(issues)?.id).toBe(42);
  });

  it('AC-1: on a tie, picks the one that ends first, and one with no end date last', () => {
    const issues = [
      { key: 'A-1', sprints: [ref({ id: 1, endDate: null })] },
      { key: 'B-1', sprints: [ref({ id: 2, endDate: '2026-10-30T17:00:00.000Z' })] },
      { key: 'C-1', sprints: [ref({ id: 3, endDate: '2026-10-24T17:00:00.000Z' })] },
    ];

    expect(pickSprint(issues)?.id).toBe(3);
  });

  it('AC-22: none of your issues is in an active sprint', () => {
    expect(pickSprint([])).toBeNull();
    expect(pickSprint([{ key: 'PROJ-1', sprints: [ref({ id: 43, state: 'future' })] }])).toBeNull();
  });
});

describe('columnOf (Q2)', () => {
  const layout = boardLayout(designColumns, designCategories);

  it('AC-4: a later in-progress column is In review; the first one is In progress', () => {
    expect(columnOf({ id: '3', category: 'indeterminate' }, layout)).toBe('in_progress');
    expect(columnOf({ id: '10001', category: 'indeterminate' }, layout)).toBe('in_review');
    expect(columnOf({ id: '10004', category: 'indeterminate' }, layout)).toBe('in_review');
  });

  it('AC-3: To do and Done follow the category, whatever the status is called or where the board puts it', () => {
    expect(columnOf({ id: '10000', category: 'new' }, layout)).toBe('to_do');
    expect(columnOf({ id: '10002', category: 'done' }, layout)).toBe('done');
    // "Klar" in the Done category, wherever the board shows it.
    expect(columnOf({ id: '10001', category: 'done' }, layout)).toBe('done');
    expect(columnOf({ id: '1', category: 'undefined' }, layout)).toBe('to_do');
  });

  it('AC-4: the first in-progress column is the first holding any In progress status, by category', () => {
    // A team whose board starts with Backlog and Selected, both To do.
    const layoutWithBacklog = boardLayout(
      [
        { name: 'Backlog', statusIds: ['10005'] },
        { name: 'Selected', statusIds: ['10006'] },
        { name: 'Doing', statusIds: ['3'] },
        { name: 'Review', statusIds: ['10001'] },
        { name: 'Done', statusIds: ['10002'] },
      ],
      new Map([...designCategories, ['10005', 'new'], ['10006', 'new']]),
    );

    expect(columnOf({ id: '3', category: 'indeterminate' }, layoutWithBacklog)).toBe('in_progress');
    expect(columnOf({ id: '10001', category: 'indeterminate' }, layoutWithBacklog)).toBe('in_review');
  });

  it('AC-5: with one in-progress column, a board DevHub can’t read, or a status the board doesn’t show, it’s In progress', () => {
    const oneColumn = boardLayout(
      [
        { name: 'To Do', statusIds: ['10000'] },
        { name: 'Doing', statusIds: ['3', '10001'] },
        { name: 'Done', statusIds: ['10002'] },
      ],
      designCategories,
    );

    expect(columnOf({ id: '10001', category: 'indeterminate' }, oneColumn)).toBe('in_progress');
    expect(columnOf({ id: '10001', category: 'indeterminate' }, null)).toBe('in_progress');
    expect(columnOf({ id: '99999', category: 'indeterminate' }, layout)).toBe('in_progress');
  });
});

describe('priorityLevel (Q7a)', () => {
  it('AC-2: the two highest get 3 bars, the two lowest 1, and the rest 2', () => {
    const order = ['1', '2', '3', '4', '5'];

    expect(['1', '2', '3', '4', '5'].map((id) => priorityLevel(id, order))).toEqual([
      'high',
      'high',
      'medium',
      'low',
      'low',
    ]);
    expect(['1', '2', '3', '4'].map((id) => priorityLevel(id, ['1', '2', '3', '4']))).toEqual([
      'high',
      'high',
      'low',
      'low',
    ]);
  });

  it('AC-2: with three or fewer, the highest gets 3, the lowest 1 and the rest 2', () => {
    expect(['a', 'b', 'c'].map((id) => priorityLevel(id, ['a', 'b', 'c']))).toEqual(['high', 'medium', 'low']);
    expect(['a', 'b'].map((id) => priorityLevel(id, ['a', 'b']))).toEqual(['high', 'low']);
    expect(priorityLevel('a', ['a'])).toBe('high');
  });

  it('a priority the site no longer lists gets 2 bars', () => {
    expect(priorityLevel('9', ['1', '2', '3', '4', '5'])).toBe('medium');
  });
});

describe('sprintRecord', () => {
  const sprint = ref({ id: 42, name: 'Sprint 42' });
  const layout = boardLayout(designColumns, designCategories);

  function record(issues: FakeIssue[], options: { truncated?: boolean } = {}) {
    return sprintRecord({
      site,
      accountId: myAccountId,
      sprint,
      issues: issues.map(issue),
      layout,
      priorityOrder: ['1', '2', '3', '4', '5'],
      truncated: options.truncated ?? false,
    });
  }

  it('AC-1: the sprint and its tickets in rank order, each with what a card shows', () => {
    const kept = record([
      {
        key: 'PROJ-1377',
        summary: 'Search returns archived sites for guest users',
        type: 'Bug',
        priority: '2',
        duedate: '2026-10-19',
        category: 'new',
      },
      {
        key: 'PROJ-1350',
        summary: 'Migrate feed cards',
        status: 'Code Review',
        statusId: '10001',
        type: 'Task',
        priority: null,
      },
    ]);

    expect(SprintRecordSchema.parse(kept)).toEqual({
      sprint: { id: 42, name: 'Sprint 42', endsAt: '2026-10-24T17:00:00.000Z', projectKey: 'PROJ' },
      truncated: false,
      tickets: [
        {
          key: 'PROJ-1377',
          title: 'Search returns archived sites for guest users',
          url: 'https://your-team.atlassian.net/browse/PROJ-1377',
          status: 'In Progress',
          column: 'to_do',
          type: 'Bug',
          bug: true,
          priority: { name: 'High', level: 'high' },
          dueDate: '2026-10-19',
          assignee: { name: 'Dev Example', mine: true },
        },
        {
          key: 'PROJ-1350',
          title: 'Migrate feed cards',
          url: 'https://your-team.atlassian.net/browse/PROJ-1350',
          status: 'Code Review',
          column: 'in_review',
          type: 'Task',
          bug: false,
          priority: null,
          dueDate: null,
          assignee: { name: 'Dev Example', mine: true },
        },
      ],
    });
  });

  it('AC-7: someone else’s ticket isn’t yours, and nobody’s has no assignee', () => {
    const kept = record([
      { key: 'PROJ-1', assignee: { accountId: 'someone-else', displayName: 'Priya Shah' } },
      { key: 'PROJ-2', assignee: null },
    ]);

    expect(kept.tickets.map((ticket) => ticket.assignee)).toEqual([{ name: 'Priya Shah', mine: false }, null]);
  });

  it('AC-9: a type named bug in any case is a bug', () => {
    expect(record([{ key: 'PROJ-1', type: 'BUG' }]).tickets[0]?.bug).toBe(true);
  });

  it('AC-1: the page bar’s project is left out when the sprint spans more than one project (Q9a)', () => {
    expect(record([{ key: 'PROJ-1' }, { key: 'WEB-2' }]).sprint.projectKey).toBeNull();
    expect(record([]).sprint.projectKey).toBeNull();
  });

  it('AC-26: says when Jira had more tickets than DevHub keeps', () => {
    expect(record([{ key: 'PROJ-1' }], { truncated: true }).truncated).toBe(true);
  });

  it('leaves out a key it can’t link to safely and a key’s second copy, and names an untitled ticket by its key', () => {
    const kept = record([{ key: 'proj-1' }, { key: 'PROJ-2', summary: '  ' }, { key: 'PROJ-2', summary: 'Again' }]);

    expect(kept.tickets.map((ticket) => [ticket.key, ticket.title])).toEqual([['PROJ-2', 'PROJ-2']]);
  });

  it('AC-28: keeps titles and metadata only, even if Jira sent a description or comments anyway', () => {
    const withText = {
      ...issue({ key: 'PROJ-1' }),
      fields: {
        ...issue({ key: 'PROJ-1' }).fields,
        description: 'Secret plans for the launch',
        comment: { comments: [{ body: 'A private remark' }] },
      },
    } as JiraSprintIssue;

    const kept = sprintRecord({
      site,
      accountId: myAccountId,
      sprint,
      issues: [withText],
      layout,
      priorityOrder: [],
      truncated: false,
    });

    expect(JSON.stringify(kept)).not.toContain('Secret plans');
    expect(JSON.stringify(kept)).not.toContain('A private remark');
  });
});
