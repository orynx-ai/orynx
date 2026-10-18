import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Pill } from './pill.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowSkeleton } from './table.tsx';

function Tickets({ loading = false }: { loading?: boolean }) {
  return (
    <Table caption="Tickets in Sprint 42" aria-busy={loading || undefined}>
      <TableHeader>
        <TableRow>
          <TableHead>Key</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRowSkeleton columns={3} />
        ) : (
          <TableRow>
            <TableCell>PROJ-1423</TableCell>
            <TableCell>
              <a href="#PROJ-1423">Add bulk archive to the content list</a>
            </TableCell>
            <TableCell>
              <Pill tone="warning">In Progress</Pill>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

describe('Table', () => {
  it('AC-11: is a real table, named by its caption, with column headings and rows', () => {
    render(<Tickets />);

    const table = screen.getByRole('table', { name: 'Tickets in Sprint 42' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Key', 'Title', 'Status']);
    const [, row] = within(table).getAllByRole('row');
    expect(within(row ?? table).getByRole('cell', { name: 'PROJ-1423' })).toBeVisible();
    expect(within(row ?? table).getByRole('link', { name: 'Add bulk archive to the content list' })).toBeVisible();
  });

  it('AC-30: its scrolling box is a region named like the table, which Tab reaches', async () => {
    render(<Tickets />);

    await userEvent.tab();

    expect(screen.getByRole('region', { name: 'Tickets in Sprint 42' })).toHaveFocus();
  });

  it('AC-20: loading rows are hidden from screen readers', () => {
    render(<Tickets loading />);

    expect(screen.getByRole('table', { name: 'Tickets in Sprint 42' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByRole('row')).toHaveLength(1);
  });

  it('has no accessibility violations, loaded or loading', async () => {
    const loaded = render(<Tickets />);
    await expectNoAxeViolations(loaded.container);
    loaded.unmount();

    const { container } = render(<Tickets loading />);
    await expectNoAxeViolations(container);
  });
});
