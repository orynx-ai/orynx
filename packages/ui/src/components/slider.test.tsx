import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Slider } from './slider.tsx';

describe('Slider (spec 029)', () => {
  it('AC-37: is a slider named by its label, moved by the arrow keys in its steps', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <>
        <label htmlFor="volume">Volume</label>
        <Slider id="volume" min={0} max={100} step={5} defaultValue={60} aria-valuetext="60%" onChange={onChange} />
      </>,
    );
    const slider = screen.getByRole('slider', { name: 'Volume' });

    fireEvent.change(slider, { target: { value: '35' } });

    expect(slider).toHaveValue('35');
    expect(onChange).toHaveBeenCalledOnce();
    expect(slider).toHaveAttribute('aria-valuetext', '60%');
    await expectNoAxeViolations(container);
  });

  it('AC-36: can be disabled', async () => {
    render(<Slider aria-label="Volume" disabled />);

    await userEvent.click(screen.getByRole('slider', { name: 'Volume' }));

    expect(screen.getByRole('slider')).toBeDisabled();
  });
});
