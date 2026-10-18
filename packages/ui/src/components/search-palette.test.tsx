import { useState } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { SearchPalette, type SearchPaletteGroup } from './search-palette.tsx';
import { SourceMark } from './source-mark.tsx';

const label = 'Search tickets, pull requests and sessions';

function ticket(key: string, title: string) {
  return {
    id: `ticket:${key}`,
    label: `${key}, ${title}, To Do`,
    mark: <SourceMark source="jira" label="none" />,
    code: key,
    title,
    meta: 'To Do',
  };
}

const everything: SearchPaletteGroup[] = [
  {
    id: 'tickets',
    label: 'Tickets',
    items: [ticket('PROJ-1423', 'Add bulk archive'), ticket('PROJ-1377', 'Fix archive search')],
  },
  {
    id: 'pull-requests',
    label: 'Pull requests',
    items: [
      {
        id: 'pull:acme/web-app/2841',
        label: 'web-app #2841, Lazy-load the people directory, Priya Shah',
        mark: <SourceMark source="github" label="none" />,
        code: 'web-app #2841',
        title: 'Lazy-load the people directory',
        meta: 'Priya Shah',
      },
    ],
  },
];

/** Search as an app uses it: the text is the caller's, and it narrows the groups as the person types. */
function Search({
  groups = everything,
  onPick = () => undefined,
  status,
  note,
}: {
  groups?: SearchPaletteGroup[];
  onPick?: (id: string) => void;
  status?: string;
  note?: string;
}) {
  const [query, setQuery] = useState('');
  const shown =
    query === ''
      ? []
      : groups
          .map((group) => ({
            ...group,
            items: group.items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
          }))
          .filter((group) => group.items.length > 0);
  return (
    <SearchPalette
      label={label}
      query={query}
      onQueryChange={setQuery}
      groups={shown}
      onPick={onPick}
      status={status}
      note={note}
    >
      <p>Find a ticket by key or title, a pull request by number or repository, or a session.</p>
    </SearchPalette>
  );
}

function box() {
  return screen.getByRole('combobox', { name: label });
}

function active() {
  const id = box().getAttribute('aria-activedescendant');
  return id === null ? null : document.getElementById(id);
}

describe('SearchPalette', () => {
  it('AC-1, AC-5: the search box is named, shows its placeholder, and before typing shows the hint and no results', () => {
    render(<Search />);

    expect(box()).toHaveAttribute('placeholder', label);
    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/Find a ticket by key or title/)).toBeVisible();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('AC-6: as I type, results show in their groups and the first one is active, with no axe violations', async () => {
    const user = userEvent.setup();
    const { container } = render(<Search />);

    await user.type(box(), 'archive');

    const results = screen.getByRole('listbox', { name: label });
    expect(within(results).getByRole('group', { name: 'Tickets' })).toBeVisible();
    expect(
      within(results)
        .getAllByRole('option')
        .map((option) => option.getAttribute('aria-label')),
    ).toEqual(['PROJ-1423, Add bulk archive, To Do', 'PROJ-1377, Fix archive search, To Do']);
    expect(box()).toHaveAttribute('aria-expanded', 'true');
    expect(active()).toHaveAccessibleName('PROJ-1423, Add bulk archive, To Do');
    expect(active()).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText(/Find a ticket by key or title/)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('AC-11: ↓ and ↑ move the active result across groups and stop at the ends, with focus kept in the box', async () => {
    const user = userEvent.setup();
    render(<Search />);
    await user.type(box(), 'a');

    await user.keyboard('{ArrowDown}');
    expect(active()).toHaveAccessibleName('PROJ-1377, Fix archive search, To Do');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(active()).toHaveAccessibleName('web-app #2841, Lazy-load the people directory, Priya Shah');
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(active()).toHaveAccessibleName('PROJ-1423, Add bulk archive, To Do');
    expect(box()).toHaveFocus();
    expect(screen.getAllByRole('option', { selected: true })).toHaveLength(1);
  });

  it('AC-12: Enter picks the active result, and so does a click', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Search onPick={onPick} />);
    await user.type(box(), 'a');

    await user.keyboard('{ArrowDown}{Enter}');
    await user.click(screen.getByRole('option', { name: /web-app #2841/ }));

    expect(onPick.mock.calls).toEqual([['ticket:PROJ-1377'], ['pull:acme/web-app/2841']]);
    expect(box()).toHaveFocus();
  });

  it('AC-12: Enter with nothing to pick does nothing', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Search onPick={onPick} />);

    await user.type(box(), 'nothing like this{Enter}');

    expect(onPick).not.toHaveBeenCalled();
  });

  it('AC-26: when the results change, the active one stays while it’s there, else the first is active', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Search />);
    await user.type(box(), 'a');
    await user.keyboard('{ArrowDown}');
    expect(active()).toHaveAccessibleName('PROJ-1377, Fix archive search, To Do');

    const [tickets, pulls] = everything;
    if (tickets === undefined || pulls === undefined) throw new Error('No groups');
    const newTicket = ticket('PROJ-1500', 'Archive old sites');
    rerender(<Search groups={[{ ...tickets, items: [newTicket, ...tickets.items] }, pulls]} />);
    expect(active()).toHaveAccessibleName('PROJ-1377, Fix archive search, To Do');

    rerender(<Search groups={[{ ...tickets, items: [newTicket] }, pulls]} />);
    expect(active()).toHaveAccessibleName('PROJ-1500, Archive old sites, To Do');
  });

  it('AC-10: a screen reader hears the count once typing pauses', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<Search status="2 results" />);
      const region = screen.getByRole('status');
      expect(region).toHaveTextContent('');

      rerender(<Search status="1 result" />);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(region).toHaveTextContent('');
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(region).toHaveTextContent('1 result');
    } finally {
      vi.useRealTimers();
    }
  });

  it('AC-24: a quiet note can follow the results', async () => {
    const user = userEvent.setup();
    render(<Search note="Jira is still syncing. Its tickets appear when it ends." />);

    await user.type(box(), 'web');

    expect(screen.getByText('Jira is still syncing. Its tickets appear when it ends.')).toBeVisible();
  });
});
