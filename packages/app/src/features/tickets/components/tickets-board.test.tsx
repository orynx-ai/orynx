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

function column(name: RegExp) {
  return within(screen.getByRole('region', { name: 'Board' })).getByRole('region', { name });
}

function cardKeys(region: HTMLElement) {
  return within(region)
    .queryAllByRole('article')
    .map((card) => within(card).getByText(/^PROJ-\d+$/).textContent);
}

describe('TicketsBoard', () => {
  it('AC-1: four columns, each with its count, and your tickets in Jira’s rank order', async () => {
    server.use(ticketsHandler());
    await renderApp({ route: '/tickets' });

    expect(await screen.findByRole('region', { name: 'To do, 2 tickets' })).toBeVisible();
    expect(cardKeys(column(/^To do/))).toEqual(['PROJ-1377', 'PROJ-1402']);
    expect(cardKeys(column(/^In progress/))).toEqual(['PROJ-1423', 'PROJ-1411']);
    expect(cardKeys(column(/^In review/))).toEqual(['PROJ-1350']);
    expect(cardKeys(column(/^Done/))).toEqual(['PROJ-1340']);
    expect(within(column(/^In progress/)).getByRole('heading', { level: 2, name: 'In progress' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'In review, 1 ticket' })).toBeVisible();
  });

  it('AC-14: a column with none of your tickets says why, with its line', async () => {
    server.use(ticketsHandler({ tickets: designTickets.filter((ticket) => ticket.column !== 'in_review') }));
    await renderApp({ route: '/tickets' });

    const review = await screen.findByRole('region', { name: 'In review, 0 tickets' });
    expect(within(review).getByText('Nothing in review')).toBeVisible();
    expect(within(review).getByText('Tickets move here when you open a pull request.')).toBeVisible();
  });

  it('AC-15: a column the filters emptied says so', async () => {
    server.use(ticketsHandler());
    await renderApp({ route: '/tickets?type=bug' });

    const progress = await screen.findByRole('region', { name: 'In progress, 0 tickets' });
    expect(within(progress).getByText('No tickets match these filters')).toBeVisible();
    expect(cardKeys(column(/^To do/))).toEqual(['PROJ-1377']);
  });
});
