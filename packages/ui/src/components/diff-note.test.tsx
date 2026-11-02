import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Avatar } from './avatar.tsx';
import { Button } from './button.tsx';
import { CheckboxBox } from './checkbox.tsx';
import { DiffNote } from './diff-note.tsx';

describe('DiffNote (spec 050)', () => {
  it("AC-8: a reviewer's note reads as an article with its author, when, words and footer", () => {
    render(
      <DiffNote
        aria-label="Priya Shah on line 14"
        mark={<Avatar initials="PS" />}
        author="Priya Shah"
        meta="reviewed · 5 days ago"
        footer="Fixed by Claude: moved the defaults into useMemo."
        footerTone="success"
      >
        useState here makes the whole form re-render on every keystroke.
      </DiffNote>,
    );
    const note = screen.getByRole('article', { name: 'Priya Shah on line 14' });
    expect(note).toHaveTextContent('Priya Shah reviewed · 5 days ago');
    expect(note).toHaveTextContent('useState here makes the whole form re-render on every keystroke.');
    expect(note).toHaveTextContent('Fixed by Claude: moved the defaults into useMemo.');
  });

  it("AC-12: Claude's draft carries its controls in the footer, and a dropped one still reaches them", async () => {
    const edit = vi.fn();
    render(
      <DiffNote
        aria-label="Claude on line 42"
        mark={<Avatar initials="C" />}
        author="Claude"
        muted
        footer={
          <>
            <CheckboxBox id="keep-c1" />
            <label htmlFor="keep-c1">Keep</label>
            <Button variant="ghost" size="sm" onClick={edit}>
              Edit
            </Button>
          </>
        }
      >
        This drops the error from save().
      </DiffNote>,
    );
    const note = screen.getByRole('article', { name: 'Claude on line 42' });
    expect(note).toHaveTextContent('This drops the error from save().');
    await expectNoAxeViolations(note);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Keep' }));
    expect(screen.getByRole('checkbox', { name: 'Keep' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(edit).toHaveBeenCalledOnce();
  });

  it('has no footer when it is given none', () => {
    render(
      <DiffNote aria-label="Claude on line 1" mark={null} author="Claude">
        Fine.
      </DiffNote>,
    );
    expect(screen.getByRole('article', { name: 'Claude on line 1' }).children).toHaveLength(1);
  });
});
