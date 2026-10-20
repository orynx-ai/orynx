import { describe, expect, it } from 'vitest';
import type { InboxToolState } from '@devhub/contracts';
import { makeOrynxTicket, makeSessionSummary, makeTicket } from '@devhub/contracts/testing';
import type { PullRequestRecord } from '../integrations/github/map.ts';
import type { JiraIssueRecord } from '../integrations/jira/map.ts';
import { searchIndex, type SearchSources } from './search-service.ts';

const synced: InboxToolState = { state: 'synced', at: '2026-10-18T09:00:00.000Z' };

function assigned(key: string, overrides: Partial<JiraIssueRecord> = {}): JiraIssueRecord {
  return {
    key,
    summary: `Summary of ${key}`,
    status: 'To Do',
    category: 'to_do',
    highPriorityBug: false,
    dueDate: null,
    waitingSince: '2026-10-15T09:00:00.000Z',
    url: `https://your-team.atlassian.net/browse/${key}`,
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
    author: 'Priya Shah',
    mine: false,
    openedAt: '2026-10-10T09:00:00.000Z',
    reviewRequestedAt: '2026-10-15T10:00:00.000Z',
    checksFailedAt: null,
    unresolved: null,
    ...overrides,
  };
}

function index(sources: Partial<SearchSources>) {
  return searchIndex({
    assigned: [],
    sprint: [],
    pullRequests: [],
    sessions: [],
    tools: { jira: synced, github: synced },
    ...sources,
  });
}

describe('search index', () => {
  it('AC-21, AC-26: every Orynx ticket follows Jira’s, newest first, Done ones too, once each', () => {
    const found = index({
      sprint: [
        makeTicket({ key: 'PROJ-1423' }),
        // The board's row for ORX-1 has no link: search takes Orynx's own list instead.
        makeTicket({ key: 'ORX-1', url: null }),
      ],
      assigned: [assigned('PROJ-7')],
      orynx: [
        makeOrynxTicket({ key: 'ORX-1', title: 'Add bulk archive', status: 'to_do' }),
        makeOrynxTicket({
          key: 'ORX-6',
          title: 'Fix the date test',
          status: 'done',
          doneAt: '2026-09-01T09:00:00.000Z',
          session: { id: 's-6', state: 'done' },
        }),
      ],
    });

    expect(found.tickets.map((ticket) => [ticket.key, ticket.status, ticket.target])).toEqual([
      ['PROJ-1423', 'In Progress', { kind: 'external', url: 'https://your-team.atlassian.net/browse/PROJ-1423' }],
      ['PROJ-7', 'To Do', { kind: 'external', url: 'https://your-team.atlassian.net/browse/PROJ-7' }],
      ['ORX-6', 'Done', { kind: 'session', sessionId: 's-6' }],
      ['ORX-1', 'To do', { kind: 'ticket' }],
    ]);
  });

  it('AC-16: the sprint comes first in Jira’s rank order, then the other assigned issues by key, each ticket once', () => {
    const found = index({
      sprint: [
        makeTicket({ key: 'PROJ-1423', title: 'Add bulk archive', status: 'In Progress' }),
        makeTicket({ key: 'PROJ-1377', title: 'Search returns archived sites', status: 'To Do' }),
      ],
      assigned: [assigned('PROJ-1377'), assigned('PROJ-1500'), assigned('PS-3'), assigned('PROJ-7')],
    });

    expect(found.tickets.map((ticket) => [ticket.key, ticket.title, ticket.status])).toEqual([
      ['PROJ-1423', 'Add bulk archive', 'In Progress'],
      ['PROJ-1377', 'Search returns archived sites', 'To Do'],
      ['PROJ-7', 'Summary of PROJ-7', 'To Do'],
      ['PROJ-1500', 'Summary of PROJ-1500', 'To Do'],
      ['PS-3', 'Summary of PS-3', 'To Do'],
    ]);
  });

  it('AC-12: a ticket with no session opens in Jira', () => {
    const found = index({ sprint: [makeTicket({ key: 'PROJ-1423' })], assigned: [assigned('PROJ-7')] });

    expect(found.tickets.map((ticket) => ticket.target)).toEqual([
      { kind: 'external', url: 'https://your-team.atlassian.net/browse/PROJ-1423' },
      { kind: 'external', url: 'https://your-team.atlassian.net/browse/PROJ-7' },
    ]);
  });

  it('AC-13: a ticket opens its newest session, unless that one was stopped, in the sprint or not', () => {
    const found = index({
      sprint: [makeTicket({ key: 'PROJ-1423' })],
      assigned: [assigned('PROJ-7'), assigned('PROJ-8')],
      sessions: [
        makeSessionSummary({
          id: 'old',
          source: { kind: 'jira', key: 'PROJ-1423' },
          updatedAt: '2026-10-16T09:00:00.000Z',
        }),
        makeSessionSummary({
          id: 'new',
          source: { kind: 'jira', key: 'PROJ-1423' },
          updatedAt: '2026-10-17T09:00:00.000Z',
        }),
        makeSessionSummary({ id: 's7', state: 'needs_you', source: { kind: 'jira', key: 'PROJ-7' } }),
        makeSessionSummary({ id: 's8', state: 'stopped', source: { kind: 'jira', key: 'PROJ-8' } }),
      ],
    });

    expect(found.tickets.map((ticket) => [ticket.key, ticket.target])).toEqual([
      ['PROJ-1423', { kind: 'session', sessionId: 'new' }],
      ['PROJ-7', { kind: 'session', sessionId: 's7' }],
      ['PROJ-8', { kind: 'external', url: 'https://your-team.atlassian.net/browse/PROJ-8' }],
    ]);
  });

  it('AC-14, AC-18: pull requests come newest first, yours and those waiting for you, each opening its main page', () => {
    const found = index({
      pullRequests: [
        pull(2836, { mine: true, reviewRequestedAt: null, openedAt: '2026-10-12T09:00:00.000Z' }),
        pull(2841, { openedAt: '2026-10-16T09:00:00.000Z', author: null }),
        pull(2790, { openedAt: null }),
        pull(2850, { mine: true, reviewRequestedAt: null, openedAt: '2026-10-17T09:00:00.000Z' }),
      ],
    });

    expect(found.pullRequests.map((request) => request.number)).toEqual([2850, 2841, 2836, 2790]);
    expect(found.pullRequests[1]).toEqual({
      id: 'acme/web-app#2841',
      repository: 'web-app',
      number: 2841,
      title: 'Pull request 2841',
      author: null,
      url: 'https://github.com/acme/web-app/pull/2841',
    });
  });

  it('AC-9: every session comes, newest first, stopped ones too', () => {
    const found = index({
      sessions: [
        makeSessionSummary({ id: 'a', state: 'stopped', updatedAt: '2026-10-16T09:00:00.000Z' }),
        makeSessionSummary({ id: 'b', state: 'needs_you', updatedAt: '2026-10-17T09:00:00.000Z' }),
        makeSessionSummary({ id: 'c', state: 'done', updatedAt: '2026-10-15T09:00:00.000Z' }),
      ],
    });

    expect(found.sessions.map((session) => [session.id, session.state])).toEqual([
      ['b', 'needs_you'],
      ['a', 'stopped'],
      ['c', 'done'],
    ]);
  });

  it('AC-22, AC-24: says where each tool stands', () => {
    const tools = { jira: { state: 'syncing' }, github: { state: 'not_connected' } } as const;

    expect(index({ tools }).tools).toEqual(tools);
  });
});
