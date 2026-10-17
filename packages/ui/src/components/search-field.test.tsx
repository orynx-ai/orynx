import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { SearchField } from './search-field.tsx';

describe('SearchField', () => {
  it('is a search box named by its label, and takes what a person types', async () => {
    render(<SearchField aria-label="Search tickets" placeholder="Search tickets" />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'bulk archive');

    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('bulk archive');
  });

  it('keeps its icon out of what a screen reader hears', () => {
    const { container } = render(<SearchField aria-label="Search tickets" />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('passes what it’s told to the input, such as its value and what to do on a change', async () => {
    const changes: string[] = [];
    render(
      <SearchField
        aria-label="Search tickets"
        size="sm"
        value="14"
        onChange={(event) => changes.push(event.target.value)}
      />,
    );

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tickets' }), '2');

    expect(changes).toEqual(['142']);
  });

  it('has no accessibility violations, at either size', async () => {
    const { container } = render(
      <>
        <SearchField aria-label="Search tickets" />
        <SearchField aria-label="Search people" size="sm" />
      </>,
    );
    await expectNoAxeViolations(container);
  });
});
