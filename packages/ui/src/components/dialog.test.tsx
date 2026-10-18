import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './dialog.tsx';

function Search() {
  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Search</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <input aria-label="Search tickets, pull requests and sessions" />
          <button type="button">Open PROJ-1423</button>
        </DialogContent>
      </Dialog>
      <button type="button">Behind the dialog</button>
    </>
  );
}

/** Opened by a key rather than a trigger, as ⌘K does, while the person types in another field. */
function OpenedByKey() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <input
        aria-label="Search this page"
        onKeyDown={(event) => {
          if (event.key === 'k' && event.metaKey) setOpen(true);
        }}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="sr-only">Search</DialogTitle>
          <input aria-label="Search tickets, pull requests and sessions" />
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('AC-1: opens named by its title, with focus in its first field, and has no axe violations', async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<Search />);

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(screen.getByRole('dialog', { name: 'Search' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Search tickets, pull requests and sessions' })).toHaveFocus();
    await expectNoAxeViolations(baseElement);
  });

  it('AC-19: Esc closes it and gives focus back to the button that opened it', async () => {
    const user = userEvent.setup();
    render(<Search />);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus();
  });

  it('AC-19: a click outside it closes it', async () => {
    const user = userEvent.setup();
    render(<Search />);
    await user.click(screen.getByRole('button', { name: 'Search' }));

    // Radix stops pointer events on the page while it's open, so the click lands on the window's root.
    await user.click(document.documentElement);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-20: Tab and Shift+Tab stay inside it', async () => {
    const user = userEvent.setup();
    render(<Search />);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const field = screen.getByRole('textbox', { name: 'Search tickets, pull requests and sessions' });

    await user.tab();
    expect(screen.getByRole('button', { name: 'Open PROJ-1423' })).toHaveFocus();
    await user.tab();
    expect(field).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Open PROJ-1423' })).toHaveFocus();
  });

  it('AC-3: opened by a key from a text field, it gives focus back to that field, with its text, when it closes', async () => {
    const user = userEvent.setup();
    render(<OpenedByKey />);
    const field = screen.getByRole('textbox', { name: 'Search this page' });
    await user.type(field, 'archive');

    await user.keyboard('{Meta>}k{/Meta}');
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeVisible();
    await user.keyboard('{Escape}');

    expect(field).toHaveFocus();
    expect(field).toHaveValue('archive');
  });
});
