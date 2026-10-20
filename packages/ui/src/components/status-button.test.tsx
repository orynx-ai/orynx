import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './dialog.tsx';
import { StatusButton, StatusSign } from './status-button.tsx';

describe('StatusButton', () => {
  it('AC-4: is named for the tool and its state, and shows what pressing does in a tooltip', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <StatusButton
        state="connected"
        label="Connected · select to manage"
        aria-label="Jira: Connected. Manage connection"
        onClick={onClick}
      />,
    );

    const button = screen.getByRole('button', { name: 'Jira: Connected. Manage connection' });
    await user.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Connected · select to manage');
    await user.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });

  it('AC-4: opens a dialog from the keyboard as its trigger, and focus comes back to it on Escape', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <StatusButton
            state="needs_reconnecting"
            label="Needs reconnecting · select to fix"
            aria-label="GitHub: Needs reconnecting. Manage connection"
          />
        </DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>GitHub</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    await user.tab();
    const button = screen.getByRole('button', { name: 'GitHub: Needs reconnecting. Manage connection' });
    expect(button).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Needs reconnecting · select to fix');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'GitHub' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });
});

describe('StatusSign', () => {
  it('AC-3: is a picture only, so the words beside it carry the meaning', async () => {
    const { container } = render(
      <p>
        <StatusSign state="not_connected" />
        Not connected
      </p>,
    );

    expect(screen.getByText('Not connected')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
