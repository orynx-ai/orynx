import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';

describe('Button', () => {
  it('is a real button that runs its action on click', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Create pull request</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Create pull request' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Allow once</Button>);
    expect(screen.getByRole('button', { name: 'Allow once' })).toHaveAttribute('type', 'button');
  });

  it('keeps an explicit submit type', () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit');
  });

  it('does not run its action when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Create pull request
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Create pull request' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a link with button styles when asChild is set', () => {
    render(
      <Button asChild variant="primary">
        <a href="/settings">Open settings</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Open settings' });
    expect(link).toHaveAttribute('href', '/settings');
    expect(link).not.toHaveAttribute('type');
  });

  it('has no accessibility violations as an icon button with a label', async () => {
    const { container } = render(<Button size="icon" aria-label="Refresh" />);
    await expectNoAxeViolations(container);
  });
});
