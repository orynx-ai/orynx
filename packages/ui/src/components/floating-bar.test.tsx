import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { FloatingBar } from './floating-bar.tsx';

describe('FloatingBar', () => {
  it('is a group named by its label, holding its count and actions', async () => {
    const { container } = render(
      <FloatingBar aria-label="Selected tickets">
        <span role="status">2 selected</span>
        <Button variant="ghost" size="sm">
          Unselect all
        </Button>
        <Button size="sm">Ship all</Button>
      </FloatingBar>,
    );

    const bar = screen.getByRole('group', { name: 'Selected tickets' });
    expect(within(bar).getByRole('status')).toHaveTextContent('2 selected');
    expect(within(bar).getByRole('button', { name: 'Unselect all' })).toBeVisible();
    expect(within(bar).getByRole('button', { name: 'Ship all' })).toBeVisible();
    await expectNoAxeViolations(container);
  });
});
