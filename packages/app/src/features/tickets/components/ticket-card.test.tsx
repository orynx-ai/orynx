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

  it('AC-1 (spec 037, Q10): an Orynx ticket’s card has the Orynx mark before its key, named Orynx; Jira’s has none', async () => {
    const orynx = makeTicket({ key: 'ORX-3', url: null, title: 'Archive in bulk', status: 'To do', column: 'to_do' });
    server.use(ticketsHandler({ tickets: [makeTicket({ key: 'PROJ-1423' }), orynx] }));
    await renderApp({ route: '/tickets' });

    const card = await screen.findByRole('article', { name: 'Archive in bulk' });
    expect(within(card).getByText('ORX-3').previousElementSibling).toHaveTextContent('Orynx');
    expect(within(card).getByText('ORX-3').previousElementSibling).toHaveAttribute('title', 'Orynx');
    const jira = screen.getByRole('article', { name: 'Add bulk archive to the content list' });
    expect(within(jira).queryByText('Orynx')).toBeNull();
  });

  it('AC-7: someone else’s card names them, and nobody’s card has no avatar', async () => {
    server.use(ticketsHandler());
    await renderApp({ route: '/tickets?assignee=anyone' });

    const theirs = await screen.findByRole('article', { name: 'Show read receipts on newsletter analytics' });
    expect(within(theirs).getByRole('img', { name: 'Assigned to Priya Shah' })).toHaveTextContent('PS');
    const nobodys = screen.getByRole('article', { name: 'Rate-limit the export endpoint' });
    expect(within(nobodys).queryByRole('img')).toBeNull();
  });

  it('AC-12, 022 AC-48: a ticket with a session shows its agent chip, which opens the session', async () => {
    server.use(ticketsHandler());
    const { user, history } = await renderApp({ route: '/tickets' });

    const card = await screen.findByRole('article', { name: 'Add bulk archive to the content list' });
    await user.click(within(card).getByRole('link', { name: 'Needs you' }));

    expect(history.location.pathname).toBe('/sessions/session-1423');
  });

  it('022 AC-40: a ticket’s title opens the ticket dialog, not Jira, and a card with no session has Ship', async () => {
    server.use(ticketsHandler());
    const { user, platform } = await renderApp({ route: '/tickets' });

    const card = await screen.findByRole('article', { name: 'Search returns archived sites for guest users' });
    expect(within(card).getByRole('button', { name: 'Ship PROJ-1377' })).toBeVisible();
    await user.click(within(card).getByRole('button', { name: 'Search returns archived sites for guest users' }));

    expect(await screen.findByRole('dialog', { name: 'Search returns archived sites for guest users' })).toBeVisible();
    expect(platform.openExternal).not.toHaveBeenCalled();
  });

  it('AC-6: an overdue ticket that isn’t Done says so', async () => {
    server.use(ticketsHandler({ tickets: [makeTicket({ key: 'PROJ-9', title: 'Late', dueDate: '2026-10-15' })] }));
    await renderApp({ route: '/tickets' });

    const card = await screen.findByRole('article', { name: 'Late' });
    expect(within(card).getByText('Overdue · 2 d')).toBeVisible();
    expect(within(card).getByText('Overdue by 2 days')).toBeInTheDocument();
  });
});
