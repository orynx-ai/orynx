import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { DatePicker } from './date-picker.tsx';
import { Field } from './field.tsx';

function Due({ initial = null, error }: { initial?: string | null; error?: string }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <>
      <Field label="Due date" {...(error === undefined ? {} : { error })}>
        <DatePicker value={value} onValueChange={setValue} placeholder="Pick a date" clearLabel="Clear date" />
      </Field>
      <output aria-label="Value">{value ?? 'none'}</output>
    </>
  );
}

const field = () => screen.getByRole('button', { name: 'Due date' });

describe('DatePicker', () => {
  it('AC-38: reads "Pick a date" under its label, and has no axe violations, closed or open', async () => {
    const user = userEvent.setup();
    const { container } = render(<Due />);

    expect(field()).toHaveAccessibleDescription('Pick a date');
    await expectNoAxeViolations(container);
    await user.click(field());
    const calendar = screen.getByRole('dialog', { name: 'Pick a date' });
    expect(calendar).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Clear date' })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
    await expectNoAxeViolations(calendar);
  });

  it('AC-38: opens on the picked day, focused; a click picks another, closes it and puts focus back on the field', async () => {
    const user = userEvent.setup();
    render(<Due initial="2026-10-24" />);
    expect(field()).toHaveAccessibleDescription('24 Oct 2026');

    await user.click(field());
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeVisible();
    expect(screen.getByRole('button', { name: /October 24th, 2026/ })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: /October 28th, 2026/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Value' })).toHaveTextContent('2026-10-28');
    expect(field()).toHaveAccessibleDescription('28 Oct 2026');
    expect(field()).toHaveFocus();
  });

  it('AC-38: by keyboard: Enter opens it, the arrows and Page Down move, Enter picks; Esc closes with nothing changed', async () => {
    const user = userEvent.setup();
    render(<Due initial="2026-10-24" />);

    field().focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowRight}{PageDown}{Enter}');
    expect(screen.getByRole('status', { name: 'Value' })).toHaveTextContent('2026-11-25');
    expect(field()).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowRight}{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Value' })).toHaveTextContent('2026-11-25');
    expect(field()).toHaveFocus();
  });

  it('AC-38: Clear date empties it', async () => {
    const user = userEvent.setup();
    render(<Due initial="2026-10-24" />);

    await user.click(field());
    await user.click(screen.getByRole('button', { name: 'Clear date' }));

    expect(screen.getByRole('status', { name: 'Value' })).toHaveTextContent('none');
    expect(field()).toHaveAccessibleDescription('Pick a date');
  });

  it('says what’s wrong under it, from its field', () => {
    render(<Due error="Pick a day after today." />);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAccessibleDescription('Pick a date Pick a day after today.');
  });
});
