import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type OrynxTicket, type TicketDetailAnswer, type UpdateOrynxTicket } from '@devhub/contracts';
import {
  makeOrynxTicket,
  makeSearchIndex,
  makeSearchTicket,
  makeTicket,
  makeTicketDetail,
} from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { designTickets, ticketsHandler, ticketsToday } from '../../../test/tickets.ts';
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

describe('the ticket dialog (spec 022)', () => {
  it('AC-40, AC-41: a card’s title opens the ticket in full, with Open in Jira and Add to composer at its end', async () => {
    serveTicket();
    const { user, platform } = await renderApp({ route: '/tickets' });

    const dialog = await openFromBoard(user, 'Search returns archived sites for guest users');

    expect(within(dialog).getByText('PROJ-1377')).toBeVisible();
    expect(await within(dialog).findByText('Highest')).toBeVisible();
    const fields = within(dialog).getByRole('list', { name: 'Ticket details' });
    expect(
      within(fields)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'StatusTo Do',
      'PriorityHighest',
      'AssigneeRakesh Dhariwal',
      'ReporterNeha K.',
      'Due19 Oct',
      'Labelssearch, guests',
      'Created1 Oct',
      'Updated16 Oct',
    ]);
    expect(within(dialog).getByRole('heading', { name: 'Description' })).toBeVisible();
    expect(within(dialog).getByText('archived', { selector: 'strong' })).toBeVisible();
    const links = within(dialog).getByRole('list', { name: 'Linked issues' });
    expect(within(links).getByRole('listitem')).toHaveTextContent('blocks PROJ-1400 Release 4.2 · In Progress');
    const comments = within(dialog).getByRole('list', { name: 'Comments' });
    expect(within(comments).getByRole('listitem')).toHaveTextContent('Neha K. · 16 OctSeen on staging too.');

    await user.click(within(dialog).getByRole('link', { name: 'Open in Jira' }));
    expect(platform.openExternal).toHaveBeenCalledWith('https://your-team.atlassian.net/browse/PROJ-1377');
    expect(within(dialog).getByRole('button', { name: 'Add to composer' })).toBeVisible();
    await expectNoAxeViolations(dialog);
  });

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

  it('AC-46: Esc or Close closes it, and focus returns to the title', async () => {
    serveTicket();
    const { user } = await renderApp({ route: '/tickets' });
    const title = 'Search returns archived sites for guest users';
    const dialog = await openFromBoard(user, title);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const card = screen.getByRole('article', { name: title });
    expect(within(card).getByRole('button', { name: title })).toHaveFocus();

    await user.click(within(card).getByRole('button', { name: title }));
    await user.click(within(await screen.findByRole('dialog', { name: title })).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(dialog).not.toBeInTheDocument();
  });

  it('AC-48: a ticket with a live session opens the dialog with Open session; its chip still opens the session', async () => {
    serveTicket({
      result: 'found',
      ticket: makeTicketDetail({ session: { id: 'session-1423', state: 'needs_you' } }),
    });
    const { user, history } = await renderApp({ route: '/tickets' });
    const card = await screen.findByRole('article', { name: 'Add bulk archive to the content list' });
    expect(within(card).getByRole('link', { name: 'Needs you' })).toHaveAttribute('href', '/sessions/session-1423');

    const dialog = await openFromBoard(user, 'Add bulk archive to the content list');
    await user.click(within(dialog).getByRole('link', { name: 'Open session' }));
    expect(history.location.pathname).toBe('/sessions/session-1423');
  });

  it('AC-42: Add to composer from Tickets opens Home with the ticket and focus in the box', async () => {
    serveTicket();
    const { user, history } = await renderApp({ route: '/tickets' });
    const dialog = await openFromBoard(user, 'Search returns archived sites for guest users');

    await user.click(within(dialog).getByRole('button', { name: 'Add to composer' }));

    await waitFor(() => {
      expect(history.location.pathname).toBe('/');
    });
    expect(useComposerStore.getState().chips).toEqual([{ kind: 'jira', key: 'PROJ-1377' }]);
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Describe a task for Claude' })).toHaveFocus();
    });
  });

  it('AC-41: a ticket already in the composer says so in place of Add to composer', async () => {
    serveTicket();
    useComposerStore.setState({ chips: [{ kind: 'jira', key: 'PROJ-1377' }] });
    const { user } = await renderApp({ route: '/tickets' });
    const dialog = await openFromBoard(user, 'Search returns archived sites for guest users');
    expect(within(dialog).getByRole('button', { name: 'In the composer' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Add to composer' })).toBeNull();
  });

  it('AC-40: the list view’s titles open it too', async () => {
    serveTicket();
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'List' }));
    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: 'Search returns archived sites for guest users' }));
    expect(await screen.findByRole('dialog', { name: 'Search returns archived sites for guest users' })).toBeVisible();
  });

  it('AC-40: a ticket picked in ⌘K opens it', async () => {
    serveTicket();
    server.use(
      http.get(apiUrl(apiRoutes.search), () =>
        HttpResponse.json(
          makeSearchIndex({
            tickets: [makeSearchTicket({ key: 'PROJ-1377', title: 'Search returns archived sites for guest users' })],
          }),
        ),
      ),
    );
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByRole('article', { name: 'Search returns archived sites for guest users' });
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: /Search/ }));
    await user.type(await screen.findByRole('combobox'), 'PROJ-1377');
    await screen.findByRole('listbox');
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog', { name: 'Search returns archived sites for guest users' })).toBeVisible();
  });
});

describe('an Orynx ticket in the ticket dialog (spec 037)', () => {
  /** ORX-3 on the board and on the server, which takes changes to it; returns what each PATCH was sent. */
  function serveOrynx(
    ticket: OrynxTicket = makeOrynxTicket({ dueDate: '2026-10-24', description: 'Archive **many** at once.' }),
  ) {
    let held = ticket;
    const changes: UpdateOrynxTicket[] = [];
    const row = () =>
      makeTicket({
        key: held.key,
        url: null,
        title: held.title,
        column: held.status,
        status: held.status === 'to_do' ? 'To do' : 'In review',
        type: held.type,
      });
    server.use(
      http.get(apiUrl(apiRoutes.tickets), () =>
        HttpResponse.json({ ...ticketsAnswer(), tickets: [...designTickets, row()] }),
      ),
      http.get(apiUrl(apiRoutes.orynxTicket), () => HttpResponse.json({ result: 'found', ticket: held })),
      http.patch(apiUrl(apiRoutes.orynxTicket), async ({ request }) => {
        const change = (await request.json()) as UpdateOrynxTicket;
        changes.push(change);
        held = { ...held, ...(change as Partial<OrynxTicket>), version: held.version + 1 };
        return HttpResponse.json({ result: 'saved', ticket: held });
      }),
    );
    return changes;
  }

  function ticketsAnswer() {
    return {
      jira: { state: 'synced', at: '2026-10-17T10:00:00.000Z' },
      sprint: { id: 42, name: 'Sprint 42', endsAt: '2026-10-24T17:00:00.000Z', projectKey: 'PROJ' },
      truncated: false,
      choice: { projectKey: null, sprintId: null },
      orynx: { kept: null },
    };
  }

  it('AC-13: shows the Orynx mark, its fields, its Markdown description and who made it, with no Open in Jira', async () => {
    serveOrynx();
    const { user } = await renderApp({ route: '/tickets' });

    const dialog = await openFromBoard(user, 'Add bulk archive');

    expect(within(dialog).getByText('Orynx')).toHaveClass('sr-only');
    expect(within(dialog).getByText('ORX-3')).toBeVisible();
    const details = await within(dialog).findByRole('list', { name: 'Ticket details' });
    expect(within(details).getByRole('combobox', { name: 'Status' })).toHaveTextContent('To do');
    expect(within(details).getByText('Medium')).toBeVisible();
    expect(within(details).getByText('24 Oct')).toBeVisible();
    expect(within(dialog).getByText('Created by you · 20 Oct')).toBeVisible();
    expect(within(dialog).getByText('many').tagName).toBe('STRONG');
    expect(within(dialog).queryByRole('link', { name: /Open in Jira/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Add to composer' })).toBeVisible();
    await expectNoAxeViolations(dialog);
  });

  it('AC-13: a ticket Claude made links to its session', async () => {
    serveOrynx(makeOrynxTicket({ createdBy: { kind: 'session', sessionId: 's-7', title: 'Fix the date test' } }));
    const { user } = await renderApp({ route: '/tickets' });

    const dialog = await openFromBoard(user, 'Add bulk archive');

    expect(await within(dialog).findByRole('link', { name: 'Fix the date test' })).toHaveAttribute(
      'href',
      '/sessions/s-7',
    );
    expect(within(dialog).getByText(/Created by Claude ·/)).toBeVisible();
  });

  it('AC-14: picking a status saves it at once, and the card moves to that column', async () => {
    const changes = serveOrynx();
    const { user } = await renderApp({ route: '/tickets' });
    const dialog = await openFromBoard(user, 'Add bulk archive');

    await user.click(await within(dialog).findByRole('combobox', { name: 'Status' }));
    await user.click(screen.getByRole('option', { name: 'In review' }));

    expect(changes).toEqual([{ status: 'in_review' }]);
    await waitFor(() => {
      expect(within(dialog).getByRole('combobox', { name: 'Status' })).toHaveTextContent('In review');
    });
    await user.keyboard('{Escape}');
    const review = await screen.findByRole('region', { name: /^In review/ });
    expect(within(review).getByRole('article', { name: 'Add bulk archive' })).toBeVisible();
  });

  it('says when the ticket was deleted, with nothing to do with it', async () => {
    serveOrynx();
    server.use(http.get(apiUrl(apiRoutes.orynxTicket), () => HttpResponse.json({ result: 'not_found' })));
    const { user } = await renderApp({ route: '/tickets' });

    const dialog = await openFromBoard(user, 'Add bulk archive');

    expect(await within(dialog).findByText('ORX-3 was deleted.')).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Add to composer' })).toBeNull();
  });
});
