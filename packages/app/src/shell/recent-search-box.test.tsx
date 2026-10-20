import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useRecentSearches } from '../stores/recent-searches.ts';
import { RecentSearchBox } from './recent-search-box.tsx';

function Box() {
  const [query, setQuery] = useState('');
  const field = useRef<HTMLInputElement>(null);
  return (
    <>
      <RecentSearchBox place="tickets" query={query} onPick={setQuery} fieldRef={field}>
        <input
          ref={field}
          aria-label="Search tickets"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </RecentSearchBox>
      <button type="button">Elsewhere</button>
    </>
  );
}

describe('RecentSearchBox (spec 039)', () => {
  it('AC-45: shows this box’s searches while its field is focused and empty, and only then', async () => {
    useRecentSearches.getState().remember('tickets', 'pagination');
    useRecentSearches.getState().remember('sessions', 'jira');
    const user = userEvent.setup();
    render(<Box />);
    expect(screen.queryByRole('group', { name: 'Recent searches' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('textbox', { name: 'Search tickets' }));
    expect(screen.getByRole('button', { name: 'Search for pagination' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Search for jira' })).not.toBeInTheDocument();

    await user.keyboard('p');
    expect(screen.queryByRole('group', { name: 'Recent searches' })).not.toBeInTheDocument();
    await user.keyboard('{Backspace}');
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('group', { name: 'Recent searches' })).not.toBeInTheDocument();
  });

  it('AC-22: ↓ reaches the first search, and picking it fills the field', async () => {
    useRecentSearches.getState().remember('tickets', 'pagination');
    const user = userEvent.setup();
    render(<Box />);
    await user.click(screen.getByRole('textbox', { name: 'Search tickets' }));

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Search for pagination' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('textbox', { name: 'Search tickets' })).toHaveValue('pagination');
  });
});
