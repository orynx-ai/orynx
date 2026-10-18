import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { SearchGroup, SearchResult, SearchResultSkeleton } from './search-result.tsx';
import { SessionStateIcon } from './session-item.tsx';
import { SourceMark } from './source-mark.tsx';

function Results({ onPick = () => undefined }: { onPick?: () => void }) {
  return (
    <div role="listbox" aria-label="Results">
      <SearchGroup label="Tickets · 6 of 23">
        <SearchResult
          id="ticket-PROJ-1423"
          active
          aria-label="PROJ-1423, Add bulk archive, In Progress"
          mark={<SourceMark source="jira" label="none" />}
          code="PROJ-1423"
          title="Add bulk archive"
          meta="In Progress"
          onClick={onPick}
        />
        <SearchResult
          id="ticket-PROJ-1377"
          aria-label="PROJ-1377, Search returns archived sites, To Do"
          mark={<SourceMark source="jira" label="none" />}
          code="PROJ-1377"
          title="Search returns archived sites"
          meta="To Do"
        />
      </SearchGroup>
      <SearchGroup label="Sessions">
        <SearchResult
          id="session-1"
          aria-label="Add bulk archive, PROJ-1423, Needs you"
          mark={<SessionStateIcon state="needs_you" />}
          code="PROJ-1423"
          title="Add bulk archive"
          meta="Needs you"
        />
      </SearchGroup>
    </div>
  );
}

describe('SearchResult', () => {
  it('AC-6, AC-9: each result is an option in its named group, with its key, title and meta, and no axe violations', async () => {
    const { container } = render(<Results />);

    const tickets = screen.getByRole('group', { name: 'Tickets · 6 of 23' });
    const options = within(tickets).getAllByRole('option');
    expect(options.map((option) => option.getAttribute('aria-label'))).toEqual([
      'PROJ-1423, Add bulk archive, In Progress',
      'PROJ-1377, Search returns archived sites, To Do',
    ]);
    const first = screen.getByRole('option', { name: 'PROJ-1423, Add bulk archive, In Progress' });
    expect(within(first).getByText('PROJ-1423')).toBeVisible();
    expect(within(first).getByText('Add bulk archive')).toHaveAttribute('title', 'Add bulk archive');
    expect(within(first).getByText('In Progress')).toBeVisible();
    expect(within(screen.getByRole('group', { name: 'Sessions' })).getByRole('option')).toBeVisible();
    await expectNoAxeViolations(container);
  });

  it('AC-11: marks the result the arrow keys are on as selected, and only that one', () => {
    render(<Results />);

    expect(screen.getByRole('option', { name: /PROJ-1423, Add bulk archive/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: /PROJ-1377/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('AC-12: a click picks it', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Results onPick={onPick} />);

    await user.click(screen.getByRole('option', { name: /PROJ-1423, Add bulk archive/ }));

    expect(onPick).toHaveBeenCalledOnce();
  });

  it('AC-23: a loading row holds a result’s place and is hidden from screen readers', () => {
    const { container } = render(
      <div aria-busy="true">
        <SearchResultSkeleton />
      </div>,
    );

    expect(container.querySelector('[aria-busy="true"] > [aria-hidden="true"]')).not.toBeNull();
  });
});
