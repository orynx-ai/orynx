import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Switch } from './switch.tsx';

describe('Switch (spec 029)', () => {
  it('AC-17: is a switch named by its label, flipped by a click or Space', async () => {
    const onCheckedChange = vi.fn();
    const { container } = render(
      <span>
        <Switch id="dnd" onCheckedChange={onCheckedChange} />
        <label htmlFor="dnd">Do not disturb</label>
      </span>,
    );
    const toggle = screen.getByRole('switch', { name: 'Do not disturb' });
    expect(toggle).not.toBeChecked();

    await userEvent.click(screen.getByText('Do not disturb'));
    expect(toggle).toBeChecked();
    await userEvent.keyboard(' ');
    expect(toggle).not.toBeChecked();
    expect(onCheckedChange.mock.calls).toEqual([[true], [false]]);
    await expectNoAxeViolations(container);
  });

  it('AC-36: does nothing while disabled', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Play sounds" disabled defaultChecked onCheckedChange={onCheckedChange} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Play sounds' }));

    expect(screen.getByRole('switch')).toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
