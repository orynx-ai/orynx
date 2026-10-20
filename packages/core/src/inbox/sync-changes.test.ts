import { describe, expect, it } from 'vitest';
import type { PullRequestRecord } from '../integrations/github/map.ts';
import type { JiraIssueRecord } from '../integrations/jira/map.ts';
import { syncChanges } from './sync-changes.ts';

function issue(key: string, overrides: Partial<JiraIssueRecord> = {}): JiraIssueRecord {
  return {
    key,
    summary: `Ticket ${key}`,
    status: 'To Do',
    category: 'to_do',
    highPriorityBug: false,
    dueDate: null,
    waitingSince: '2026-10-19T09:00:00.000Z',
    url: `https://acme.atlassian.net/browse/${key}`,
    ...overrides,
  };
}

function pull(number: number, overrides: Partial<PullRequestRecord> = {}): PullRequestRecord {
  return {
    id: `acme/web-app#${String(number)}`,
    repository: 'web-app',
    number,
    title: `Pull request ${String(number)}`,
    url: `https://github.com/acme/web-app/pull/${String(number)}`,
    author: 'Priya Sharma',
    mine: false,
    openedAt: '2026-10-19T09:00:00.000Z',
    reviewRequestedAt: null,
    checksFailedAt: null,
    unresolved: null,
    ...overrides,
  };
}

describe('what a sync changed (spec 035)', () => {
  it('AC-33: finds the new, the updated and the removed tickets', () => {
    const before = [issue('PROJ-1'), issue('PROJ-2')];
    const after = [issue('PROJ-2', { status: 'In Review', category: 'in_progress' }), issue('PROJ-3')];

    expect(syncChanges('jira', before, after)).toEqual({
      changes: [
        { kind: 'new', ref: 'PROJ-3', title: 'Ticket PROJ-3', url: 'https://acme.atlassian.net/browse/PROJ-3' },
        { kind: 'updated', ref: 'PROJ-2', title: 'Ticket PROJ-2', url: 'https://acme.atlassian.net/browse/PROJ-2' },
        { kind: 'removed', ref: 'PROJ-1', title: 'Ticket PROJ-1', url: 'https://acme.atlassian.net/browse/PROJ-1' },
      ],
      moreChanges: 0,
    });
  });

  it('AC-33: names a pull request by its repository and number, and sees new failing checks as an update', () => {
    const before = [pull(482)];
    const after = [pull(482, { checksFailedAt: '2026-10-20T10:30:00.000Z' })];

    expect(syncChanges('github', before, after).changes).toEqual([
      {
        kind: 'updated',
        ref: `web-app #${String(482)}`,
        title: 'Pull request 482',
        url: 'https://github.com/acme/web-app/pull/482',
      },
    ]);
  });

  it('AC-14: the same items twice change nothing, and neither does a field the row never shows', () => {
    expect(syncChanges('jira', [issue('PROJ-1')], [issue('PROJ-1')])).toEqual({ changes: [], moreChanges: 0 });
    expect(syncChanges('github', [pull(1)], [pull(1, { openedAt: '2026-10-20T09:00:00.000Z' })]).changes).toEqual([]);
  });

  it('AC-33: the first sync after connecting lists every item as new', () => {
    expect(syncChanges('jira', null, [issue('PROJ-1')]).changes.map((change) => change.kind)).toEqual(['new']);
  });

  it('AC-16: keeps the first 50 changes and counts the rest', () => {
    const after = Array.from({ length: 90 }, (_, index) => issue(`PROJ-${String(index + 1)}`));

    const found = syncChanges('jira', [], after);

    expect(found.changes).toHaveLength(50);
    expect(found.moreChanges).toBe(40);
  });

  it('leaves out a cached record from an older shape rather than calling it removed', () => {
    expect(syncChanges('jira', [{ key: 'PROJ-1' }], []).changes).toEqual([]);
  });
});
