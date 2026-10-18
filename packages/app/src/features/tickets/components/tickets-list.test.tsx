import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { designTickets, ticketsHandler, ticketsToday } from '../../../test/tickets.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: ticketsToday });
});
afterEach(() => {
  vi.useRealTimers();
});

async function openList(route = '/tickets') {
  const app = await renderApp({ route });
  await app.user.click(await screen.findByRole('button', { name: 'List' }));
  return app;
}

describe('TicketsList', () => {
  it('AC-11: the same tickets in a table, in column then rank order, with Key, Title, Status, Priority, Due and Agent', async () => {
    server.use(ticketsHandler());
    await openList();

    const table = screen.getByRole('table', { name: 'Tickets in Sprint 42' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Key', 'Title', 'Status', 'Priority', 'Due', 'Agent']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      'PROJ-1377',
      'PROJ-1402',
      'PROJ-1423',
      'PROJ-1411',
      'PROJ-1350',
      'PROJ-1340',
    ]);
    const [, , inProgress, , inReview] = rows;
    expect(within(inReview ?? table).getByText('Code Review')).toBeVisible();
    expect(within(inProgress ?? table).getByText('High')).toBeVisible();
    expect(within(inProgress ?? table).getByText('Fri')).toBeVisible();
    expect(within(inProgress ?? table).getByRole('link', { name: 'Needs you' })).toHaveAttribute(
      'href',
      '/sessions/session-1423',
    );
    expect(screen.queryByRole('region', { name: 'Board' })).toBeNull();
  });

  it('AC-13: a row’s title opens the issue in Jira when it has no session', async () => {
    server.use(ticketsHandler());
    const { user, platform } = await openList();

    await user.click(screen.getByRole('link', { name: 'Add empty state to saved searches' }));

    expect(platform.openExternal).toHaveBeenCalledWith('https://your-team.atlassian.net/browse/PROJ-1402');
  });

  it('AC-16: with nothing to show under the filters, it says so', async () => {
    server.use(ticketsHandler());
    const { user } = await openList('/tickets?type=bug&due=week');

    await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'nothing like this');

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('No tickets match these filters')).toBeVisible();
    expect(screen.getByText('Turn one off, or clear them.')).toBeVisible();
  });

  it('AC-16: with none of the sprint assigned to you, it says how to see the whole sprint', async () => {
    server.use(ticketsHandler({ tickets: designTickets.filter((ticket) => ticket.assignee?.mine !== true) }));
    await openList();

    expect(screen.getByText('Nothing assigned to you in Sprint 42')).toBeVisible();
    expect(screen.getByText('Turn off Assigned to me to see the whole sprint.')).toBeVisible();
  });
});
