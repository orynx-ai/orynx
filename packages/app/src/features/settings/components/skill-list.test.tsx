import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeOrynxSkill } from '@devhub/contracts/testing';
import { SkillList } from './skill-list.tsx';

const skills = [
  makeOrynxSkill(),
  makeOrynxSkill({ folder: 'how-we-review', title: 'How we review', description: 'Correctness, tests, then nits.' }),
  makeOrynxSkill({ folder: 'write-tests-first', title: 'Write tests first', description: 'Before changing any code.' }),
  { state: 'unreadable' as const, folder: 'broken' },
];

function names() {
  return within(screen.getByRole('list', { name: 'Your skills' }))
    .getAllByRole('button')
    .map((item) => item.textContent);
}

describe('SkillList', () => {
  it("AC-2, AC-17: lists each skill's Name and when to use it, and a folder Orynx can't read as such", () => {
    render(<SkillList skills={skills} current="bug-bash" onPick={() => undefined} />);

    const list = screen.getByRole('list', { name: 'Your skills' });
    expect(within(list).getByRole('button', { name: 'Bug bash' })).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('button', { name: 'How we review' })).toHaveAccessibleDescription(
      'Not used yet Correctness, tests, then nits.',
    );
    expect(within(list).getByRole('button', { name: 'broken' })).toHaveAccessibleDescription(
      "Orynx can't read this skill.",
    );
  });

  it('AC-3: says which skill was picked', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<SkillList skills={skills} current="bug-bash" onPick={onPick} />);

    await user.click(screen.getByRole('button', { name: 'How we review' }));

    expect(onPick).toHaveBeenCalledWith('how-we-review');
  });

  it('AC-4: keeps the skills whose Name or when to use it holds what you type, in any case', async () => {
    const user = userEvent.setup();
    render(<SkillList skills={skills} current="bug-bash" onPick={() => undefined} />);

    await user.type(screen.getByRole('searchbox', { name: 'Search skills' }), 'REV');
    expect(names()).toEqual(['How we review']);

    await user.clear(screen.getByRole('searchbox', { name: 'Search skills' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search skills' }), 'before');
    expect(names()).toEqual(['Write tests first']);

    await user.clear(screen.getByRole('searchbox', { name: 'Search skills' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search skills' }), 'brok');
    expect(names()).toEqual(['broken']);
  });

  it('AC-4: says when nothing matches', async () => {
    const user = userEvent.setup();
    render(<SkillList skills={skills} current="bug-bash" onPick={() => undefined} />);

    await user.type(screen.getByRole('searchbox', { name: 'Search skills' }), 'rev zzz');

    expect(screen.getByText('No skills match “rev zzz”.')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Your skills' })).not.toBeInTheDocument();
  });

  it('AC-24: tags each skill with how many sessions used it, or Not used yet', () => {
    render(
      <SkillList
        skills={[
          makeOrynxSkill({ uses: 4 }),
          makeOrynxSkill({ folder: 'how-we-review', title: 'How we review', uses: 1 }),
          makeOrynxSkill({ folder: 'write-tests-first', title: 'Write tests first', uses: 0 }),
        ]}
        current="bug-bash"
        onPick={() => undefined}
      />,
    );

    expect(screen.getByText('Used 4 times')).toBeVisible();
    expect(screen.getByRole('button', { name: 'How we review' })).toHaveAccessibleDescription(
      `Used 1 time ${makeOrynxSkill().description}`,
    );
    expect(screen.getByRole('button', { name: 'Write tests first' })).toHaveAccessibleDescription(
      `Not used yet ${makeOrynxSkill().description}`,
    );
  });
});
