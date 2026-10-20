import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './popover.tsx';

function Sample() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Due date</Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Pick a due date">
        <button type="button">Clear date</button>
      </PopoverContent>
    </Popover>
  );
}

describe('Popover', () => {
  it('AC-38: opens beside its trigger, says it opened, and has no axe violations', async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<Sample />);
    const trigger = screen.getByRole('button', { name: 'Due date' });

    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Pick a due date' })).toBeVisible();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expectNoAxeViolations(baseElement);
  });

  it('AC-38: Esc closes it and gives focus back to the trigger', async () => {
    const user = userEvent.setup();
    render(<Sample />);
    const trigger = screen.getByRole('button', { name: 'Due date' });

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
