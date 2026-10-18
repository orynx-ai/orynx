import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArrowUpRight01Icon, Refresh04Icon, SparklesIcon } from '@hugeicons/core-free-icons';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';

describe('IconButton', () => {
  it('AC-10: its label is its name and, on keyboard focus, its tooltip', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <IconButton label="Refresh" onClick={onClick}>
        <Icon icon={Refresh04Icon} aria-hidden />
      </IconButton>,
    );

    await user.tab();
    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Refresh');
    await expectNoAxeViolations(container);

    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('AC-9: a name that says which item, with the shorter tooltip', async () => {
    const user = userEvent.setup();
    render(
      <IconButton label="Ship" aria-label="Ship PROJ-1423" variant="ghost" size="sm">
        <Icon icon={SparklesIcon} aria-hidden />
      </IconButton>,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Ship PROJ-1423' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Ship');
  });

  it('while pending, shows a spinner in the icon’s place, ignores presses and keeps focus', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton label="Ship" pending onClick={onClick}>
        <Icon icon={SparklesIcon} aria-hidden />
      </IconButton>,
    );

    const button = screen.getByRole('button', { name: 'Ship' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button).toHaveFocus();
  });

  it('as a link, keeps the link and gives it the name and the tooltip', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <IconButton asChild label="Open in Jira" aria-label="Open PROJ-1423 in Jira" variant="ghost" size="sm">
        <a href="https://acme.atlassian.net/browse/PROJ-1423">
          <Icon icon={ArrowUpRight01Icon} aria-hidden />
        </a>
      </IconButton>,
    );

    await user.tab();
    const link = screen.getByRole('link', { name: 'Open PROJ-1423 in Jira' });
    expect(link).toHaveFocus();
    expect(link).toHaveAttribute('href', 'https://acme.atlassian.net/browse/PROJ-1423');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Open in Jira');
    await expectNoAxeViolations(container);
  });
});
