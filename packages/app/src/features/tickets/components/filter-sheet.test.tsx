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

describe('Tickets’ filter sheet (spec 039, the user’s pattern)', () => {
  it('AC-2: Filters opens a list: Project, Sprint, then a row per filter with its count and what it holds', async () => {
    server.use(ticketsHandler());
    const { user } = await renderApp({ route: '/tickets?type=bug' });
    await screen.findByText('1 ticket');

    const sheet = await openSheet(user);

    expect(sheet).toContainElement(document.activeElement as HTMLElement);
    expect(within(sheet).getByRole('button', { name: 'Project, Your sprint' })).toBeVisible();
    expect(within(sheet).getByRole('button', { name: 'Sprint, Sprint 42' })).toBeVisible();
    expect(within(sheet).getByRole('button', { name: 'Source · 2, Jira, Orynx' })).toBeVisible();
    expect(within(sheet).getByRole('button', { name: 'Assignee · 1, Me' })).toBeVisible();
    expect(within(sheet).getByRole('button', { name: 'Status, Any' })).toBeVisible();
    expect(within(sheet).getByRole('button', { name: 'Type · 1, Bug' })).toBeVisible();
    expect(within(sheet).getByRole('button', { name: 'Priority, Any' })).toBeVisible();
    expect(within(sheet).getByRole('button', { name: 'Due, Any' })).toBeVisible();
  });

  it('AC-3: a filter’s page ticks at once: the board, both counts and its row change; Back returns to its row', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets?assignee=anyone' });
    await screen.findByText('9 tickets');
    const sheet = await openSheet(user);

    await user.click(within(sheet).getByRole('button', { name: 'Status, Any' }));
    const page = screen.getByRole('dialog', { name: 'Status' });
    expect(within(page).getAllByRole('checkbox')[0]).toHaveFocus();
    await user.click(within(page).getByRole('checkbox', { name: 'Code Review' }));

    expect(within(page).getByRole('status')).toHaveTextContent('2 tickets');
    expect(new URLSearchParams(history.location.search).get('status')).toBe('Code Review');
    await user.click(within(page).getByRole('button', { name: 'Back to filters' }));
    const list = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(list).getByRole('button', { name: 'Status · 1, Code Review' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(within(toolbar()).getByRole('status')).toHaveTextContent('2 tickets');
    expect(within(toolbar()).getByRole('button', { name: 'Filters · 1' })).toHaveFocus();
  });

  it('AC-4: Close gives focus back to Filters, and the sheet opens on its list again', async () => {
    server.use(ticketsHandler());
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');
    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: /^Due/ }));

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(toolbar()).getByRole('button', { name: 'Filters · 1' })).toHaveFocus();
    expect(await openSheet(user)).toBeVisible();
  });

  it('AC-5: a page with many options searches them, starting in the search box', async () => {
    const people = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal', 'Ivy'].map((name, n) =>
      makeTicket({ key: `PROJ-${String(2000 + n)}`, title: `Ticket ${name}`, assignee: { name, mine: false } }),
    );
    server.use(ticketsHandler({ tickets: [...designTickets, ...people] }));
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');
    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: /^Assignee/ }));
    const page = screen.getByRole('dialog', { name: 'Assignee' });
    const search = within(page).getByRole('searchbox', { name: 'Search people' });
    expect(search).toHaveFocus();

    await user.type(search, 'iv');
    expect(within(page).getAllByRole('checkbox')).toHaveLength(1);
    expect(within(page).getByRole('checkbox', { name: 'Ivy' })).toBeVisible();

    await user.clear(search);
    await user.type(search, 'zz');
    expect(within(page).getByText('No one matches')).toBeVisible();
  });

  it('AC-6: Clear filters in the sheet goes back to the defaults and empties the search', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets?assignee=anyone&type=bug' });
    await screen.findByText('2 tickets');
    await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), '1389');
    const sheet = await openSheet(user);

    await user.click(within(sheet).getByRole('button', { name: 'Clear filters' }));

    expect(history.location.search).toBe('');
    expect(within(sheet).getByRole('button', { name: 'Assignee · 1, Me' })).toBeVisible();
    expect(within(sheet).getByRole('button', { name: 'Type, Any' })).toBeVisible();
    expect(within(sheet).getByRole('status')).toHaveTextContent('6 tickets');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('');
  });
});
