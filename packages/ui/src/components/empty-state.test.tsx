import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button.tsx';
import { EmptyState } from './empty-state.tsx';

describe('EmptyState', () => {
  it('says what would be here and how it gets here', () => {
    render(
      <EmptyState title="Nothing in review">
        <span>Tickets move here when you open a pull request.</span>
      </EmptyState>,
    );

    expect(screen.getByText('Nothing in review')).toBeVisible();
    expect(screen.getByText('Tickets move here when you open a pull request.')).toBeVisible();
  });

  it('offers an action when one is given', () => {
    render(<EmptyState title="No tickets match these filters" action={<Button>Clear filters</Button>} />);
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  });
});
