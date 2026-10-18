import { describe, expect, it } from 'vitest';
import { apiRoutes, SearchIndexSchema, SearchPullRequestSchema, SearchTicketSchema } from './index.ts';
import { makeSearchIndex, makeSearchPullRequest, makeSearchTicket, makeSessionSummary } from './testing.ts';

describe('SearchIndexSchema', () => {
  it('AC-6, AC-8, AC-9: carries tickets, pull requests and sessions in the order the server put them, and each tool’s state', () => {
    const index = makeSearchIndex({
      tickets: [
        makeSearchTicket({ key: 'PROJ-1423', title: 'Add bulk archive', status: 'In Progress' }),
        makeSearchTicket({ key: 'PROJ-1377', title: 'Search returns archived sites for guest users', status: 'To Do' }),
      ],
      pullRequests: [makeSearchPullRequest()],
      sessions: [
        makeSessionSummary({ id: 'session-1', state: 'needs_you', source: { kind: 'jira', key: 'PROJ-1423' } }),
      ],
      tools: { jira: { state: 'syncing' }, github: { state: 'synced', at: '2026-10-18T09:00:00.000Z' } },
    });

    const parsed = SearchIndexSchema.parse(index);

    expect(parsed.tickets.map((ticket) => ticket.key)).toEqual(['PROJ-1423', 'PROJ-1377']);
    expect(parsed.pullRequests[0]).toMatchObject({ repository: 'web-app', number: 2841, author: 'Priya Shah' });
    expect(parsed.sessions[0]?.state).toBe('needs_you');
    expect(parsed.tools.jira).toEqual({ state: 'syncing' });
  });

  it('AC-22: with nothing connected and no sessions, it says so through each tool’s state', () => {
    const parsed = SearchIndexSchema.parse(
      makeSearchIndex({ tools: { jira: { state: 'not_connected' }, github: { state: 'not_connected' } } }),
    );

    expect(parsed).toEqual({
      tickets: [],
      pullRequests: [],
      sessions: [],
      tools: { jira: { state: 'not_connected' }, github: { state: 'not_connected' } },
    });
  });

  it('AC-13: a ticket with a session opens that session instead of Jira', () => {
    const ticket = makeSearchTicket({ target: { kind: 'session', sessionId: 'session-1' } });

    expect(SearchTicketSchema.parse(ticket).target).toEqual({ kind: 'session', sessionId: 'session-1' });
  });

  it('AC-12, AC-14: a ticket links only to its Jira site and a pull request only to github.com, both over https', () => {
    const ticketLink = (url: string) =>
      SearchTicketSchema.safeParse({ ...makeSearchTicket(), target: { kind: 'external', url } }).success;
    const pullLink = (url: string) => SearchPullRequestSchema.safeParse({ ...makeSearchPullRequest(), url }).success;

    expect(ticketLink('https://your-team.atlassian.net/browse/PROJ-1423')).toBe(true);
    expect(pullLink('https://github.com/acme/web-app/pull/2841')).toBe(true);
    for (const url of [
      'javascript:alert(1)',
      'http://your-team.atlassian.net/browse/PROJ-1423',
      'https://github.com/acme/web-app/pull/2841',
      'https://atlassian.net.evil.example/browse/PROJ-1',
    ]) {
      expect(ticketLink(url), url).toBe(false);
    }
    for (const url of [
      'javascript:alert(1)',
      'http://github.com/acme/web-app/pull/2841',
      'https://your-team.atlassian.net/browse/PROJ-1423',
      'https://github.com.evil.example/pull/1',
    ]) {
      expect(pullLink(url), url).toBe(false);
    }
  });

  it('AC-8: a pull request may have no author, when GitHub names nobody', () => {
    expect(SearchPullRequestSchema.parse(makeSearchPullRequest({ author: null })).author).toBeNull();
  });

  it('is served at GET /api/search', () => {
    expect(apiRoutes.search).toBe('/api/search');
  });
});
