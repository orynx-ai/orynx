import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Calendar } from './calendar.tsx';

function Pick({ initial }: { initial?: Date }) {
  const [day, setDay] = useState<Date | undefined>(initial);
  return (
    <>
      <Calendar mode="single" selected={day} onSelect={setDay} defaultMonth={new Date(2026, 9, 1)} />
      <p>{day === undefined ? 'None' : day.toDateString()}</p>
    </>
  );
}

const dayButton = (name: RegExp) => screen.getByRole('button', { name });

describe('Calendar', () => {
  it('AC-38: shows the month as a grid named by its caption, and picks a day with a click, with no axe violations', async () => {
    const user = userEvent.setup();
    const { container } = render(<Pick />);

    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeVisible();
    await user.click(dayButton(/^24 October 2026/));

    expect(screen.getByText('Sat Oct 24 2026')).toBeVisible();
    expect(dayButton(/^24 October 2026/)).toHaveAttribute('data-picked');
    await expectNoAxeViolations(container);
  });

  it('AC-38: the arrows move between days and Page Down to the next month; Enter picks', async () => {
    const user = userEvent.setup();
    render(<Pick initial={new Date(2026, 9, 20)} />);

    await user.click(dayButton(/^20 October 2026/));
    await user.keyboard('{ArrowRight}');
    expect(dayButton(/^21 October 2026/)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(dayButton(/^28 October 2026/)).toHaveFocus();
    await user.keyboard('{PageDown}');
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeVisible();
    expect(dayButton(/^28 November 2026/)).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByText('Sat Nov 28 2026')).toBeVisible();
  });

  it('moves a month with its buttons', async () => {
    const user = userEvent.setup();
    render(<Pick />);

    await user.click(screen.getByRole('button', { name: /next month/i }));
    expect(screen.getByRole('grid', { name: 'November 2026' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /previous month/i }));
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeVisible();
  });
});
