import { SparklesIcon } from '@hugeicons/core-free-icons';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { FloatingBar, FloatingBarSeparator } from './floating-bar.tsx';
import { Icon } from './icon.tsx';

describe('FloatingBar', () => {
  it('is a group named by its label, holding its count and actions', async () => {
    const { container } = render(
      <FloatingBar aria-label="Selected tickets">
        <span role="status">2 selected</span>
        <Button variant="danger-ghost" size="sm">
          Unselect all
        </Button>
        <FloatingBarSeparator />
        <Button variant="ghost" size="sm">
          <Icon icon={SparklesIcon} aria-hidden />
          Ship all
        </Button>
      </FloatingBar>,
    );

    const bar = screen.getByRole('group', { name: 'Selected tickets' });
    expect(within(bar).getByRole('status')).toHaveTextContent('2 selected');
    expect(within(bar).getByRole('button', { name: 'Unselect all' })).toBeVisible();
    expect(within(bar).getByRole('button', { name: 'Ship all' })).toBeVisible();
    await expectNoAxeViolations(container);
  });
});
