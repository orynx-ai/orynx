import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { RecentSearches, type RecentSearchesHandle } from './recent-searches.tsx';

function Field({
  items = ['jira', 'terminal'],
  onPick = vi.fn(),
  onRemove = vi.fn(),
  onClear = vi.fn(),
}: {
  items?: string[];
  onPick?: (text: string) => void;
  onRemove?: (text: string) => void;
  onClear?: () => void;
}) {
  const recent = useRef<RecentSearchesHandle>(null);
  const field = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={field}
        aria-label="Search sessions"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') recent.current?.focusFirst();
        }}
      />
      <RecentSearches
        ref={recent}
        items={items}
        onPick={onPick}
        onRemove={onRemove}
        onClear={onClear}
        onLeave={() => field.current?.focus()}
      />
    </>
  );
}

describe('RecentSearches', () => {
  it('AC-21: lists the searches under its heading, newest first, and has no axe violations', async () => {
    const { container } = render(<Field />);

    const group = screen.getByRole('group', { name: 'Recent searches' });
    expect(group).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Search for/ }).map((button) => button.textContent)).toEqual([
      'jira',
      'terminal',
    ]);
    await expectNoAxeViolations(container);
  });

  it('AC-22: ↓ from the field reaches the first search, ↓ and ↑ move between them, Enter picks one', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Field onPick={onPick} />);
    await user.click(screen.getByRole('textbox', { name: 'Search sessions' }));

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Search for jira' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Search for terminal' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{Enter}');

    expect(onPick).toHaveBeenCalledWith('jira');
  });

  it('AC-22: ↑ on the first search goes back to the field', async () => {
    const user = userEvent.setup();
    render(<Field />);
    await user.click(screen.getByRole('textbox', { name: 'Search sessions' }));
    await user.keyboard('{ArrowDown}{ArrowUp}');
    expect(screen.getByRole('textbox', { name: 'Search sessions' })).toHaveFocus();
  });

  it('AC-23: a click picks, removes or clears without taking focus from the field', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onRemove = vi.fn();
    const onClear = vi.fn();
    render(<Field onPick={onPick} onRemove={onRemove} onClear={onClear} />);
    const field = screen.getByRole('textbox', { name: 'Search sessions' });
    await user.click(field);

    await user.click(screen.getByRole('button', { name: 'Remove “terminal” from recent searches' }));
    expect(onRemove).toHaveBeenCalledWith('terminal');
    expect(field).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Search for jira' }));
    expect(onPick).toHaveBeenCalledWith('jira');
    expect(field).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Clear recent searches' }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(field).toHaveFocus();
  });

  it('shows nothing when there are no searches', () => {
    render(<Field items={[]} />);
    expect(screen.queryByRole('group', { name: 'Recent searches' })).not.toBeInTheDocument();
  });
});
