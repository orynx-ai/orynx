import { describe, expect, it } from 'vitest';
import { makeSessionSummary } from '@devhub/contracts/testing';
import {
  hasSessionFilters,
  matchesSession,
  noSessionFilters,
  searchFromSessionFilters,
  sessionFiltersFromSearch,
  SessionsSearchSchema,
} from './session-filters.ts';

describe('the Sessions page’s filters (spec 039)', () => {
  it('AC-19: reads the address, keeping only known values, and writes back only what differs', () => {
    const filters = sessionFiltersFromSearch(
      SessionsSearchSchema.parse({ q: 'jira', status: 'done,gone,stopped', kind: 'ask' }),
    );
    expect(filters).toEqual({ q: 'jira', status: ['done', 'stopped'], kind: ['ask'] });
    expect(searchFromSessionFilters(filters)).toEqual({ q: 'jira', status: 'done,stopped', kind: 'ask' });
    expect(searchFromSessionFilters(noSessionFilters)).toEqual({});
    expect(hasSessionFilters(noSessionFilters)).toBe(false);
    expect(hasSessionFilters({ ...noSessionFilters, q: '   ' })).toBe(false);
  });

  it('AC-18: matches the title, the ticket key or the pull request, in any case', () => {
    const ticket = makeSessionSummary({ title: 'Add bulk archive', source: { kind: 'jira', key: 'MAI-5337' } });
    const pull = makeSessionSummary({ title: 'Fix checks', source: { kind: 'pull_request', number: 2836 } });
    const match = (q: string, session = ticket) => matchesSession(session, { ...noSessionFilters, q });
    expect(match('BULK')).toBe(true);
    expect(match('mai-5337')).toBe(true);
    expect(match('pr #2836', pull)).toBe(true);
    expect(match('nothing')).toBe(false);
  });

  it('AC-19: Status and Kind narrow together; nothing ticked lets everything through', () => {
    const ask = makeSessionSummary({ state: 'done', mode: 'ask' });
    expect(matchesSession(ask, { ...noSessionFilters, status: ['done'], kind: ['ask'] })).toBe(true);
    expect(matchesSession(ask, { ...noSessionFilters, status: ['done'], kind: ['build'] })).toBe(false);
    expect(matchesSession(ask, { ...noSessionFilters, status: ['stopped'] })).toBe(false);
    expect(matchesSession(ask, noSessionFilters)).toBe(true);
  });
});
