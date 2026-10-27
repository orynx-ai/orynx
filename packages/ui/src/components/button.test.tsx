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

  it('AC-18 (spec 048): a ghost toggle that is pressed keeps a tint, so Wrap lines shows it is on', () => {
    const { rerender } = render(
      <Button variant="ghost" size="sm" aria-pressed>
        Wrap lines
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Wrap lines', pressed: true })).toHaveClass('aria-pressed:bg-subtle');
    rerender(
      <Button variant="ghost" size="sm" aria-pressed={false}>
        Wrap lines
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Wrap lines', pressed: false })).toBeInTheDocument();
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

  it('passes its action to the element it renders with asChild', async () => {
    const onClick = vi.fn();
    render(
      <Button asChild onClick={onClick}>
        <a href="#settings">Open settings</a>
      </Button>,
    );

    await userEvent.click(screen.getByRole('link', { name: 'Open settings' }));

    expect(onClick).toHaveBeenCalledOnce();
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

  it('AC-13: while pending it keeps its label and focus, and ignores clicks', async () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button pending={false} onClick={onClick}>
        Connect Jira
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Connect Jira' });
    button.focus();

    rerender(
      <Button pending onClick={onClick}>
        Connect Jira
      </Button>,
    );
    await userEvent.click(button);

    expect(screen.getByRole('button', { name: 'Connect Jira' })).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('AC-13: a pending submit button sends its form neither on click nor on Enter', async () => {
    const onSubmit = vi.fn();
    render(
      <form
        aria-label="Connect"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label>
          Jira site
          <input />
        </label>
        <Button type="submit" pending>
          Connect Jira
        </Button>
      </form>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Connect Jira' }));
    await userEvent.type(screen.getByLabelText('Jira site'), 'your-team{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('runs its action again once it is no longer pending', async () => {
    const onClick = vi.fn();
    render(
      <Button pending={false} onClick={onClick}>
        Connect Jira
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Connect Jira' }));

    expect(screen.getByRole('button', { name: 'Connect Jira' })).not.toHaveAttribute('aria-disabled');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations while pending', async () => {
    const { container } = render(
      <Button variant="primary" pending>
        Connect Jira
      </Button>,
    );
    await expectNoAxeViolations(container);
  });

  it('AC-10 (spec 011): the quiet danger look is a real button, for a destructive action that asks first', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <Button variant="danger-ghost" size="sm" onClick={onClick}>
        Discard changes
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it('has no accessibility violations as an icon button with a label', async () => {
    const { container } = render(<Button size="icon" aria-label="Refresh" />);
    await expectNoAxeViolations(container);
  });
});
