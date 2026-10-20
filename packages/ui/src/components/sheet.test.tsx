import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { Sheet, SheetBody, SheetContent, SheetFoot, SheetRow, SheetTrigger } from './sheet.tsx';

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

/** A list of rows that each open a page inside the sheet, with Back to the list (spec 039). */
function Pages() {
  const [page, setPage] = useState<string | null>(null);
  return (
    <Sheet defaultOpen>
      <SheetContent
        title={page ?? 'Filters'}
        back={
          page === null
            ? undefined
            : {
                label: 'Back to filters',
                onBack: () => {
                  setPage(null);
                },
              }
        }
      >
        <SheetBody className="gap-0 p-0">
          {page === null ? (
            <>
              <SheetRow
                title="Status"
                count={2}
                summary="In review, Done"
                onClick={() => {
                  setPage('Status');
                }}
              />
              <SheetRow
                title="Type"
                summary="Any"
                onClick={() => {
                  setPage('Type');
                }}
              />
            </>
          ) : (
            <p>{page} options</p>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

describe('SheetRow and pages (spec 039)', () => {
  it('names each row with its title, count and what it holds, and has no axe violations', async () => {
    const { baseElement } = render(<Pages />);
    expect(screen.getByRole('button', { name: 'Status · 2, In review, Done' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Type, Any' })).toBeVisible();
    await expectNoAxeViolations(baseElement);
  });

  it('a row opens its page, named by it, and Back returns to the list', async () => {
    const user = userEvent.setup();
    render(<Pages />);

    await user.click(screen.getByRole('button', { name: /^Status/ }));
    expect(screen.getByRole('dialog', { name: 'Status' })).toBeVisible();
    expect(screen.getByText('Status options')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Back to filters' }));
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back to filters' })).not.toBeInTheDocument();
  });
});
