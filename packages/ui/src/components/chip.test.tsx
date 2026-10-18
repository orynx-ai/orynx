import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanIcon, Message01Icon } from '@hugeicons/core-free-icons';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Chip, FilterChip } from './chip.tsx';
import { Icon } from './icon.tsx';

describe('FilterChip', () => {
  it('AC-25: is a toggle button that says whether it is pressed', async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    const { container } = render(
      <div role="group" aria-label="Filters">
        <FilterChip defaultPressed onPressedChange={onPressedChange}>
          Assigned to me
        </FilterChip>
        <FilterChip>Due this week</FilterChip>
      </div>,
    );

    const mine = screen.getByRole('button', { name: 'Assigned to me' });
    expect(mine).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Due this week' })).toHaveAttribute('aria-pressed', 'false');
    await expectNoAxeViolations(container);

    await user.click(mine);
    expect(mine).toHaveAttribute('aria-pressed', 'false');
    expect(onPressedChange).toHaveBeenLastCalledWith(false);

    await user.keyboard(' ');
    expect(mine).toHaveAttribute('aria-pressed', 'true');
    expect(onPressedChange).toHaveBeenLastCalledWith(true);
  });
});

describe('Chip', () => {
  it('AC-25: a quick start can be a link with its icon', async () => {
    const { container } = render(
      <Chip asChild>
        <a href="/tickets">
          <Icon icon={KanbanIcon} aria-hidden />
          Pick up a ticket
        </a>
      </Chip>,
    );

    expect(screen.getByRole('link', { name: 'Pick up a ticket' })).toHaveAttribute('href', '/tickets');
    await expectNoAxeViolations(container);
  });

  it('AC-25: a quick start can be a button that acts', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Chip onClick={onClick}>
        <Icon icon={Message01Icon} aria-hidden />
        Draft a Slack reply
      </Chip>,
    );

    const chip = screen.getByRole('button', { name: 'Draft a Slack reply' });
    expect(chip).toHaveAttribute('type', 'button');
    await user.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
