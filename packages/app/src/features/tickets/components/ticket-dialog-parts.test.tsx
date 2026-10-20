import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type TicketDetailAnswer } from '@devhub/contracts';
import { makeTicketDetail } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { ticketsHandler, ticketsToday } from '../../../test/tickets.ts';
import { initialComposer, useComposerStore } from '../../home/store.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: ticketsToday });
  useComposerStore.setState(initialComposer);
});
afterEach(() => {
  vi.useRealTimers();
});

const full = makeTicketDetail({
  key: 'PROJ-1377',
  url: 'https://your-team.atlassian.net/browse/PROJ-1377',
  title: 'Search returns archived sites for guest users',
  type: 'Bug',
  status: { name: 'To Do', column: 'to_do' },
  priority: 'Highest',
  assignee: 'Rakesh Dhariwal',
  reporter: 'Neha K.',
  dueDate: '2026-10-19',
  labels: ['search', 'guests'],
  created: '2026-10-01T08:00:00.000Z',
  updated: '2026-10-16T09:30:00.000Z',
  description: 'Guests see **archived** sites in search.',
  links: [{ relation: 'blocks', key: 'PROJ-1400', title: 'Release 4.2', status: 'In Progress' }],
  comments: [{ author: 'Neha K.', created: '2026-10-16T09:30:00.000Z', body: 'Seen on staging too.' }],
});

/** The ticket read, answering `answer`, or never when `slow`; returns how many times it was asked. */
function serveTicket(answer: TicketDetailAnswer | 'slow' = { result: 'found', ticket: full }) {
  let reads = 0;
  server.use(
    ticketsHandler(),
    http.get(apiUrl(apiRoutes.ticket), async () => {
      reads += 1;
      if (answer === 'slow') await delay('infinite');
      return HttpResponse.json(answer);
    }),
  );
  return () => reads;
}

async function openFromBoard(user: Awaited<ReturnType<typeof renderApp>>['user'], title: string) {
  const card = await screen.findByRole('article', { name: title });
  await user.click(within(card).getByRole('button', { name: title }));
  return screen.findByRole('dialog', { name: title });
}

describe('the ticket dialog’s parts: loading, problems and empty sections (spec 022)', () => {
  it('AC-43: while Jira answers, the key, type and title show, the rest is loading and the actions are there', async () => {
    serveTicket('slow');
    const { user } = await renderApp({ route: '/tickets' });

    const dialog = await openFromBoard(user, 'Search returns archived sites for guest users');

    expect(within(dialog).getByText('PROJ-1377')).toBeVisible();
    expect(within(dialog).getByText('Bug')).toBeVisible();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Loading the ticket…');
    expect(within(dialog).getByRole('link', { name: 'Open in Jira' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Add to composer' })).toBeVisible();
  });

  it('AC-44: says why there’s no ticket, and Try again asks Jira again', async () => {
    const reads = serveTicket({ result: 'unreachable' });
    const { user } = await renderApp({ route: '/tickets' });

    const dialog = await openFromBoard(user, 'Search returns archived sites for guest users');

    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Jira didn't answer.");
    expect(within(dialog).getByRole('link', { name: 'Open in Jira' })).toBeVisible();
    server.use(http.get(apiUrl(apiRoutes.ticket), () => HttpResponse.json({ result: 'found', ticket: full })));
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByText('Highest')).toBeVisible();
    expect(reads()).toBe(1);
  });

  it('AC-44: a ticket Jira can’t find says so', async () => {
    serveTicket({ result: 'not_found' });
    const { user } = await renderApp({ route: '/tickets' });
    const dialog = await openFromBoard(user, 'Search returns archived sites for guest users');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Jira can't find PROJ-1377, or you can't see it.",
    );
  });

  it('AC-45: a ticket with no description, links or comments says so for each', async () => {
    serveTicket({
      result: 'found',
      ticket: { ...full, description: null, links: [], comments: [], labels: [], reporter: null, assignee: null },
    });
    const { user } = await renderApp({ route: '/tickets' });
    const dialog = await openFromBoard(user, 'Search returns archived sites for guest users');

    expect(await within(dialog).findByText('This ticket has no description.')).toBeVisible();
    expect(within(dialog).getByText('No linked issues.')).toBeVisible();
    expect(within(dialog).getByText('No comments.')).toBeVisible();
    expect(within(dialog).getByText('Unassigned')).toBeVisible();
  });
});
