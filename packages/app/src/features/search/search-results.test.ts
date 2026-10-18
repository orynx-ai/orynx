import { describe, expect, it } from 'vitest';
import type { SearchIndex } from '@devhub/contracts';
import {
  makeSearchIndex,
  makeSearchPullRequest,
  makeSearchTicket,
  makeSessionSummary,
} from '@devhub/contracts/testing';
import { hitText, resultCount, searchResults } from './search-results.ts';

const index: SearchIndex = makeSearchIndex({
  tickets: [
    makeSearchTicket({ key: 'PROJ-1500', title: 'Follow up on 1423 feedback', status: 'To Do' }),
    makeSearchTicket({ key: 'PROJ-1423', title: 'Add bulk archive', status: 'In Progress' }),
  ],
  pullRequests: [
    makeSearchPullRequest(),
    makeSearchPullRequest({
      id: 'acme/api/977',
      repository: 'api',
      number: 977,
      title: 'Speed up archive',
      author: null,
    }),
  ],
  sessions: [
    makeSessionSummary({
      id: 's1',
      title: 'Add bulk archive',
      state: 'needs_you',
      source: { kind: 'jira', key: 'PROJ-1423' },
    }),
    makeSessionSummary({
      id: 's2',
      title: 'Tidy tests',
      state: 'working',
      source: { kind: 'pull_request', number: 2836 },
    }),
  ],
});

/** "#2841", written so the style gate doesn't read it as a colour. */
const hash = (number: number) => `#${String(number)}`;
const lazyId = `pull:${makeSearchPullRequest().id}`;

/** Each group's kind and the ids of what it shows. */
function found(query: string, from: SearchIndex = index) {
  return searchResults(from, query).map((group) => [group.kind, group.hits.map((hit) => hit.id)]);
}

describe('search results', () => {
  it('AC-5, AC-21: nothing typed, or nothing found, gives no groups', () => {
    expect(found('')).toEqual([]);
    expect(found('PROJ-9999')).toEqual([]);
  });

  it('AC-6: finds a ticket by words of its title, in any case', () => {
    expect(found('ARCHIVE bulk')).toEqual([
      ['tickets', ['ticket:PROJ-1423']],
      ['sessions', ['session:s1']],
    ]);
  });

  it('AC-6: finds a ticket by its status', () => {
    expect(found('in progress')).toEqual([['tickets', ['ticket:PROJ-1423']]]);
  });

  it('AC-7: an exact key comes first in its group, ahead of titles that mention it', () => {
    expect(found('proj-1423')[0]).toEqual(['tickets', ['ticket:PROJ-1423']]);
    expect(found('1423')[0]).toEqual(['tickets', ['ticket:PROJ-1500', 'ticket:PROJ-1423']]);
  });

  it('AC-8: finds a pull request by its number, with or without #, its repository and title, or its author', () => {
    for (const query of ['2841', hash(2841), 'web-app lazy', 'priya']) {
      expect(found(query), query).toEqual([['pull_requests', [lazyId]]]);
    }
  });

  it('AC-8: an exact number comes first among pull requests', () => {
    const many = makeSearchIndex({
      pullRequests: [
        makeSearchPullRequest({ id: 'acme/web-app/2841', number: 2841, title: 'Lazy-load the people directory' }),
        makeSearchPullRequest({ id: 'acme/web-app/12841', number: 12841, title: 'Another one' }),
        makeSearchPullRequest({ id: 'acme/web-app/284', number: 284, title: 'Old one' }),
      ],
    });

    // 2841 holds "#284" too; 12841 doesn't.
    expect(found(hash(284), many)).toEqual([['pull_requests', ['pull:acme/web-app/284', 'pull:acme/web-app/2841']]]);
  });

  it('AC-9: finds a session by its title, its ticket key or pull request number, and its state', () => {
    expect(found('needs you')).toEqual([['sessions', ['session:s1']]]);
    expect(found(hash(2836))).toEqual([['sessions', ['session:s2']]]);
    expect(found('tidy')).toEqual([['sessions', ['session:s2']]]);
  });

  it('AC-10: shows at most 6 of a group, says how many matched, and counts every match', () => {
    const lots = makeSearchIndex({
      tickets: Array.from({ length: 23 }, (_, n) =>
        makeSearchTicket({ key: `PROJ-${String(n + 1)}`, title: 'Archive it' }),
      ),
      pullRequests: [
        makeSearchPullRequest({ id: 'acme/a/1', number: 1, title: 'Archive alpha' }),
        makeSearchPullRequest({ id: 'acme/a/2', number: 2, title: 'Archive omega' }),
      ],
    });

    const [tickets, pulls] = searchResults(lots, 'archive');

    expect(tickets?.hits).toHaveLength(6);
    expect(tickets?.label).toBe('Tickets · 6 of 23');
    expect(pulls?.label).toBe('Pull requests');
    expect(resultCount(searchResults(lots, 'archive'))).toBe('25 results');
    expect(resultCount(searchResults(lots, 'omega'))).toBe('1 result');
    expect(resultCount(searchResults(lots, 'zzz'))).toBe('No results');
  });

  it('AC-11, AC-12, AC-14: writes each result’s key, title and quiet meta', () => {
    const [tickets, pulls, sessions] = searchResults(index, 'archive');

    expect(tickets?.hits.map(hitText)).toEqual([
      {
        code: 'PROJ-1423',
        codeEnd: null,
        title: 'Add bulk archive',
        meta: 'In Progress',
      },
    ]);
    expect(pulls?.hits.map(hitText)).toEqual([
      { code: 'api', codeEnd: hash(977), title: 'Speed up archive', meta: null },
    ]);
    expect(sessions?.hits.map(hitText)).toEqual([
      {
        code: 'PROJ-1423',
        codeEnd: null,
        title: 'Add bulk archive',
        meta: 'Needs you',
      },
    ]);
    expect(searchResults(index, 'tidy')[0]?.hits.map(hitText)).toEqual([
      { code: 'PR #2836', codeEnd: null, title: 'Tidy tests', meta: 'Working' },
    ]);
  });
});
