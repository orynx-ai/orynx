import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type Ticket } from '@devhub/contracts';
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

/** The server: Sprint 42, the tickets made so far, and what each POST was sent. */
function orynxServer({ fails = false, slow = false } = {}) {
  const made: Ticket[] = [];
  const sent: unknown[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.tickets), () => HttpResponse.json(makeTickets({ tickets: [...designTickets, ...made] }))),
    http.post(apiUrl(apiRoutes.orynxTickets), async ({ request }) => {
      const body = (await request.json()) as { title: string; status: Ticket['column'] };
      sent.push(body);
      if (slow) await delay(200);
      if (fails) return HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 });
      const key = `ORX-${String(made.length + 1)}`;
      made.push(makeTicket({ key, url: null, title: body.title, column: body.status, status: 'To do' }));
      return HttpResponse.json(makeOrynxTicket({ key, title: body.title, status: body.status }));
    }),
  );
  return { sent };
}

const dialog = () => screen.getByRole('dialog', { name: 'New ticket' });

describe('New ticket (spec 037)', () => {
  it('AC-6: New ticket opens the form with focus in Title, a Task of Medium priority in To do, with no due date', async () => {
    orynxServer();
    const { user } = await renderApp({ route: '/tickets' });

    await user.click(await screen.findByRole('button', { name: 'New ticket' }));

    const form = dialog();
    expect(within(form).getByRole('textbox', { name: 'Title' })).toHaveFocus();
    expect(within(form).getByRole('combobox', { name: 'Type' })).toHaveTextContent('Task');
    expect(within(form).getByRole('combobox', { name: 'Priority' })).toHaveTextContent('Medium');
    expect(within(form).getByRole('combobox', { name: 'Status' })).toHaveTextContent('To do');
    expect(within(form).getByRole('button', { name: 'Due date' })).toHaveAccessibleDescription('Pick a date');
    await expectNoAxeViolations(form);
  });

  it('AC-7: Create ticket makes it, closes the form, shows the ticket in To do, and puts focus back on New ticket', async () => {
    const { sent } = orynxServer();
    const { user } = await renderApp({ route: '/tickets' });
    const opener = await screen.findByRole('button', { name: 'New ticket' });

    await user.click(opener);
    await user.type(within(dialog()).getByRole('textbox', { name: 'Title' }), 'Add bulk archive');
    await user.click(within(dialog()).getByRole('button', { name: 'Create ticket' }));

    expect(await screen.findByRole('article', { name: 'Add bulk archive' })).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    expect(sent).toEqual([
      { title: 'Add bulk archive', description: '', type: 'Task', priority: 'Medium', status: 'to_do', dueDate: null },
    ]);
    expect(screen.getByRole('region', { name: 'To do, 3 tickets' })).toBeVisible();
  });

  it('AC-8: a column’s + is named for its column and starts the ticket there', async () => {
    const { sent } = orynxServer();
    const { user } = await renderApp({ route: '/tickets' });

    await user.click(await screen.findByRole('button', { name: 'New ticket in In progress' }));
    expect(within(dialog()).getByRole('combobox', { name: 'Status' })).toHaveTextContent('In progress');
    await user.type(within(dialog()).getByRole('textbox', { name: 'Title' }), 'Fix the date test{Enter}');

    expect(await screen.findByRole('article', { name: 'Fix the date test' })).toBeVisible();
    expect(sent).toMatchObject([{ title: 'Fix the date test', status: 'in_progress' }]);
  });

  it('AC-9: Tab goes through every field, then Cancel, then Create ticket; Esc closes with nothing made', async () => {
    const { sent } = orynxServer();
    const { user } = await renderApp({ route: '/tickets' });
    const opener = await screen.findByRole('button', { name: 'New ticket' });
    await user.click(opener);

    const stops: string[] = [];
    for (let stop = 0; stop < 7; stop += 1) {
      await user.tab();
      stops.push(document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.id ?? '');
    }
    const names = [
      within(dialog()).getByRole('textbox', { name: 'Description' }),
      within(dialog()).getByRole('combobox', { name: 'Type' }),
      within(dialog()).getByRole('combobox', { name: 'Priority' }),
      within(dialog()).getByRole('combobox', { name: 'Status' }),
      within(dialog()).getByRole('button', { name: 'Due date' }),
      within(dialog()).getByRole('button', { name: 'Cancel' }),
      within(dialog()).getByRole('button', { name: 'Create ticket' }),
    ].map((element) => element.getAttribute('aria-label') ?? element.id);
    expect(stops).toEqual(names);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it('AC-10: an empty or over-long title is refused in Q12d’s words, with focus on it, and nothing is sent', async () => {
    const { sent } = orynxServer();
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));
    const title = within(dialog()).getByRole('textbox', { name: 'Title' });

    await user.type(title, '   ');
    await user.click(within(dialog()).getByRole('button', { name: 'Create ticket' }));
    expect(await within(dialog()).findByText('Add a title.')).toBeVisible();
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute('aria-invalid', 'true');

    await user.clear(title);
    await user.click(title);
    await user.paste('x'.repeat(256));
    await user.click(within(dialog()).getByRole('button', { name: 'Create ticket' }));
    expect(await within(dialog()).findByText('Keep the title to 255 characters.')).toBeVisible();
    expect(sent).toEqual([]);
  });

  it('AC-11: a save that fails keeps the form open with your values, and says so', async () => {
    orynxServer({ fails: true });
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));

    await user.type(within(dialog()).getByRole('textbox', { name: 'Title' }), 'Add bulk archive');
    await user.click(within(dialog()).getByRole('button', { name: 'Create ticket' }));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent("Couldn't save the ticket. Try again.");
    expect(within(dialog()).getByRole('textbox', { name: 'Title' })).toHaveValue('Add bulk archive');
  });

  it('AC-12: a double click makes one ticket, the button waiting while it saves', async () => {
    const { sent } = orynxServer({ slow: true });
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));
    await user.type(within(dialog()).getByRole('textbox', { name: 'Title' }), 'Add bulk archive');

    await user.dblClick(within(dialog()).getByRole('button', { name: 'Create ticket' }));

    expect(within(dialog()).getByRole('button', { name: /Create ticket/ })).toHaveAttribute('aria-disabled', 'true');
    expect(await screen.findByRole('article', { name: 'Add bulk archive' })).toBeVisible();
    expect(sent).toHaveLength(1);
  });

  it('AC-2: with Orynx unticked, there’s no New ticket and no column +', async () => {
    orynxServer();
    await renderApp({ route: '/tickets?source=jira' });

    await screen.findByRole('region', { name: 'To do, 2 tickets' });
    expect(screen.queryByRole('button', { name: 'New ticket' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^New ticket in/ })).toBeNull();
  });

  it('AC-5: with no Orynx tickets, New ticket is there under the empty line', async () => {
    orynxServer();
    const { user } = await renderApp({ route: '/tickets?source=orynx' });

    await screen.findByText('No Orynx tickets yet.');
    // The page bar's, which stays where it is from the first paint, and the empty board's own.
    const buttons = screen.getAllByRole('button', { name: 'New ticket' });
    expect(buttons).toHaveLength(2);
    const below = buttons.at(-1);
    if (below === undefined) throw new Error('No New ticket under the empty line');
    await user.click(below);
    expect(dialog()).toBeVisible();
  });
});
