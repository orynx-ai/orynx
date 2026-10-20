import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog.tsx';
import { Button } from './button.tsx';

function DeleteTicket({ onDelete, pending = false }: { onDelete: () => void; pending?: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="danger-ghost">Delete ticket</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogBody>
          <AlertDialogTitle>Delete ORX-3?</AlertDialogTitle>
          <AlertDialogDescription>It’s gone for good, and its key isn’t used again.</AlertDialogDescription>
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction pending={pending} onClick={onDelete}>
            Delete ticket
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Work that takes a moment keeps it open, pending, until it's done. */
function SlowDelete() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button>Delete ticket</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogBody>
          <AlertDialogTitle>Delete ORX-3?</AlertDialogTitle>
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            pending={pending}
            onClick={(event) => {
              event.preventDefault();
              setPending(true);
            }}
          >
            Delete for good
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe('AlertDialog', () => {
  it('AC-17: opens as an alert dialog named by its title and described by its line, with Cancel focused, and no axe violations', async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<DeleteTicket onDelete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Delete ticket' }));

    const confirm = screen.getByRole('alertdialog', { name: 'Delete ORX-3?' });
    expect(confirm).toHaveAccessibleDescription('It’s gone for good, and its key isn’t used again.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await expectNoAxeViolations(baseElement);
  });

  it('AC-17: Cancel and Esc close it, doing nothing, and give focus back to what opened it', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<DeleteTicket onDelete={onDelete} />);
    const trigger = screen.getByRole('button', { name: 'Delete ticket' });

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('AC-18: the action does the thing and closes it; Tab goes Cancel, then the action', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<DeleteTicket onDelete={onDelete} />);

    await user.click(screen.getByRole('button', { name: 'Delete ticket' }));
    await user.tab();
    const action = screen.getAllByRole('button', { name: 'Delete ticket' }).at(-1);
    expect(action).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('stays open, pending, while slow work runs', async () => {
    const user = userEvent.setup();
    render(<SlowDelete />);

    await user.click(screen.getByRole('button', { name: 'Delete ticket' }));
    await user.click(screen.getByRole('button', { name: 'Delete for good' }));

    expect(screen.getByRole('alertdialog', { name: 'Delete ORX-3?' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Delete for good/ })).toHaveAttribute('aria-disabled', 'true');
  });
});
