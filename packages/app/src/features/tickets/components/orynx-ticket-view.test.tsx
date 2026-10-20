import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type OrynxTicket, type UpdateOrynxTicket } from '@devhub/contracts';
import { makeOrynxTicket, makeTicket } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { designTickets, ticketsToday } from '../../../test/tickets.ts';
import { initialComposer, useComposerStore } from '../../home/store.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: ticketsToday });
  useComposerStore.setState(initialComposer);
});
afterEach(() => {
  vi.useRealTimers();
});

async function openFromBoard(user: Awaited<ReturnType<typeof renderApp>>['user'], title: string) {
  const card = await screen.findByRole('article', { name: title });
  await user.click(within(card).getByRole('button', { name: title }));
  return screen.findByRole('dialog', { name: title });
}

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

  it('AC-15: Edit turns the dialog into the form, filled in; Save changes saves it with the version it opened at', async () => {
    const changes = serveOrynx();
    const { user } = await renderApp({ route: '/tickets' });
    const view = await openFromBoard(user, 'Add bulk archive');

    await user.click(await within(view).findByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('dialog', { name: 'Edit ORX-3' });
    expect(within(form).getByRole('textbox', { name: 'Title' })).toHaveValue('Add bulk archive');
    await user.click(within(form).getByRole('combobox', { name: 'Priority' }));
    await user.click(screen.getByRole('option', { name: 'High' }));
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));

    const back = await screen.findByRole('dialog', { name: 'Add bulk archive' });
    expect(await within(back).findByText('High')).toBeVisible();
    expect(changes).toEqual([
      {
        title: 'Add bulk archive',
        description: 'Archive **many** at once.',
        type: 'Task',
        priority: 'High',
        status: 'to_do',
        dueDate: '2026-10-24',
        version: 1,
      },
    ]);
    expect(within(back).getByRole('button', { name: 'Edit' })).toHaveFocus();
  });

  it('AC-16: a ticket someone saved first keeps your edits and says so; Save changes again writes over it', async () => {
    serveOrynx();
    const sent: UpdateOrynxTicket[] = [];
    let first = true;
    server.use(
      http.patch(apiUrl(apiRoutes.orynxTicket), async ({ request }) => {
        const change = (await request.json()) as UpdateOrynxTicket;
        sent.push(change);
        const theirs = makeOrynxTicket({ status: 'in_review', version: 2 });
        if (first) {
          first = false;
          return HttpResponse.json({ result: 'changed', ticket: theirs });
        }
        return HttpResponse.json({ result: 'saved', ticket: { ...theirs, title: 'Archive it all', version: 3 } });
      }),
    );
    const { user } = await renderApp({ route: '/tickets' });
    const view = await openFromBoard(user, 'Add bulk archive');
    await user.click(await within(view).findByRole('button', { name: 'Edit' }));
    const form = screen.getByRole('dialog', { name: 'Edit ORX-3' });
    const title = within(form).getByRole('textbox', { name: 'Title' });

    await user.clear(title);
    await user.type(title, 'Archive it all');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'ORX-3 changed after you opened it. Save changes again to keep your version.',
    );
    expect(title).toHaveValue('Archive it all');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));

    await screen.findByRole('dialog', { name: /Add bulk archive|Archive it all/ });
    expect(sent.map((change) => change.version)).toEqual([1, 2]);
  });

  it('Cancel leaves the ticket as it was', async () => {
    const changes = serveOrynx();
    const { user } = await renderApp({ route: '/tickets' });
    const view = await openFromBoard(user, 'Add bulk archive');

    await user.click(await within(view).findByRole('button', { name: 'Edit' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Edit ORX-3' })).getByRole('button', { name: 'Cancel' }),
    );

    expect(await screen.findByRole('dialog', { name: 'Add bulk archive' })).toBeVisible();
    expect(changes).toEqual([]);
  });
});
