import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Tooltip, TooltipProvider } from './tooltip.tsx';

afterEach(() => {
  vi.useRealTimers();
});

function Collapse({ label = 'Collapse sidebar' }: { label?: string | null }) {
  return (
    <>
      <button type="button">Before</button>
      <Tooltip label={label}>
        <button type="button" aria-label="Collapse sidebar">
          ≡
        </button>
      </Tooltip>
    </>
  );
}

/** A mouse pointer coming to rest on the control (user-event can't run under fake timers). */
function rest(control: HTMLElement) {
  fireEvent.pointerMove(control, { pointerType: 'mouse' });
}

/** The pointer leaving the control for the page around it, away from the tooltip. */
function leave(control: HTMLElement) {
  fireEvent.pointerLeave(control, { pointerType: 'mouse' });
  fireEvent.pointerMove(document.body, { pointerType: 'mouse', clientX: 500, clientY: 500 });
}

describe('Tooltip', () => {
  it('AC-9: shows the name once the pointer rests on the control for 500 ms, and not before', () => {
    vi.useFakeTimers();
    render(<Collapse />);
    const control = screen.getByRole('button', { name: 'Collapse sidebar' });

    rest(control);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Collapse sidebar');

    leave(control);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('AC-10: opens at once on keyboard focus, closes on Escape, and leaves focus and the name where they were', async () => {
    const user = userEvent.setup();
    const { container } = render(<Collapse />);

    await user.tab();
    await user.tab();
    const control = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(control).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Collapse sidebar');
    // Screen readers hear the tooltip as the control's description; the name stays the control's own.
    expect(control).toHaveAccessibleDescription('Collapse sidebar');
    await expectNoAxeViolations(container);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(control).toHaveFocus();
  });

  it('closes when the control is pressed', async () => {
    const user = userEvent.setup();
    render(<Collapse />);

    await user.tab();
    await user.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('never opens for a touch', async () => {
    const user = userEvent.setup();
    render(<Collapse />);

    await user.pointer({ keys: '[TouchA]', target: screen.getByRole('button', { name: 'Collapse sidebar' }) });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('with no label, never opens, and the control stays the same element when the label comes and goes', async () => {
    const user = userEvent.setup();
    function Toggle() {
      const [collapsed, setCollapsed] = useState(false);
      return (
        <Tooltip label={collapsed ? 'Home' : null}>
          <button
            type="button"
            onClick={() => {
              setCollapsed((was) => !was);
            }}
          >
            Home
          </button>
        </Tooltip>
      );
    }
    render(<Toggle />);
    const control = screen.getByRole('button', { name: 'Home' });

    await user.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Home' })).toBe(control);
    expect(control).toHaveFocus();
  });

  it('moving from one tooltip to the next under a provider opens the next at once', () => {
    vi.useFakeTimers();
    render(
      <TooltipProvider>
        <Tooltip label="Home">
          <button type="button">H</button>
        </Tooltip>
        <Tooltip label="Tickets">
          <button type="button">T</button>
        </Tooltip>
      </TooltipProvider>,
    );

    rest(screen.getByRole('button', { name: 'H' }));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Home');
    leave(screen.getByRole('button', { name: 'H' }));
    rest(screen.getByRole('button', { name: 'T' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Tickets');
  });
});
