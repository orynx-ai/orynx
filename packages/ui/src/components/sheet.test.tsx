import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { Sheet, SheetBody, SheetContent, SheetFoot, SheetTrigger } from './sheet.tsx';

function Filters() {
  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button>Filters</Button>
        </SheetTrigger>
        <SheetContent title="Filters">
          <SheetBody>
            <label>
              <input type="checkbox" /> In review
            </label>
          </SheetBody>
          <SheetFoot>
            <Button variant="ghost">Clear filters</Button>
          </SheetFoot>
        </SheetContent>
      </Sheet>
      <button type="button">Behind the sheet</button>
    </>
  );
}

describe('Sheet', () => {
  it('AC-2: opens from the right, named by its title, with focus inside, and has no axe violations', async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<Filters />);

    await user.click(screen.getByRole('button', { name: 'Filters' }));

    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    expect(sheet).toBeVisible();
    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    await expectNoAxeViolations(baseElement);
  });

  it('AC-2: keeps focus inside while it is open', async () => {
    const user = userEvent.setup();
    render(<Filters />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    for (let press = 0; press < 5; press++) await user.tab();

    expect(screen.getByRole('dialog', { name: 'Filters' })).toContainElement(document.activeElement as HTMLElement);
  });

  it.each([
    ['Esc', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    [
      'the close button',
      async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Close' })),
    ],
  ])('AC-4: %s closes it and gives focus back to Filters', async (_, close) => {
    const user = userEvent.setup();
    render(<Filters />);
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    await close(user);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus();
  });
});
