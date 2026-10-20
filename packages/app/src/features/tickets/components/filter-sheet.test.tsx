import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTicket } from '@devhub/contracts/testing';
import { server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { designTickets, ticketsHandler, ticketsToday } from '../../../test/tickets.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: ticketsToday });
});
afterEach(() => {
  vi.useRealTimers();
});

function toolbar() {
  return screen.getByRole('group', { name: 'Filters' });
}

async function openSheet(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  await user.click(within(toolbar()).getByRole('button', { name: /^Filters/ }));
  return screen.findByRole('dialog', { name: 'Filters' });
}

describe('Tickets’ filter sheet (spec 039)', () => {
  it('AC-2: Filters opens a sheet with Project, Sprint and every filter, with focus inside', async () => {
    server.use(ticketsHandler());
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    const sheet = await openSheet(user);

    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    expect(within(sheet).getByRole('button', { name: /^Project/ })).toBeVisible();
    expect(within(sheet).getByRole('button', { name: /^Sprint/ })).toBeVisible();
    for (const name of ['Source', 'Assignee', 'Status', 'Type', 'Priority', 'Due']) {
      expect(within(sheet).getByRole('group', { name })).toBeVisible();
    }
    expect(within(sheet).getByRole('checkbox', { name: 'Me' })).toBeChecked();
  });

  it('AC-3: a tick applies at once: the board, both counts and the Filters button change', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets?assignee=anyone' });
    await screen.findByText('9 tickets');
    const sheet = await openSheet(user);

    await user.click(
      within(within(sheet).getByRole('group', { name: 'Status' })).getByRole('checkbox', { name: 'Code Review' }),
    );

    expect(within(sheet).getByRole('status')).toHaveTextContent('2 tickets');
    expect(new URLSearchParams(history.location.search).get('status')).toBe('Code Review');
    await user.keyboard('{Escape}');
    expect(within(toolbar()).getByRole('status')).toHaveTextContent('2 tickets');
    expect(within(toolbar()).getByRole('button', { name: 'Filters · 1' })).toHaveFocus();
  });

  it('AC-4: Close gives focus back to Filters', async () => {
    server.use(ticketsHandler());
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');
    const sheet = await openSheet(user);

    await user.click(within(sheet).getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
    expect(within(toolbar()).getByRole('button', { name: 'Filters' })).toHaveFocus();
  });

  it('AC-5: Assignee searches its people once there are more than 8', async () => {
    const people = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal', 'Ivy'].map((name, n) =>
      makeTicket({ key: `PROJ-${String(2000 + n)}`, title: `Ticket ${name}`, assignee: { name, mine: false } }),
    );
    server.use(ticketsHandler({ tickets: [...designTickets, ...people] }));
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');
    const sheet = await openSheet(user);
    const assignee = within(sheet).getByRole('group', { name: 'Assignee' });

    await user.type(within(assignee).getByRole('searchbox', { name: 'Search people' }), 'iv');
    expect(within(assignee).getAllByRole('checkbox')).toHaveLength(1);
    expect(within(assignee).getByRole('checkbox', { name: 'Ivy' })).toBeVisible();

    await user.clear(within(assignee).getByRole('searchbox', { name: 'Search people' }));
    await user.type(within(assignee).getByRole('searchbox', { name: 'Search people' }), 'zz');
    expect(within(assignee).getByText('No one matches')).toBeVisible();
  });

  it('AC-6: Clear filters in the sheet goes back to the defaults and empties the search', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets?assignee=anyone&type=bug' });
    await screen.findByText('2 tickets');
    await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), '1389');
    const sheet = await openSheet(user);

    await user.click(within(sheet).getByRole('button', { name: 'Clear filters' }));

    expect(history.location.search).toBe('');
    expect(within(sheet).getByRole('checkbox', { name: 'Me' })).toBeChecked();
    expect(within(sheet).getByRole('checkbox', { name: 'Bug' })).not.toBeChecked();
    expect(within(sheet).getByRole('status')).toHaveTextContent('6 tickets');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('');
  });
});
