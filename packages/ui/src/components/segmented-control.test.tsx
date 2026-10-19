import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanIcon, LeftToRightListBulletIcon } from '@hugeicons/core-free-icons';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { SegmentedControl, SegmentedControlItem } from './segmented-control.tsx';
import { Icon } from './icon.tsx';

function View({ onValueChange }: { onValueChange?: (value: string) => void }) {
  return (
    <SegmentedControl aria-label="View" defaultValue="board" onValueChange={onValueChange}>
      <SegmentedControlItem value="board">
        <Icon icon={KanbanIcon} aria-hidden />
        Board
      </SegmentedControlItem>
      <SegmentedControlItem value="list">
        <Icon icon={LeftToRightListBulletIcon} aria-hidden />
        List
      </SegmentedControlItem>
    </SegmentedControl>
  );
}

describe('SegmentedControl', () => {
  it('AC-1: is a named group of toggle buttons with the picked one pressed', async () => {
    const { container } = render(<View />);

    const group = screen.getByRole('group', { name: 'View' });
    expect(group).toContainElement(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'false');
    await expectNoAxeViolations(container);
  });

  it('AC-2: clicking the other option presses it and tells the screen once', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<View onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button', { name: 'List' }));

    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'false');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('list');
  });

  it('AC-2: Tab reaches each option, and Space or Enter presses it', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<View onValueChange={onValueChange} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Board' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'List' })).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');

    await user.tab({ shift: true });
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    expect(onValueChange.mock.calls).toEqual([['list'], ['board']]);
  });

  it('AC-2: pressing the pressed option again changes nothing', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<View onValueChange={onValueChange} />);

    await user.click(screen.getByRole('button', { name: 'Board' }));

    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('AC-1: brings the option Tab lands on into view, for a group that scrolls on a phone', async () => {
    const user = userEvent.setup();
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    onTestFinished(() => {
      scrolled.mockRestore();
    });
    render(<View />);

    await user.tab();
    await user.tab();

    expect(scrolled).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(scrolled.mock.contexts.at(-1)).toBe(screen.getByRole('button', { name: 'List' }));
  });

  it('draws a danger option in the danger colour only once it is pressed', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SegmentedControl aria-label="Push the branch" defaultValue="ask">
        <SegmentedControlItem value="ask">Ask</SegmentedControlItem>
        <SegmentedControlItem value="never" tone="danger">
          Block
        </SegmentedControlItem>
      </SegmentedControl>,
    );
    const block = screen.getByRole('button', { name: 'Block' });
    // jsdom draws no colours, so the class stands in: the danger colour replaces the pressed one's ink.
    expect(block).toHaveClass('data-[state=on]:text-danger');
    expect(block).not.toHaveClass('data-[state=on]:text-foreground');
    expect(block).toHaveAttribute('aria-pressed', 'false');

    await user.click(block);

    expect(block).toHaveAttribute('aria-pressed', 'true');
    await expectNoAxeViolations(container);
  });

  it('follows the value the screen holds', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SegmentedControl aria-label="View" value="board">
        <SegmentedControlItem value="board">Board</SegmentedControlItem>
        <SegmentedControlItem value="list">List</SegmentedControlItem>
      </SegmentedControl>,
    );

    // Without onValueChange the screen keeps its value, so a click alone changes nothing.
    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');

    rerender(
      <SegmentedControl aria-label="View" value="list">
        <SegmentedControlItem value="board">Board</SegmentedControlItem>
        <SegmentedControlItem value="list">List</SegmentedControlItem>
      </SegmentedControl>,
    );
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  });
});
