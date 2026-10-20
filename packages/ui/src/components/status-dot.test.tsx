import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusDot } from './status-dot.tsx';

describe('StatusDot (spec 035)', () => {
  it('AC-8: is a decorative dot, so the words beside it carry the state', () => {
    const { container } = render(<StatusDot tone="danger" />);

    const dot = container.firstElementChild;
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot).toHaveClass('bg-danger');
  });

  it('AC-7: draws a tool that isn’t connected as an empty ring', () => {
    const { container } = render(<StatusDot tone="off" />);

    expect(container.firstElementChild).toHaveClass('border', 'border-control');
    expect(container.firstElementChild).not.toHaveClass('bg-danger');
  });
});
