import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { ticketsHandler, ticketsToday } from '../../../test/tickets.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: ticketsToday });
});
afterEach(() => {
  vi.useRealTimers();
});

function toolbar() {
  return screen.getByRole('group', { name: 'Filters' });
}

function filter(name: string) {
  return within(toolbar()).getByRole('button', { name });
}

function count() {
  return within(toolbar()).getByRole('status');
}

describe('TicketsToolbar', () => {
  it('AC-7: turning off Assigned to me shows the whole sprint, and the address keeps it', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(filter('Assigned to me'));

    expect(filter('Assigned to me')).toHaveAttribute('aria-pressed', 'false');
    expect(count()).toHaveTextContent('9 tickets');
    expect(history.location.search).toBe('?assignee=anyone');
  });

  it('AC-7: a reload keeps the filters in the address', async () => {
    server.use(ticketsHandler());
    await renderApp({ route: '/tickets?assignee=anyone&type=bug' });

    expect(await screen.findByText('2 tickets')).toBeVisible();
    expect(filter('Assigned to me')).toHaveAttribute('aria-pressed', 'false');
    expect(filter('Bugs only')).toHaveAttribute('aria-pressed', 'true');
  });

  it('AC-8: Due this week, then Bugs only, add up, and Clear filters appears', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(filter('Due this week'));
    expect(count()).toHaveTextContent('3 tickets');

    await user.click(filter('Bugs only'));
    expect(count()).toHaveTextContent('1 ticket');
    expect(history.location.search).toBe('?due=week&type=bug');
    expect(within(toolbar()).getByRole('button', { name: 'Clear filters' })).toBeVisible();
  });

  it('AC-9: Clear filters goes back to Assigned to me only, empties the search, and focuses Assigned to me', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets?assignee=anyone&due=week&type=bug' });
    await screen.findByText('2 tickets');
    await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), '1389');

    await user.click(within(toolbar()).getByRole('button', { name: 'Clear filters' }));

    expect(history.location.search).toBe('');
    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('');
    expect(filter('Assigned to me')).toHaveAttribute('aria-pressed', 'true');
    expect(filter('Assigned to me')).toHaveFocus();
    expect(count()).toHaveTextContent('6 tickets');
  });
});
