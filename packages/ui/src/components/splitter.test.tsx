import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Splitter } from './splitter.tsx';

/** A panel whose width the splitter controls, the way a caller would hold the value. */
function Panel({ initial = 260 }: { initial?: number }) {
  const [width, setWidth] = useState(initial);
  return (
    <div>
      <aside id="panel">{width}</aside>
      <Splitter
        aria-label="Resize sidebar"
        aria-controls="panel"
        value={width}
        min={260}
        max={400}
        defaultValue={260}
        onValueChange={setWidth}
      />
    </div>
  );
}

function handle() {
  return screen.getByRole('separator', { name: 'Resize sidebar' });
}

describe('Splitter', () => {
  it('AC-22: is a focusable vertical separator that says its width and limits', () => {
    render(<Panel />);

    expect(handle()).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle()).toHaveAttribute('aria-valuenow', '260');
    expect(handle()).toHaveAttribute('aria-valuetext', '260 pixels');
    expect(handle()).toHaveAttribute('aria-valuemin', '260');
    expect(handle()).toHaveAttribute('aria-valuemax', '400');
    expect(handle()).toHaveAttribute('aria-controls', 'panel');
    expect(handle()).toHaveAttribute('tabindex', '0');
  });

  it('AC-22: moves 16 px per Left or Right arrow and jumps to the limits with Home and End', async () => {
    const user = userEvent.setup();
    render(<Panel />);
    handle().focus();

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(handle()).toHaveAttribute('aria-valuenow', '292');

    await user.keyboard('{ArrowLeft}');
    expect(handle()).toHaveAttribute('aria-valuenow', '276');

    await user.keyboard('{End}');
    expect(handle()).toHaveAttribute('aria-valuenow', '400');

    await user.keyboard('{Home}');
    expect(handle()).toHaveAttribute('aria-valuenow', '260');
  });

  it('AC-22: never goes past the limits', async () => {
    const user = userEvent.setup();
    render(<Panel initial={392} />);
    handle().focus();

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(handle()).toHaveAttribute('aria-valuenow', '400');
  });

  it('AC-21: follows the pointer while dragging, within the limits', () => {
    render(<Panel />);

    fireEvent.pointerDown(handle(), { button: 0, clientX: 260, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 330, buttons: 1, pointerId: 1 });
    expect(handle()).toHaveAttribute('aria-valuenow', '330');

    fireEvent.pointerMove(handle(), { clientX: 900, buttons: 1, pointerId: 1 });
    expect(handle()).toHaveAttribute('aria-valuenow', '400');

    fireEvent.pointerUp(handle(), { clientX: 900, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 300, buttons: 1, pointerId: 1 });
    expect(handle()).toHaveAttribute('aria-valuenow', '400');
  });

  it('AC-21: ignores a secondary-button press', () => {
    render(<Panel />);

    fireEvent.pointerDown(handle(), { button: 2, clientX: 260, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 330, buttons: 2, pointerId: 1 });

    expect(handle()).toHaveAttribute('aria-valuenow', '260');
  });

  it('AC-21: stops when the button is no longer held, even if the release was missed', () => {
    render(<Panel />);

    fireEvent.pointerDown(handle(), { button: 0, clientX: 260, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 300, buttons: 0, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 340, buttons: 1, pointerId: 1 });

    expect(handle()).toHaveAttribute('aria-valuenow', '260');
    expect(document.documentElement.style.cursor).toBe('');
  });

  it('AC-22: leaves modified arrows (browser Back) and Up/Down to the browser', async () => {
    const user = userEvent.setup();
    render(<Panel initial={300} />);
    handle().focus();

    await user.keyboard('{Meta>}{ArrowLeft}{/Meta}{Alt>}{ArrowLeft}{/Alt}{Control>}{ArrowRight}{/Control}');
    await user.keyboard('{ArrowUp}{ArrowDown}');

    expect(handle()).toHaveAttribute('aria-valuenow', '300');
  });

  it('keeps its own keyboard handling when the caller adds one', async () => {
    const user = userEvent.setup();
    let seen = 0;
    render(
      <Splitter
        aria-label="Resize sidebar"
        value={260}
        min={260}
        max={400}
        onValueChange={() => (seen += 1)}
        onKeyDown={() => undefined}
      />,
    );
    handle().focus();

    await user.keyboard('{ArrowRight}');

    expect(seen).toBe(1);
  });

  it('AC-23: goes back to the default width on double-click', async () => {
    const user = userEvent.setup();
    render(<Panel initial={360} />);

    await user.dblClick(handle());

    expect(handle()).toHaveAttribute('aria-valuenow', '260');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Panel />);
    await expectNoAxeViolations(container);
  });
});
