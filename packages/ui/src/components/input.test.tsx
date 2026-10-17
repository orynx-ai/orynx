import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Input } from './input.tsx';

describe('Input', () => {
  it('is a real text box that takes what a person types', async () => {
    render(<Input aria-label="Search tickets" type="search" />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'archive');

    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('archive');
  });

  it('keeps a placeholder as a hint, never as the name', () => {
    render(<Input aria-label="Search tickets" placeholder="Key or title" />);
    expect(screen.getByRole('textbox', { name: 'Search tickets' })).toHaveAttribute('placeholder', 'Key or title');
  });

  it('takes no typing when disabled', async () => {
    render(<Input aria-label="Jira site" disabled defaultValue="your-team.atlassian.net" />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Jira site' }), 'x');

    expect(screen.getByRole('textbox', { name: 'Jira site' })).toHaveValue('your-team.atlassian.net');
  });

  it('has no accessibility violations on its own with an aria-label', async () => {
    const { container } = render(<Input aria-label="Search tickets" type="search" />);
    await expectNoAxeViolations(container);
  });
});
