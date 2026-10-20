import { describe, expect, it } from 'vitest';
import { useRecentSearches } from './recent-searches.ts';

const lists = () => useRecentSearches.getState().lists;

describe('recent searches (spec 039)', () => {
  it('AC-21: keeps each box’s last 5, newest first, each once whatever its case', () => {
    const { remember } = useRecentSearches.getState();
    for (const text of ['one', 'two', 'three', 'four', 'five', 'six']) remember('sessions', text);
    remember('sessions', '  TWO ');
    remember('sessions', '   ');

    expect(lists().sessions).toEqual(['TWO', 'six', 'five', 'four', 'three']);
    expect(lists().tickets).toEqual([]);
  });

  it('AC-23, AC-45: removes one or clears a box, leaving the other boxes alone', () => {
    const { remember, remove, clear } = useRecentSearches.getState();
    remember('sessions', 'jira');
    remember('sessions', 'terminal');
    remember('tickets', 'pagination');

    remove('sessions', 'jira');
    expect(lists().sessions).toEqual(['terminal']);
    clear('sessions');
    expect(lists()).toEqual({ sessions: [], search: [], tickets: ['pagination'] });
  });

  it('AC-23: is kept on this computer, so a reload keeps it', () => {
    useRecentSearches.getState().remember('search', 'MAI-5337');
    expect(JSON.parse(localStorage.getItem('devhub.recent-searches') ?? '{}')).toMatchObject({
      state: { lists: { search: ['MAI-5337'] } },
    });
  });
});
