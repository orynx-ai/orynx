import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTicket } from '@devhub/contracts/testing';
import { server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { ticketsHandler, ticketsToday } from '../../../test/tickets.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: ticketsToday });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('TicketCard', () => {
  it('AC-2, AC-6: a card shows its key, type, title, priority, due date and who it’s assigned to', async () => {
    server.use(ticketsHandler());
    await renderApp({ route: '/tickets' });

    const card = await screen.findByRole('article', { name: 'Search returns archived sites for guest users' });
    expect(within(card).getByText('PROJ-1377')).toBeVisible();
    expect(within(card).getByText('Bug')).toBeVisible();
    expect(within(card).getByText('High')).toBeVisible();
    expect(within(card).getByText('Mon')).toBeVisible();
    expect(within(card).getByText('Due Monday')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Assigned to you' })).toHaveTextContent('RD');
    const done = screen.getByRole('article', { name: 'Lazy-load the people directory' });
    expect(within(done).getByText('14 Oct')).toBeVisible();
  });

  it('AC-7: someone else’s card names them, and nobody’s card has no avatar', async () => {
    server.use(ticketsHandler());
    await renderApp({ route: '/tickets?assignee=anyone' });

    const theirs = await screen.findByRole('article', { name: 'Show read receipts on newsletter analytics' });
    expect(within(theirs).getByRole('img', { name: 'Assigned to Priya Shah' })).toHaveTextContent('PS');
    const nobodys = screen.getByRole('article', { name: 'Rate-limit the export endpoint' });
    expect(within(nobodys).queryByRole('img')).toBeNull();
  });

  it('AC-12: a ticket with a session shows its agent chip, and both it and the title open the session', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets' });

    const card = await screen.findByRole('article', { name: 'Add bulk archive to the content list' });
    expect(within(card).getByRole('link', { name: 'Needs you' })).toHaveAttribute('href', '/sessions/session-1423');
    await user.click(within(card).getByRole('link', { name: 'Add bulk archive to the content list' }));

    expect(history.location.pathname).toBe('/sessions/session-1423');
  });

  it('AC-13: a ticket with no session opens in Jira, and has Ship (spec 011, AC-1; spec 020, AC-16)', async () => {
    server.use(ticketsHandler());
    const { user, platform } = await renderApp({ route: '/tickets' });

    const card = await screen.findByRole('article', { name: 'Search returns archived sites for guest users' });
    const title = within(card).getByRole('link', { name: 'Search returns archived sites for guest users' });
    expect(title).toHaveAttribute('href', 'https://your-team.atlassian.net/browse/PROJ-1377');
    await user.click(title);

    expect(platform.openExternal).toHaveBeenCalledWith('https://your-team.atlassian.net/browse/PROJ-1377');
    expect(within(card).getByRole('button', { name: 'Ship PROJ-1377' })).toBeVisible();
  });

  it('AC-6: an overdue ticket that isn’t Done says so', async () => {
    server.use(ticketsHandler({ tickets: [makeTicket({ key: 'PROJ-9', title: 'Late', dueDate: '2026-10-15' })] }));
    await renderApp({ route: '/tickets' });

    const card = await screen.findByRole('article', { name: 'Late' });
    expect(within(card).getByText('Overdue · 2 d')).toBeVisible();
    expect(within(card).getByText('Overdue by 2 days')).toBeInTheDocument();
  });
});
