import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { FilterMenu, type FilterMenuOption } from './filter-menu.tsx';

const statuses: FilterMenuOption[] = [
  { value: 'To Do', label: 'To Do' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Code Review', label: 'Code Review' },
];

function Status({ options = statuses }: { options?: FilterMenuOption[] }) {
  const [ticked, setTicked] = useState<string[]>([]);
  return (
    <>
      <FilterMenu label="Status" options={options} ticked={ticked} onTickedChange={setTicked} />
      <output>{ticked.join(', ')}</output>
    </>
  );
}

describe('FilterMenu', () => {
  it('AC-30, AC-31 (spec 020): ticks options in its menu, which stays open, and shows how many are ticked', async () => {
    const user = userEvent.setup();
    const { container } = render(<Status />);

    await user.click(screen.getByRole('button', { name: 'Status' }));
    const menu = screen.getByRole('menu', { name: 'Status' });
    expect(
      within(menu)
        .getAllByRole('menuitemcheckbox')
        .map((item) => item.textContent),
    ).toEqual(['To Do', 'In Progress', 'Code Review']);
    await user.click(within(menu).getByRole('menuitemcheckbox', { name: 'In Progress' }));
    await user.click(within(menu).getByRole('menuitemcheckbox', { name: 'Code Review' }));

    expect(within(menu).getByRole('menuitemcheckbox', { name: 'In Progress' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('In Progress, Code Review');
    await expectNoAxeViolations(container);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Status · 2' })).toHaveFocus();
  });

  it('unticks an option ticked before', async () => {
    const user = userEvent.setup();
    render(<Status />);
    await user.click(screen.getByRole('button', { name: 'Status' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'To Do' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'To Do' }));

    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('');
  });

  it('is disabled with nothing to offer', () => {
    render(<Status options={[]} />);
    expect(screen.getByRole('button', { name: 'Status' })).toBeDisabled();
  });

  it('with a search label, narrows the options by what you type and ticks them as checkboxes', async () => {
    const user = userEvent.setup();
    function Assignee() {
      const [ticked, setTicked] = useState<string[]>([]);
      return (
        <>
          <FilterMenu
            label="Assignee"
            options={[
              { value: 'me', label: 'Me' },
              { value: 'Priya Shah', label: 'Priya Shah' },
              { value: 'Sam Lee', label: 'Sam Lee' },
            ]}
            ticked={ticked}
            onTickedChange={setTicked}
            searchLabel="Search people"
            emptyText="No one matches"
          />
          <output>{ticked.join(', ')}</output>
        </>
      );
    }
    render(<Assignee />);
    await user.click(screen.getByRole('button', { name: 'Assignee' }));
    await user.keyboard('sam');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Sam Lee']);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('status', { hidden: true })).toHaveTextContent('Sam Lee');
    await user.keyboard('zzz');
    expect(screen.getByText('No one matches')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Assignee · 1' })).toHaveFocus();
  });
});
