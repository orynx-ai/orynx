import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeTickets } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../test/fake-event-source.ts';
import { apiUrl, server } from '../../test/msw.ts';
import { renderApp } from '../../test/render.tsx';
import { designTickets, ticketsHandler, ticketsToday } from '../../test/tickets.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: ticketsToday });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Counts the page's reads of GET /api/tickets. */
function ticketReads(): () => number {
  let reads = 0;
  server.events.on('request:start', ({ request }) => {
    if (request.url === apiUrl(apiRoutes.tickets)) reads += 1;
  });
  return () => reads;
}

function toolbar() {
  return screen.getByRole('group', { name: 'Filters' });
}

function filter(name: string) {
  return within(toolbar()).getByRole('button', { name });
}

function count() {
  return within(toolbar()).getByRole('status');
}

describe('TicketsScreen', () => {
  it('says Jira is not connected and where to connect it', async () => {
    const { user, history } = await renderApp({ route: '/tickets' });

    expect(await screen.findByText('Jira is not connected')).toBeVisible();
    expect(screen.getByText('Connect it in Settings to see your sprint.')).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Open Settings' }));

    expect(history.location.pathname).toBe('/settings/connections');
  });

  it('AC-1, AC-31: the page bar names the sprint, and the toolbar has the filters and the count', async () => {
    server.use(ticketsHandler());
    await renderApp({ route: '/tickets' });

    expect(await screen.findByRole('heading', { level: 1, name: 'Sprint 42 tickets' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Tickets' })).toHaveAttribute('href', '/tickets');
    expect(within(crumbs).getByRole('link', { name: 'Tickets' })).not.toHaveAttribute('aria-current');
    expect(within(crumbs).getByText('Sprint 42')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('PROJ · ends 24 Oct')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toBeVisible();
    const view = screen.getByRole('group', { name: 'View' });
    expect(within(view).getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(view).getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'false');
    expect(filter('Assigned to me')).toHaveAttribute('aria-pressed', 'true');
    expect(filter('Due this week')).toHaveAttribute('aria-pressed', 'false');
    expect(filter('Bugs only')).toHaveAttribute('aria-pressed', 'false');
    expect(count()).toHaveTextContent('6 tickets');
    expect(within(toolbar()).queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('AC-10: the search narrows the tickets by key or title as you type, without asking the server', async () => {
    server.use(ticketsHandler());
    const reads = ticketReads();
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');
    const before = reads();
    const search = screen.getByRole('searchbox', { name: 'Search tickets' });

    await user.type(search, 'BULK arch');
    expect(count()).toHaveTextContent('1 ticket');
    expect(within(toolbar()).getByRole('button', { name: 'Clear filters' })).toBeVisible();

    await user.clear(search);
    await user.type(search, '13');
    expect(count()).toHaveTextContent('3 tickets');
    expect(reads()).toBe(before);
  });

  it('AC-11: List stays picked after a reload, on this computer', async () => {
    server.use(ticketsHandler());
    const first = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await first.user.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    first.unmount();

    await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  });

  it.each(['inbox.changed', 'status.changed', 'sessions.changed'] as const)(
    'AC-17: the tickets refresh when the server says %s',
    async (type) => {
      let tickets = designTickets.slice(0, 2);
      server.use(http.get(apiUrl(apiRoutes.tickets), () => HttpResponse.json(makeTickets({ tickets }))));
      await renderApp({ route: '/tickets' });
      await screen.findByText('2 tickets');

      tickets = designTickets;
      FakeEventSource.latest().emit({ type });

      await waitFor(() => {
        expect(count()).toHaveTextContent('6 tickets');
      });
    },
  );
});
