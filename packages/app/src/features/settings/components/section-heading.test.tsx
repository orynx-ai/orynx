import { render, screen } from '@testing-library/react';
import { RoboticIcon } from '@hugeicons/core-free-icons';
import { describe, expect, it } from 'vitest';
import { SectionHeading } from './section-heading.tsx';

describe('SectionHeading', () => {
  it('is a heading named by its title alone, its icon hidden, with its line under it', () => {
    render(<SectionHeading id="agent" icon={RoboticIcon} title="Agent" line="Who does the work." />);

    expect(screen.getByRole('heading', { level: 2, name: 'Agent' })).toHaveAttribute('id', 'agent');
    expect(screen.getByText('Who does the work.')).toBeVisible();
  });

  it('works without a line', () => {
    const { container } = render(<SectionHeading id="agent" icon={RoboticIcon} title="Agent" />);

    expect(container.querySelector('p')).toBeNull();
  });
});
