import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { BrandMark } from './brand-mark.tsx';

describe('BrandMark', () => {
  it('is skipped by screen readers, since the name is written next to it', async () => {
    const { container } = render(
      <span>
        <BrandMark />
        Orynx
      </span>,
    );

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
    await expectNoAxeViolations(container);
  });

  it('draws in the text colour, so it follows the theme', () => {
    const { container } = render(<BrandMark />);

    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
  });

  it('takes a size from the caller in place of its own', () => {
    const { container } = render(<BrandMark className="h-10 w-16" />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('h-10', 'w-16');
    expect(svg).not.toHaveClass('h-5', 'w-8');
  });
});
