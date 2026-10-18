import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
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
  vi.unstubAllGlobals();
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
    expect(screen.getByRole('heading', { level: 1, name: 'Tickets' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Open Settings' }));

    expect(history.location.pathname).toBe('/settings/connections');
  });

  it('AC-1, AC-31: the page bar names the sprint, and the toolbar has the filters and the count', async () => {
    server.use(ticketsHandler());
    await renderApp({ route: '/tickets' });
    // From 768 px the search field sits in the page bar, as the design draws it.
    expect(await screen.findByRole('banner')).toContainElement(
      screen.getByRole('searchbox', { name: 'Search tickets' }),
    );

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
    expect(filter('Assignee · 1')).toBeVisible();
    expect(filter('Due')).toBeVisible();
    expect(count()).toHaveTextContent('6 tickets');
    expect(within(toolbar()).queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('AC-30: Tab goes through the search, Board / List, Project and Sprint (spec 020), the filters, Clear filters, the board, then each card', async () => {
    server.use(ticketsHandler());
    const { user } = await renderApp({ route: '/tickets?type=bug' });
    await screen.findByText('1 ticket');
    within(screen.getByRole('navigation', { name: 'Breadcrumb' }))
      .getByRole('link', { name: 'Tickets' })
      .focus();
    const stops: string[] = [];

    for (let stop = 0; stop < 13; stop += 1) {
      await user.tab();
      const focused = document.activeElement;
      stops.push(focused?.getAttribute('aria-label') ?? focused?.textContent.trim() ?? '');
    }

    expect(stops).toEqual([
      'Search tickets',
      'Board',
      'List',
      'Project Your sprint',
      'Sprint Sprint 42',
      'Assignee · 1',
      'Status',
      'Type · 1',
      'Priority',
      'Due',
      'Clear filters',
      'Board',
      'Search returns archived sites for guest users',
    ]);
    expect(document.activeElement).toHaveAttribute('href', 'https://your-team.atlassian.net/browse/PROJ-1377');
  });

  it('AC-20: the Tickets crumb looks the same whether or not its link leads to this very page', async () => {
    server.use(ticketsHandler());
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');
    const crumb = () =>
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Tickets' });
    const onThisPage = crumb().className;

    await user.click(filter('Assignee · 1'));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Me' }));
    await user.keyboard('{Escape}');

    expect(crumb().className).toBe(onThisPage);
    expect(onThisPage).not.toBe('active');
    expect(crumb()).not.toHaveAttribute('aria-current');
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

  describe('states', () => {
    it('AC-20: before the first sync, the columns show their names and loading cards, and nothing counts yet', async () => {
      server.use(ticketsHandler({ jira: { state: 'syncing' }, sprint: null, tickets: [] }));
      await renderApp({ route: '/tickets' });

      const board = await screen.findByRole('region', { name: 'Board' });
      const columns = within(board).getAllByRole('region');
      expect(columns.map((column) => column.getAttribute('aria-busy'))).toEqual(['true', 'true', 'true', 'true']);
      expect(within(board).getByRole('heading', { name: 'In review' })).toBeVisible();
      expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Tickets')).toBeVisible();
      expect(filter('Assignee · 1')).toBeVisible();
      expect(count()).toBeEmptyDOMElement();
    });

    it('AC-20: the list loads as rows the size of real ones', async () => {
      server.use(
        http.get(apiUrl(apiRoutes.tickets), async () => {
          await delay('infinite');
          return HttpResponse.json({});
        }),
      );
      const { user } = await renderApp({ route: '/tickets' });

      await user.click(screen.getByRole('button', { name: 'List' }));

      expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByRole('columnheader', { name: 'Title' })).toBeVisible();
    });

    it('AC-22: no active sprint holds a ticket of yours', async () => {
      server.use(ticketsHandler({ sprint: null, tickets: [] }));
      await renderApp({ route: '/tickets' });

      expect(await screen.findByText('None of your tickets is in an active sprint')).toBeVisible();
      expect(
        screen.getByText('Your sprint shows up here once Jira starts one with a ticket assigned to you.'),
      ).toBeVisible();
      expect(screen.queryByRole('group', { name: 'Filters' })).toBeNull();
      expect(screen.queryByRole('searchbox')).toBeNull();
    });

    it('AC-23: Jira didn’t answer, so the last sprint stays under a quiet line that says how old it is', async () => {
      server.use(
        ticketsHandler({
          jira: { state: 'failed', problem: { kind: 'no_answer' }, lastSyncedAt: '2026-10-17T08:48:00.000Z' },
        }),
      );
      await renderApp({ route: '/tickets' });

      expect(await screen.findByText(/^Jira didn't answer\. These are from \d+ (min|h) ago\.$/)).toBeVisible();
      expect(screen.getByRole('region', { name: 'To do, 2 tickets' })).toBeVisible();
    });

    it('AC-24: Jira refused the saved token, and the line links to Settings › Connections', async () => {
      server.use(
        ticketsHandler({ jira: { state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: null }, sprint: null }),
      );
      const { user, history } = await renderApp({ route: '/tickets' });

      expect(await screen.findByText(/Jira refused the saved token\./)).toBeVisible();
      await user.click(screen.getByRole('link', { name: 'Reconnect it in Settings' }));

      expect(history.location.pathname).toBe('/settings/connections');
    });

    it.each([
      [{ kind: 'rejected' } as const, /^Jira refused the saved token\./],
      [
        { kind: 'sign_in_needed', site: 'your-team.atlassian.net' } as const,
        /^Jira wants you to sign in on the web first\. Sign in at your-team\.atlassian\.net/,
      ],
    ])('AC-24: Jira says %o, and the last tickets stay under its line', async (problem, line) => {
      server.use(ticketsHandler({ jira: { state: 'failed', problem, lastSyncedAt: '2026-10-17T08:48:00.000Z' } }));
      await renderApp({ route: '/tickets' });

      expect(await screen.findByText(line)).toBeVisible();
      expect(screen.getByRole('region', { name: 'To do, 2 tickets' })).toBeVisible();
      expect(count()).toHaveTextContent('6 tickets');
    });

    it('AC-25: the local server stops answering, then Try again loads the sprint', async () => {
      let answer: 'down' | 'up' = 'down';
      server.use(
        http.get(apiUrl(apiRoutes.tickets), () =>
          answer === 'down' ? HttpResponse.error() : HttpResponse.json(makeTickets({ tickets: designTickets })),
        ),
      );
      const { user } = await renderApp({ route: '/tickets' });

      expect(await screen.findByText("Couldn't load the sprint")).toBeVisible();
      expect(screen.getByRole('heading', { level: 1, name: 'Tickets' })).toBeInTheDocument();
      expect(screen.getByText('Check that Orynx is still running, then try again.')).toBeVisible();
      expect(screen.getByRole('navigation', { name: 'Main' })).toBeVisible();

      answer = 'up';
      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('region', { name: 'To do, 2 tickets' })).toBeVisible();
    });

    it('AC-26: a sprint DevHub cut short says so', async () => {
      server.use(ticketsHandler({ truncated: true }));
      await renderApp({ route: '/tickets' });

      expect(await screen.findByText("Showing the first 300 tickets in Sprint 42, in Jira's order.")).toBeVisible();
    });
  });

  it('AC-32: under 768 px the search field moves from the page bar to the start of the toolbar', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    server.use(ticketsHandler());
    await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    expect(within(toolbar()).getByRole('searchbox', { name: 'Search tickets' })).toBeVisible();
    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
  });
});
