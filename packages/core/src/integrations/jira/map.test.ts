import { describe, expect, it } from 'vitest';
import { jiraIssue, jiraSite, type FakeIssue } from '../../test/fake-jira.ts';
import { JiraIssueRecordSchema, jiraRecords } from './map.ts';

const order = ['1', '2', '3', '4', '5'];

function records(issues: readonly FakeIssue[], priorityOrder: readonly string[] = order) {
  return jiraRecords(jiraSite, issues.map(jiraIssue), priorityOrder);
}

describe('Jira map', () => {
  it('AC-2: keeps what a row shows, with a link to the issue and the wait from its status category change', () => {
    const [record] = records([
      {
        key: 'PROJ-1423',
        summary: 'Add bulk archive to the content list',
        status: 'In review',
        category: 'indeterminate',
        statuscategorychangedate: '2026-10-15T09:12:00.000+0000',
      },
    ]);

    expect(record).toEqual({
      key: 'PROJ-1423',
      summary: 'Add bulk archive to the content list',
      status: 'In review',
      category: 'in_progress',
      highPriorityBug: false,
      type: 'Task',
      dueDate: null,
      waitingSince: '2026-10-15T09:12:00.000Z',
      url: 'https://your-team.atlassian.net/browse/PROJ-1423',
    });
    expect(JiraIssueRecordSchema.parse(record)).toEqual(record);
  });

  it('AC-4: goes by status category, never by the status’s name', () => {
    const kept = records([
      { key: 'PROJ-1', status: 'Klar', category: 'done' },
      { key: 'PROJ-2', status: 'Done', category: 'indeterminate' },
      { key: 'PROJ-3', status: 'Backlog', category: 'new' },
      { key: 'PROJ-4', status: 'Triage', category: 'undefined' },
    ]);

    expect(kept.map((record) => [record.key, record.category])).toEqual([
      ['PROJ-2', 'in_progress'],
      ['PROJ-3', 'to_do'],
      ['PROJ-4', 'to_do'],
    ]);
  });

  it('AC-5: a high-priority bug is a type named Bug, in any case, with one of the site’s two highest priorities', () => {
    const kept = records([
      { key: 'PROJ-1', type: 'Bug', priority: '1' },
      { key: 'PROJ-2', type: 'bug', priority: '2' },
      { key: 'PROJ-3', type: 'Bug', priority: '3' },
      { key: 'PROJ-4', type: 'Task', priority: '1' },
      { key: 'PROJ-5', type: 'Bug', priority: null },
    ]);

    expect(kept.map((record) => record.highPriorityBug)).toEqual([true, true, false, false, false]);
  });

  it('keeps the issue type’s name as Jira shows it, for Home’s Type filter', () => {
    const kept = records([
      { key: 'PROJ-1', type: 'Bug' },
      { key: 'PROJ-2', type: ' Story ' },
    ]);

    expect(kept.map((record) => record.type)).toEqual(['Bug', 'Story']);
  });

  it('still reads a record cached before Orynx kept the type', () => {
    const [record] = records([{ key: 'PROJ-1' }]);
    const { type: _type, ...cached } = record ?? {};

    expect(JiraIssueRecordSchema.safeParse(cached).success).toBe(true);
  });

  it('AC-5: follows the site’s own order of priorities, not their ids', () => {
    const [record] = records([{ key: 'PROJ-1', type: 'Bug', priority: '5' }], ['5', '4', '3']);

    expect(record?.highPriorityBug).toBe(true);
  });

  it('AC-5: keeps the due date as a calendar day, and drops one Jira wrote some other way', () => {
    const kept = records([
      { key: 'PROJ-1', duedate: '2026-10-19' },
      { key: 'PROJ-2', duedate: '19/10/2026' },
    ]);

    expect(kept.map((record) => record.dueDate)).toEqual(['2026-10-19', null]);
  });

  it('counts the wait from when the issue was created when Jira doesn’t say when its category changed', () => {
    const kept = records([
      { key: 'PROJ-1', created: '2026-10-01T09:00:00.000+0000' },
      { key: 'PROJ-2', created: '2026-10-02T09:00:00.000+0530', statuscategorychangedate: 'yesterday' },
    ]);

    expect(kept.map((record) => record.waitingSince)).toEqual(['2026-10-01T09:00:00.000Z', '2026-10-02T03:30:00.000Z']);
  });

  it('leaves out an issue whose key couldn’t make a safe link, and names an issue with no summary by its key', () => {
    const kept = records([{ key: 'PROJ-1/../../admin' }, { key: 'PROJ-7', summary: '   ' }]);

    expect(kept.map((record) => [record.key, record.summary])).toEqual([['PROJ-7', 'PROJ-7']]);
  });

  it('keeps an issue Jira sends twice once, so the cache never holds two records for one key', () => {
    expect(records([{ key: 'PROJ-7' }, { key: 'PROJ-7' }]).map((record) => record.key)).toEqual(['PROJ-7']);
  });
});
