import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type Ticket } from '@devhub/contracts';
import { makeTickets } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { designTickets, ticketsHandler, ticketsToday } from '../../../test/tickets.ts';
import { ticketCount } from '../ticket-words.ts';

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

  describe('when a sync changes the cards', () => {
    /** Serves `tickets`, which a test changes before telling the page a sync ended. */
    function sprintServer(first: Ticket[]) {
      const state = { tickets: first };
      server.use(http.get(apiUrl(apiRoutes.tickets), () => HttpResponse.json(makeTickets({ tickets: state.tickets }))));
      return {
        async sync(next: Ticket[]) {
          state.tickets = next;
          FakeEventSource.latest().emit({ type: 'inbox.changed' });
          await screen.findByText(ticketCount(next.filter((ticket) => ticket.assignee?.mine === true).length));
        },
      };
    }

    function title(name: string) {
      return screen.getByRole('link', { name });
    }

    const keys = ['PROJ-1423', 'PROJ-1411'] as const;
    const progress = designTickets.filter((ticket) => keys.includes(ticket.key as (typeof keys)[number]));
    const others = designTickets.filter((ticket) => ticket.key === 'PROJ-1377' || ticket.key === 'PROJ-1340');

    it('AC-17: a card that stays keeps its focus while others come and go', async () => {
      const sprint = sprintServer([...others, ...progress]);
      await renderApp({ route: '/tickets' });
      await screen.findByText('4 tickets');
      title('Keyboard navigation for the mega menu').focus();

      await sprint.sync(progress);

      expect(title('Keyboard navigation for the mega menu')).toHaveFocus();
    });

    it('AC-17: a focused card that moves to another column keeps its focus there', async () => {
      const sprint = sprintServer(progress);
      await renderApp({ route: '/tickets' });
      await screen.findByText('2 tickets');
      title('Keyboard navigation for the mega menu').focus();

      const [first, second] = progress;
      if (first === undefined || second === undefined) throw new Error('No tickets');
      await sprint.sync([first, { ...second, column: 'in_review', status: 'Code Review' }]);

      await waitFor(() => {
        expect(title('Keyboard navigation for the mega menu')).toHaveFocus();
      });
      expect(within(column(/^In review/)).getByRole('link', { name: 'Keyboard navigation for the mega menu' })).toBe(
        document.activeElement,
      );
    });

    it('AC-17: a focused card that moves within its column keeps its focus', async () => {
      const sprint = sprintServer(progress);
      await renderApp({ route: '/tickets' });
      await screen.findByText('2 tickets');
      title('Add bulk archive to the content list').focus();

      // A teammate ranks the other ticket above it.
      await sprint.sync([...progress].reverse());

      await waitFor(() => {
        expect(title('Add bulk archive to the content list')).toHaveFocus();
      });
    });

    it('AC-18: focus that left with the window (another tab) still moves on when the card goes', async () => {
      const sprint = sprintServer(progress);
      await renderApp({ route: '/tickets' });
      await screen.findByText('2 tickets');
      const leaving = title('Add bulk archive to the content list');
      leaving.focus();
      // The window loses focus: the page keeps its focused element, and the blur has nothing to go to.
      const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
      leaving.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
      await Promise.resolve();
      hasFocus.mockRestore();

      await sprint.sync(progress.slice(1));

      await waitFor(() => {
        expect(title('Keyboard navigation for the mega menu')).toHaveFocus();
      });
    });

    it('AC-18: a focused card that leaves the sprint hands focus to the next card in its column', async () => {
      const sprint = sprintServer(progress);
      await renderApp({ route: '/tickets' });
      await screen.findByText('2 tickets');
      title('Add bulk archive to the content list').focus();

      await sprint.sync(progress.slice(1));

      await waitFor(() => {
        expect(title('Keyboard navigation for the mega menu')).toHaveFocus();
      });
    });

    it('AC-18: the last card in a column hands focus to the one before it', async () => {
      const sprint = sprintServer(progress);
      await renderApp({ route: '/tickets' });
      await screen.findByText('2 tickets');
      title('Keyboard navigation for the mega menu').focus();

      await sprint.sync(progress.slice(0, 1));

      await waitFor(() => {
        expect(title('Add bulk archive to the content list')).toHaveFocus();
      });
    });

    it('AC-18: the only card in a column hands focus to the board', async () => {
      const [only] = progress;
      if (only === undefined) throw new Error('No tickets');
      const sprint = sprintServer([...others, only]);
      await renderApp({ route: '/tickets' });
      await screen.findByText('3 tickets');
      title('Add bulk archive to the content list').focus();

      await sprint.sync(others);

      await waitFor(() => {
        expect(screen.getByRole('region', { name: 'Board' })).toHaveFocus();
      });
    });
  });
});
