import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pill } from './pill.tsx';

describe('Pill', () => {
  it('shows the state as a word, with a decorative dot', () => {
    const { container } = render(<Pill tone="danger">Checks failing</Pill>);

    expect(screen.getByText('Checks failing')).toBeVisible();
    expect(container.querySelector('[aria-hidden]')).not.toBeNull();
  });

  it('drops the dot for plain tags', () => {
    const { container } = render(<Pill plain>Story</Pill>);
    expect(container.querySelector('[aria-hidden]')).toBeNull();
  });
});
