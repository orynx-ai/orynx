import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';
import { PortList, PortRow, PortRowSkeleton } from './port-row.tsx';
import { StopIcon } from '@hugeicons/core-free-icons';

describe('PortRow (spec 042)', () => {
  it('AC-2, AC-35: a named list of ports, each with its address, what it is, its command, who started it and its buttons', async () => {
    const { container } = render(
      <PortList aria-label="Ports">
        <PortRow
          address="localhost:3005"
          name="node"
          command="node ./node_modules/next/dist/bin/next dev --port 3005"
          meta="Claude · 4 min"
          actions={
            <IconButton variant="ghost" size="sm" label="Stop" aria-label="Stop localhost:3005">
              <Icon icon={StopIcon} />
            </IconButton>
          }
        />
      </PortList>,
    );
    const row = within(screen.getByRole('list', { name: 'Ports' })).getByRole('listitem');
    expect(within(row).getByText('localhost:3005')).toBeVisible();
    expect(within(row).getByText('node')).toBeVisible();
    expect(within(row).getByText('node ./node_modules/next/dist/bin/next dev --port 3005')).toHaveAttribute(
      'title',
      'node ./node_modules/next/dist/bin/next dev --port 3005',
    );
    expect(within(row).getByText('Claude · 4 min')).toBeVisible();
    expect(within(row).getByRole('button', { name: 'Stop localhost:3005' })).toBeVisible();
    await expectNoAxeViolations(container);
  });

  it('AC-9: its skeleton has the row’s own height, and screen readers skip it', () => {
    render(
      <PortList aria-label="Ports">
        <PortRowSkeleton />
        <PortRow
          address="localhost:5432"
          name="PostgreSQL"
          command="postgres -D data"
          meta="Found in the worktree · 2 h"
        />
      </PortList>,
    );
    const [skeleton, row] = screen.getAllByRole('listitem', { hidden: true });
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton?.className.split(' ')).toEqual(expect.arrayContaining(['min-h-14']));
    expect(row?.className.split(' ')).toEqual(expect.arrayContaining(['min-h-14']));
  });
});
