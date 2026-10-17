import { describe, expect, it } from 'vitest';
import { defaultPreferences, type InboxRules } from '@devhub/contracts';
import { makeSessionSummary } from '@devhub/contracts/testing';
import type { PullRequestRecord } from '../integrations/github/map.ts';
import type { JiraIssueRecord } from '../integrations/jira/map.ts';
import { inboxItems, type InboxSources } from './rules.ts';

function issue(overrides: Partial<JiraIssueRecord> = {}): JiraIssueRecord {
  return {
    key: 'PROJ-1423',
    summary: 'Add bulk archive to the content list',
    status: 'In progress',
    category: 'in_progress',
    highPriorityBug: false,
    dueDate: null,
    waitingSince: '2026-10-15T09:00:00.000Z',
    url: 'https://your-team.atlassian.net/browse/PROJ-1423',
    ...overrides,
  };
}

function pull(overrides: Partial<PullRequestRecord> = {}): PullRequestRecord {
  return {
    id: 'acme/web-app#2841',
    repository: 'web-app',
    number: 2841,
    title: 'Lazy-load the people directory',
    url: 'https://github.com/acme/web-app/pull/2841',
    author: 'Priya Sharma',
    mine: false,
    reviewRequestedAt: '2026-10-15T10:00:00.000Z',
    checksFailedAt: null,
    unresolved: null,
    ...overrides,
  };
}

const mine = (overrides: Partial<PullRequestRecord> = {}) =>
  pull({
    id: 'acme/web-app#2836',
    number: 2836,
    title: 'Fix timezone shift in event cards',
    url: 'https://github.com/acme/web-app/pull/2836',
    author: 'The Octocat',
    mine: true,
    reviewRequestedAt: null,
    ...overrides,
  });

function items(sources: Partial<InboxSources>, rules: Partial<InboxRules> = {}) {
  return inboxItems({ jira: [], github: [], sessions: [], ...sources }, { ...defaultPreferences.inboxRules, ...rules });
}

describe('inbox rules', () => {
  it('AC-1: puts Jira and GitHub rows in one list, longest wait first', () => {
    const rows = items({
      jira: [
        issue({
          key: 'PROJ-1',
          waitingSince: '2026-10-16T09:00:00.000Z',
          url: 'https://x.atlassian.net/browse/PROJ-1',
        }),
      ],
      github: [
        pull({ reviewRequestedAt: '2026-10-14T09:00:00.000Z' }),
        mine({ checksFailedAt: '2026-10-17T07:00:00.000Z' }),
      ],
    });

    expect(rows.map((row) => row.id)).toEqual(['github:acme/web-app#2841', 'jira:PROJ-1', 'github:acme/web-app#2836']);
  });

  it('AC-2: an assigned issue opens in Jira and counts under Jira', () => {
    expect(items({ jira: [issue()] })).toEqual([
      {
        id: 'jira:PROJ-1423',
        source: 'jira',
        tab: 'jira',
        title: 'Add bulk archive to the content list',
        subject: { kind: 'issue', key: 'PROJ-1423', status: 'In progress', highPriorityBug: false },
        reason: { kind: 'status', category: 'in_progress' },
        waitingSince: '2026-10-15T09:00:00.000Z',
        target: { kind: 'external', url: 'https://your-team.atlassian.net/browse/PROJ-1423' },
      },
    ]);
  });

  it('AC-5: an issue’s reason is its due date, else being a high-priority bug, else its status category (Q2e)', () => {
    const rows = items({
      jira: [
        issue({
          key: 'PROJ-1',
          dueDate: '2026-10-19',
          highPriorityBug: true,
          waitingSince: '2026-10-10T00:00:00.000Z',
        }),
        issue({ key: 'PROJ-2', highPriorityBug: true, waitingSince: '2026-10-11T00:00:00.000Z' }),
        issue({ key: 'PROJ-3', category: 'to_do', waitingSince: '2026-10-12T00:00:00.000Z' }),
      ],
    });

    expect(rows.map((row) => row.reason)).toEqual([
      { kind: 'due', on: '2026-10-19', highPriorityBug: true },
      { kind: 'bug' },
      { kind: 'status', category: 'to_do' },
    ]);
  });

  it('AC-6: a review request opens the Files tab, by the wait since your review was asked for', () => {
    const [row] = items({ github: [pull()] });

    expect(row).toEqual({
      id: 'github:acme/web-app#2841',
      source: 'github',
      tab: 'pull_requests',
      title: 'Lazy-load the people directory',
      subject: { kind: 'pull_request', repository: 'web-app', number: 2841, author: 'Priya Sharma', mine: false },
      reason: { kind: 'review_requested' },
      waitingSince: '2026-10-15T10:00:00.000Z',
      target: { kind: 'external', url: 'https://github.com/acme/web-app/pull/2841/files' },
    });
  });

  it('AC-9: failing checks open the Checks tab', () => {
    const [row] = items({ github: [mine({ checksFailedAt: '2026-10-17T07:00:00.000Z' })] });

    expect(row).toMatchObject({
      reason: { kind: 'checks_failing' },
      waitingSince: '2026-10-17T07:00:00.000Z',
      subject: { mine: true },
      target: { kind: 'external', url: 'https://github.com/acme/web-app/pull/2836/checks' },
    });
  });

  it('AC-10: unresolved comments open the pull request, with how many', () => {
    const [row] = items({ github: [mine({ unresolved: { count: 2, since: '2026-10-16T08:00:00.000Z' } })] });

    expect(row).toMatchObject({
      reason: { kind: 'unresolved_comments', count: 2 },
      waitingSince: '2026-10-16T08:00:00.000Z',
      target: { kind: 'external', url: 'https://github.com/acme/web-app/pull/2836' },
    });
  });

  it('AC-11: a pull request with failing checks and unresolved comments is one row, as failing checks (Q4)', () => {
    const both = mine({
      checksFailedAt: '2026-10-17T07:00:00.000Z',
      unresolved: { count: 2, since: '2026-10-16T08:00:00.000Z' },
    });

    expect(items({ github: [both] }).map((row) => row.reason.kind)).toEqual(['checks_failing']);
    expect(items({ github: [both] }, { checks_failing: false }).map((row) => row.reason.kind)).toEqual([
      'unresolved_comments',
    ]);
  });

  it('AC-12: a waiting session on an assigned ticket takes over its row and opens the session (Q4)', () => {
    const session = makeSessionSummary({
      id: 'session-7',
      state: 'needs_you',
      source: { kind: 'jira', key: 'PROJ-1423' },
      updatedAt: '2026-10-17T09:55:00.000Z',
    });

    expect(items({ jira: [issue()], sessions: [session] })).toEqual([
      {
        id: 'jira:PROJ-1423',
        source: 'jira',
        tab: 'jira',
        title: 'Add bulk archive to the content list',
        subject: { kind: 'issue', key: 'PROJ-1423', status: 'In progress', highPriorityBug: false },
        reason: { kind: 'approval' },
        waitingSince: '2026-10-17T09:55:00.000Z',
        target: { kind: 'session', sessionId: 'session-7' },
      },
    ]);
  });

  it('AC-12: a waiting session with no row to take over gets its own, in its ticket’s or pull request’s tab', () => {
    const rows = items({
      sessions: [
        makeSessionSummary({
          id: 's1',
          title: 'Add bulk archive',
          state: 'needs_you',
          source: { kind: 'jira', key: 'PROJ-9' },
        }),
        makeSessionSummary({ id: 's2', state: 'needs_you', source: { kind: 'pull_request', number: 2836 } }),
        makeSessionSummary({ id: 's3', state: 'needs_you', source: null }),
        makeSessionSummary({ id: 's4', state: 'working' }),
      ],
    });

    expect(rows.map((row) => [row.id, row.source, row.tab, row.title, row.subject])).toEqual([
      ['session:s1', 'jira', 'jira', 'Add bulk archive', { kind: 'session', source: { kind: 'jira', key: 'PROJ-9' } }],
      [
        'session:s2',
        'github',
        'pull_requests',
        'Add bulk archive',
        { kind: 'session', source: { kind: 'pull_request', number: 2836 } },
      ],
      ['session:s3', null, null, 'Add bulk archive', { kind: 'session', source: null }],
    ]);
  });

  it('AC-15: each rule that is off takes its rows away, and nothing else', () => {
    const sources = {
      jira: [issue()],
      github: [
        pull(),
        mine({ checksFailedAt: '2026-10-17T07:00:00.000Z' }),
        mine({ id: 'acme/api#977', number: 977, unresolved: { count: 1, since: '2026-10-16T08:00:00.000Z' } }),
      ],
      sessions: [makeSessionSummary({ id: 's9', state: 'needs_you', source: null })],
    };
    const kinds = (rules: Partial<InboxRules>) =>
      items(sources, rules)
        .map((row) => row.reason.kind)
        .sort();

    expect(kinds({})).toEqual(['approval', 'checks_failing', 'review_requested', 'status', 'unresolved_comments']);
    expect(kinds({ jira_assigned: false })).not.toContain('status');
    expect(kinds({ review_requested: false })).not.toContain('review_requested');
    expect(kinds({ checks_failing: false })).not.toContain('checks_failing');
    expect(kinds({ unresolved_comments: false })).not.toContain('unresolved_comments');
    expect(kinds({ session_waiting: false })).not.toContain('approval');
    expect(
      kinds({
        jira_assigned: false,
        review_requested: false,
        checks_failing: false,
        unresolved_comments: false,
        session_waiting: false,
      }),
    ).toEqual([]);
  });
});
