import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Skeleton } from './skeleton.tsx';

describe('Skeleton', () => {
  it('AC-26: stands in for content without being read out', async () => {
    const { container } = render(
      <section aria-label="Tickets" aria-busy>
        <Skeleton className="h-6 w-24" />
        <Skeleton shape="circle" className="size-7" />
      </section>,
    );

    const region = screen.getByRole('region', { name: 'Tickets' });
    // A screen reader hears that the region is busy, and nothing from the blocks themselves.
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveTextContent('');
    for (const block of region.children) expect(block).toHaveAttribute('aria-hidden', 'true');
    await expectNoAxeViolations(container);
  });
});
