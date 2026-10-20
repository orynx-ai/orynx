import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeOrynxTicket, makeTicket, makeTickets } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { designTickets, ticketsToday } from '../../../test/tickets.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: ticketsToday });
});
afterEach(() => {
  vi.useRealTimers();
});

/** ORX-3 on the board until it's deleted; returns how many deletes the server was sent. */
function serveOrynx({ fails = false } = {}) {
  let there = true;
  let deletes = 0;
  const ticket = makeOrynxTicket();
  server.use(
    http.get(apiUrl(apiRoutes.tickets), () =>
      HttpResponse.json(
        makeTickets({
          tickets: [
            ...designTickets,
            ...(there
              ? [makeTicket({ key: 'ORX-3', url: null, title: ticket.title, column: 'to_do', status: 'To do' })]
              : []),
          ],
        }),
      ),
    ),
    http.get(apiUrl(apiRoutes.orynxTicket), () =>
      HttpResponse.json(there ? { result: 'found', ticket } : { result: 'not_found' }),
    ),
    http.delete(apiUrl(apiRoutes.orynxTicket), () => {
      deletes += 1;
      if (fails) return HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 });
      there = false;
      return HttpResponse.json({ result: 'deleted' });
    }),
  );
  return () => deletes;
}

async function openTicket(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  const card = await screen.findByRole('article', { name: 'Add bulk archive' });
  await user.click(within(card).getByRole('button', { name: 'Add bulk archive' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add bulk archive' });
  await user.click(await within(dialog).findByRole('button', { name: 'Delete ticket' }));
  return screen.getByRole('alertdialog', { name: 'Delete ORX-3?' });
}

describe('Delete ticket (spec 037)', () => {
  it('AC-17: asks first, in Q12f’s words, with Cancel focused; Cancel deletes nothing', async () => {
    const deletes = serveOrynx();
    const { user } = await renderApp({ route: '/tickets' });

    const confirm = await openTicket(user);

    expect(confirm).toHaveAccessibleDescription(
      "It's gone for good, and its key isn't used again. Sessions started from it keep their brief.",
    );
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await expectNoAxeViolations(confirm);
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Add bulk archive' })).toBeVisible();
    expect(deletes()).toBe(0);
  });

  it('AC-18: Delete ticket deletes it, closes the dialog, takes its card away and puts focus on New ticket', async () => {
    const deletes = serveOrynx();
    const { user } = await renderApp({ route: '/tickets' });

    const confirm = await openTicket(user);
    await user.click(within(confirm).getByRole('button', { name: 'Delete ticket' }));

    await waitFor(() => {
      expect(screen.queryByRole('article', { name: 'Add bulk archive' })).toBeNull();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(deletes()).toBe(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'New ticket' })).toHaveFocus();
    });
  });

  it('a delete that fails keeps the confirmation open and says so', async () => {
    serveOrynx({ fails: true });
    const { user } = await renderApp({ route: '/tickets' });

    const confirm = await openTicket(user);
    await user.click(within(confirm).getByRole('button', { name: 'Delete ticket' }));

    expect(await within(confirm).findByRole('alert')).toHaveTextContent("The ticket wasn't deleted. Try again.");
    // Behind the open confirmation, the card is still there.
    expect(screen.getByRole('article', { name: 'Add bulk archive', hidden: true })).toBeInTheDocument();
  });
});
