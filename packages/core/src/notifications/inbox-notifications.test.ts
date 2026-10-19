import { describe, expect, it } from 'vitest';
import type { PullRequestRecord } from '../integrations/github/map.ts';
import type { JiraIssueRecord } from '../integrations/jira/map.ts';
import { githubNotifications, jiraNotifications } from './inbox-notifications.ts';

const at = '2026-10-19T10:00:00.000Z';

function pull(overrides: Partial<PullRequestRecord> = {}): PullRequestRecord {
  return {
    id: 'acme/api#977',
    repository: 'api',
    number: 977,
    title: 'Rate-limit the export endpoint',
    url: 'https://github.com/acme/api/pull/977',
    author: 'Arjun Mehta',
    mine: false,
    openedAt: null,
    reviewRequestedAt: null,
    checksFailedAt: null,
    unresolved: null,
    ...overrides,
  };
}

function issue(overrides: Partial<JiraIssueRecord> = {}): JiraIssueRecord {
  return {
    key: 'PROJ-1450',
    summary: 'Archive old events',
    status: 'To Do',
    category: 'to_do',
    highPriorityBug: false,
    dueDate: null,
    waitingSince: '2026-10-18T10:00:00.000Z',
    url: 'https://acme.atlassian.net/browse/PROJ-1450',
    ...overrides,
  };
}

const pullRequest = {
  repository: 'api',
  number: 977,
  title: 'Rate-limit the export endpoint',
  url: 'https://github.com/acme/api/pull/977',
};

describe('the notifications a sync raises (spec 029)', () => {
  it('AC-22: a review asked of me that the last sync didn’t have raises one, naming the author', () => {
    const asked = pull({ reviewRequestedAt: '2026-10-19T09:58:00.000Z' });

    expect(githubNotifications([pull()], [asked])).toEqual([
      {
        id: 'review_requested:acme/api#977:2026-10-19T09:58:00.000Z',
        what: { kind: 'review_requested', pullRequest, by: 'Arjun Mehta' },
      },
    ]);
    expect(githubNotifications([], [asked])).toHaveLength(1);
  });

  it('AC-22: a review the last sync already had raises nothing; asked again, it raises one', () => {
    const asked = pull({ reviewRequestedAt: '2026-10-19T09:58:00.000Z' });

    expect(githubNotifications([asked], [asked])).toEqual([]);
    expect(githubNotifications([asked], [{ ...asked, reviewRequestedAt: '2026-10-19T09:59:00.000Z' }])).toHaveLength(1);
  });

  it('AC-22: checks that start failing on my pull request raise one; on someone else’s, none', () => {
    const mine = pull({ mine: true });
    const failing = { ...mine, checksFailedAt: '2026-10-19T09:50:00.000Z' };

    expect(githubNotifications([mine], [failing])).toEqual([
      { id: 'checks_failed:acme/api#977:2026-10-19T09:50:00.000Z', what: { kind: 'checks_failed', pullRequest } },
    ]);
    expect(githubNotifications([failing], [failing])).toEqual([]);
    expect(githubNotifications([pull()], [pull({ checksFailedAt: '2026-10-19T09:50:00.000Z' })])).toEqual([]);
  });

  it('AC-22: a ticket newly assigned to me raises one; one already there, none', () => {
    const ticket = {
      key: 'PROJ-1450',
      title: 'Archive old events',
      url: 'https://acme.atlassian.net/browse/PROJ-1450',
    };

    expect(jiraNotifications([], [issue()], at)).toEqual([
      { id: `jira_assigned:PROJ-1450:${at}`, what: { kind: 'jira_assigned', ticket } },
    ]);
    expect(jiraNotifications([issue()], [issue({ status: 'In Progress' })], at)).toEqual([]);
  });
});
