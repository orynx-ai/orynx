import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
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

/**
 * Opens a filter, ticks or unticks these options, and closes it again with Escape. Assignee searches its people,
 * so its options are a list's (`option`); the others are a menu's.
 */
async function tick(
  user: UserEvent,
  name: RegExp,
  options: string[],
  role: 'menuitemcheckbox' | 'option' = 'menuitemcheckbox',
) {
  await user.click(within(toolbar()).getByRole('button', { name }));
  for (const option of options) await user.click(await screen.findByRole(role, { name: option }));
  await user.keyboard('{Escape}');
}

describe('TicketsToolbar (spec 020)', () => {
  it('AC-30: Assignee starts as Me, with Status, Type, Priority and Due beside it', async () => {
    server.use(ticketsHandler());
    await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    expect(filter('Assignee · 1')).toBeVisible();
    for (const name of ['Status', 'Type', 'Priority', 'Due']) expect(filter(name)).toBeVisible();
    expect(within(toolbar()).queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('AC-31: unticking Me shows the whole sprint, and the address keeps it', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await tick(user, /^Assignee/, ['Me'], 'option');

    expect(filter('Assignee')).toHaveFocus();
    expect(count()).toHaveTextContent('9 tickets');
    expect(history.location.search).toBe('?assignee=anyone');
  });

  it('AC-31, AC-32: a reload keeps the filters, and spec 008’s address still works', async () => {
    server.use(ticketsHandler());
    await renderApp({ route: '/tickets?assignee=anyone&type=bug' });

    expect(await screen.findByText('2 tickets')).toBeVisible();
    expect(filter('Assignee')).toBeVisible();
    expect(filter('Type · 1')).toBeVisible();
  });

  it('AC-31: two statuses widen Status, then Type narrows it; Clear filters appears', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets?assignee=anyone' });
    await screen.findByText('9 tickets');

    await tick(user, /^Status/, ['Code Review', 'Done']);
    expect(count()).toHaveTextContent('4 tickets');
    await tick(user, /^Type/, ['Bug']);

    expect(count()).toHaveTextContent('1 ticket');
    expect(new URLSearchParams(history.location.search).get('status')).toBe('Code Review,Done');
    expect(new URLSearchParams(history.location.search).get('type')).toBe('Bug');
    expect(within(toolbar()).getByRole('button', { name: 'Clear filters' })).toBeVisible();
  });

  it('AC-31: Due keeps what is due this week', async () => {
    server.use(ticketsHandler());
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await tick(user, /^Due/, ['This week']);

    expect(count()).toHaveTextContent('3 tickets');
  });

  it('AC-33: Clear filters goes back to Assignee: Me alone, empties the search, and focuses Assignee', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets?assignee=anyone&due=week&type=bug' });
    await screen.findByText('2 tickets');
    await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), '1389');

    await user.click(within(toolbar()).getByRole('button', { name: 'Clear filters' }));

    expect(history.location.search).toBe('');
    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('');
    expect(filter('Assignee · 1')).toHaveFocus();
    expect(count()).toHaveTextContent('6 tickets');
  });
});
