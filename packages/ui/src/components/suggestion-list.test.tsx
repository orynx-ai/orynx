import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookOpen01Icon } from '@hugeicons/core-free-icons';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Icon } from './icon.tsx';
import { SuggestionList, type SuggestionOption } from './suggestion-list.tsx';

const options: SuggestionOption[] = [
  {
    id: 'skill-review',
    mark: <Icon icon={BookOpen01Icon} />,
    code: '/review',
    title: 'Review the branch',
    meta: 'web-app',
  },
  { id: 'skill-notes', mark: <Icon icon={BookOpen01Icon} />, code: '/notes', title: '', meta: 'Yours' },
];

function BoxWithList({ onPick }: { onPick: (id: string) => void }) {
  const [active] = useState('skill-review');
  return (
    <>
      <textarea
        aria-label="Describe a task for Claude"
        aria-autocomplete="list"
        aria-controls="skills"
        aria-activedescendant={active}
      />
      <SuggestionList listId="skills" label="Skills" options={options} activeId={active} onPick={onPick} />
    </>
  );
}

describe('SuggestionList (spec 022)', () => {
  it('AC-49: lists each option by what’s typed, what it does and where it’s from, with the active one selected', async () => {
    const { container } = render(<BoxWithList onPick={vi.fn()} />);
    const list = screen.getByRole('listbox', { name: 'Skills' });
    const rows = within(list).getAllByRole('option');
    expect(rows.map((row) => row.textContent)).toEqual(['/review, Review the branch, web-app', '/notes, , Yours']);
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
    expect(rows[1]).toHaveAttribute('aria-selected', 'false');
    await expectNoAxeViolations(container);
  });

  it('AC-51: a press picks a row and leaves focus in the box', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<BoxWithList onPick={onPick} />);
    const box = screen.getByRole('textbox', { name: 'Describe a task for Claude' });
    await user.click(box);

    await user.click(screen.getByRole('option', { name: /\/notes/ }));

    expect(onPick).toHaveBeenCalledWith('skill-notes');
    expect(box).toHaveFocus();
  });

  it('AC-55, AC-56: shows rows the size of real ones while loading, and one line when there’s nothing', async () => {
    const { container, rerender } = render(
      <SuggestionList listId="skills" label="Skills" options={[]} activeId={null} onPick={vi.fn()} loading />,
    );
    expect(screen.getByRole('listbox', { name: 'Skills' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryAllByRole('option')).toEqual([]);

    rerender(
      <SuggestionList
        listId="skills"
        label="Skills"
        options={[]}
        activeId={null}
        onPick={vi.fn()}
        notice="No skills in web-app or in ~/.claude."
      />,
    );
    expect(screen.getByText('No skills in web-app or in ~/.claude.')).toBeVisible();
    await expectNoAxeViolations(container);
  });
});
