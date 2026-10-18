import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ManagedConnectionRow, type ManagedConnectionRowProps } from './managed-connection-row.tsx';

const connected = { state: 'connected', detail: 'Signed in as octocat with the gh command-line tool' } as const;

/** Holds which form is open, the way the Connections panel does. */
function Panel(props: Omit<ManagedConnectionRowProps, 'open' | 'onOpenChange'>) {
  const [open, setOpen] = useState(false);
  return (
    <ul>
      <ManagedConnectionRow {...props} open={open} onOpenChange={setOpen} />
    </ul>
  );
}

/** A row whose form has a Finish and a Cancel button, the way a real form closes itself. */
function renderRow(props: Partial<ManagedConnectionRowProps> = {}) {
  const announce = vi.fn();
  const user = userEvent.setup();
  render(
    <Panel
      id="github"
      name="GitHub"
      howToConnect="Reuses your gh command-line login, or a personal access token."
      status={{ state: 'not_connected', detail: null }}
      configured={false}
      changing={false}
      loadFailed={false}
      announce={announce}
      form={({ id, close }) => (
        <form id={id} aria-label="GitHub connection">
          <button
            type="button"
            onClick={() => {
              close('GitHub is connected.');
            }}
          >
            Finish
          </button>
          <button
            type="button"
            onClick={() => {
              close();
            }}
          >
            Cancel
          </button>
        </form>
      )}
      {...props}
    />,
  );
  return { announce, user };
}

describe('ManagedConnectionRow', () => {
  it('AC-1: offers Connect while nothing is set up', () => {
    renderRow();
    expect(screen.getByRole('button', { name: 'Connect' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('AC-11: reads Manage for a tool that is set up', () => {
    renderRow({ configured: true, status: connected });
    expect(screen.getByRole('button', { name: 'Manage' })).toBeVisible();
    expect(screen.getByText('Signed in as octocat with the gh command-line tool')).toBeVisible();
  });

  it('AC-2: opens the form inside the row, and the button reads Close and points at it', async () => {
    const { user, announce } = renderRow();

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    const form = screen.getByRole('form', { name: 'GitHub connection' });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveAttribute('aria-expanded', 'true');
    expect(close).toHaveAttribute('aria-controls', form.id);
    // Opening clears the last message, so the same words are said again next time.
    expect(announce).toHaveBeenCalledWith('');
  });

  it('AC-3: a form that finishes closes, says what happened, and puts focus back on the button', async () => {
    const { user, announce } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await user.click(screen.getByRole('button', { name: 'Finish' }));

    expect(screen.queryByRole('form', { name: 'GitHub connection' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toHaveFocus();
    expect(announce).toHaveBeenLastCalledWith('GitHub is connected.');
  });

  it('AC-18: Cancel closes quietly, and Close does the same', async () => {
    const { user, announce } = renderRow();
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Connect' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('form', { name: 'GitHub connection' })).not.toBeInTheDocument();
    expect(announce).not.toHaveBeenCalledWith(expect.stringMatching(/\S/));
  });

  it("AC-15: while a change is on its way, the button can't open or close the form", async () => {
    const { user } = renderRow({ changing: true });

    const connect = screen.getByRole('button', { name: 'Connect' });
    expect(connect).toHaveAttribute('aria-disabled', 'true');
    await user.click(connect);

    expect(screen.queryByRole('form', { name: 'GitHub connection' })).not.toBeInTheDocument();
  });

  it("says the Orynx server can't be reached when the saved settings never arrived", async () => {
    const { user } = renderRow({ loadFailed: true, form: undefined });

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the Orynx server.');
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveAttribute('aria-controls');
  });
});
