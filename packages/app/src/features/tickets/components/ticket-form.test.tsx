import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type Ticket } from '@devhub/contracts';
import { makeJiraTicketTypes, makeOrynxTicket, makeTicket, makeTickets } from '@devhub/contracts/testing';
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

/**
 * The server: Sprint 42, the tickets made so far, and what each POST was sent. The sprint spans projects, so New
 * ticket offers Orynx alone (spec 019, AC-7), as spec 037 drew it.
 */
function orynxServer({ fails = false, slow = false } = {}) {
  const made: Ticket[] = [];
  const sent: unknown[] = [];
  const sprint = { id: 42, name: 'Sprint 42', endsAt: '2026-10-24T17:00:00.000Z', projectKey: null };
  server.use(
    http.get(apiUrl(apiRoutes.tickets), () =>
      HttpResponse.json(makeTickets({ sprint, tickets: [...designTickets, ...made] })),
    ),
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

describe('New ticket in Jira (spec 019)', () => {
  /** Sprint 42 of PROJ on the board, and PROJ's types as `types` says, slow or failing when asked. */
  function jiraServer({ types = makeJiraTicketTypes(), slow = false, fails = false } = {}) {
    let asked = 0;
    server.use(
      http.get(apiUrl(apiRoutes.tickets), () => HttpResponse.json(makeTickets({ tickets: designTickets }))),
      http.get(apiUrl(apiRoutes.jiraTicketTypes), async () => {
        asked += 1;
        if (slow) await delay(100);
        if (fails && asked === 1) {
          return HttpResponse.json({ code: 'integration_unreachable', message: 'No.' }, { status: 502 });
        }
        return HttpResponse.json(types);
      }),
    );
  }

  const saveIn = () => within(dialog()).getByRole('group', { name: 'Save in' });

  it('AC-1, AC-14, AC-15: a column’s + opens on Jira’s PROJ, saying where the ticket goes, in that column', async () => {
    jiraServer();
    const { user } = await renderApp({ route: '/tickets' });

    await user.click(await screen.findByRole('button', { name: 'New ticket in In progress' }));

    expect(dialog()).toHaveAccessibleDescription('Goes to Jira’s PROJ project, in Sprint 42.');
    expect(within(dialog()).getByRole('textbox', { name: 'Title' })).toHaveFocus();
    expect(within(saveIn()).getByRole('button', { name: 'Jira · PROJ' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(saveIn()).getByRole('button', { name: 'Orynx' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog()).getByRole('combobox', { name: 'Status' })).toHaveTextContent('In progress');
    expect(await within(dialog()).findByRole('combobox', { name: 'Type' })).toHaveTextContent('Task');
    await expectNoAxeViolations(dialog());
  });

  it('AC-14: Save in’s two buttons are Tab stops before Title, Enter picks one, and Esc closes with nothing made', async () => {
    jiraServer();
    const { user } = await renderApp({ route: '/tickets' });
    const opener = await screen.findByRole('button', { name: 'New ticket' });
    await user.click(opener);
    expect(await within(dialog()).findByRole('combobox', { name: 'Type' })).toHaveTextContent('Task');

    await user.tab({ shift: true });
    expect(within(saveIn()).getByRole('button', { name: 'Orynx' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(saveIn()).getByRole('button', { name: 'Jira · PROJ' })).toHaveFocus();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(within(saveIn()).getByRole('button', { name: 'Orynx' })).toHaveAttribute('aria-pressed', 'true');
    expect(dialog()).toHaveAccessibleDescription('Saved in Orynx on this computer. It isn’t added to Jira.');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('AC-2: Type and Priority wait as skeletons for PROJ’s types, and Create ticket waits with them', async () => {
    jiraServer({ slow: true });
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));

    expect(within(dialog()).queryByRole('combobox', { name: 'Type' })).toBeNull();
    expect(within(dialog()).getByRole('button', { name: 'Create ticket' })).toBeDisabled();

    expect(await within(dialog()).findByRole('combobox', { name: 'Type' })).toHaveTextContent('Task');
    expect(within(dialog()).getByRole('combobox', { name: 'Priority' })).toHaveTextContent('Medium');
    expect(within(dialog()).getByRole('button', { name: 'Create ticket' })).toBeEnabled();
    await user.click(within(dialog()).getByRole('combobox', { name: 'Type' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Task', 'Story', 'Bug']);
  });

  it('AC-4: a type’s own priorities and due date: a pick it allows stays, else Medium, else its default', async () => {
    const five = makeJiraTicketTypes().types[0]?.priorities ?? [];
    jiraServer({
      types: makeJiraTicketTypes({
        types: [
          { id: '10001', name: 'Task', priorities: five, defaultPriorityId: '3', dueDate: true },
          { id: '10002', name: 'Story', priorities: five.slice(0, 3), defaultPriorityId: '3', dueDate: false },
          {
            id: '10009',
            name: 'Incident',
            priorities: [
              { id: '10', name: 'P1' },
              { id: '11', name: 'P2' },
            ],
            defaultPriorityId: '11',
            dueDate: true,
          },
        ],
      }),
    });
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));
    const pick = async (name: 'Type' | 'Priority', option: string) => {
      await user.click(await within(dialog()).findByRole('combobox', { name }));
      await user.click(screen.getByRole('option', { name: option }));
    };

    await pick('Priority', 'High');
    await pick('Type', 'Story');
    expect(within(dialog()).getByRole('combobox', { name: 'Priority' })).toHaveTextContent('High');
    expect(within(dialog()).queryByRole('button', { name: 'Due date' })).toBeNull();

    await pick('Type', 'Incident');
    expect(within(dialog()).getByRole('combobox', { name: 'Priority' })).toHaveTextContent('P2');
    expect(within(dialog()).getByRole('button', { name: 'Due date' })).toBeVisible();
  });

  it('AC-5: switching to Orynx keeps the title and description, and says it stays in Orynx; back keeps them too', async () => {
    jiraServer();
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));
    await user.type(within(dialog()).getByRole('textbox', { name: 'Title' }), 'Add bulk archive');
    await user.type(within(dialog()).getByRole('textbox', { name: 'Description' }), 'Several at once.');

    await user.click(within(saveIn()).getByRole('button', { name: 'Orynx' }));

    expect(dialog()).toHaveAccessibleDescription('Saved in Orynx on this computer. It isn’t added to Jira.');
    expect(within(dialog()).getByRole('textbox', { name: 'Title' })).toHaveValue('Add bulk archive');
    expect(within(dialog()).getByRole('combobox', { name: 'Type' })).toHaveTextContent('Task');

    await user.click(within(saveIn()).getByRole('button', { name: 'Jira · PROJ' }));
    expect(dialog()).toHaveAccessibleDescription('Goes to Jira’s PROJ project, in Sprint 42.');
    expect(within(dialog()).getByRole('textbox', { name: 'Description' })).toHaveValue('Several at once.');
  });

  it('AC-6: with No sprint picked for PROJ, the ticket goes in no sprint', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.tickets), () =>
        HttpResponse.json(
          makeTickets({ sprint: null, choice: { projectKey: 'PROJ', sprintId: 'none' }, tickets: designTickets }),
        ),
      ),
    );
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'New ticket in To do' }));

    expect(dialog()).toHaveAccessibleDescription('Goes to Jira’s PROJ project, with no sprint.');
  });

  it('AC-7: with only Orynx in Source, there’s no Save in and the ticket stays in Orynx', async () => {
    jiraServer();
    const { user } = await renderApp({ route: '/tickets?source=orynx' });
    await user.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'New ticket' }));

    expect(within(dialog()).queryByRole('group', { name: 'Save in' })).toBeNull();
    expect(dialog()).toHaveAccessibleDescription('Saved in Orynx on this computer. It isn’t added to Jira.');
  });

  it('AC-7: with No sprint and no project, there’s nowhere in Jira to put it, so no Save in', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.tickets), () =>
        HttpResponse.json(
          makeTickets({ sprint: null, choice: { projectKey: null, sprintId: 'none' }, tickets: designTickets }),
        ),
      ),
    );
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'New ticket in To do' }));

    expect(within(dialog()).queryByRole('group', { name: 'Save in' })).toBeNull();
  });

  it('AC-8: types Jira won’t give say so with Try again, Create ticket is off, and Orynx is still there', async () => {
    jiraServer({ fails: true });
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));

    expect(await within(dialog()).findByText('Couldn’t read PROJ’s ticket types from Jira.')).toBeVisible();
    expect(within(dialog()).queryByRole('combobox', { name: 'Type' })).toBeNull();
    expect(within(dialog()).getByRole('button', { name: 'Create ticket' })).toBeDisabled();
    await expectNoAxeViolations(dialog());

    await user.click(within(dialog()).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog()).findByRole('combobox', { name: 'Type' })).toHaveTextContent('Task');
  });

  it('AC-13: on Jira, an empty title is refused in 037’s words, and nothing is sent', async () => {
    const sent: unknown[] = [];
    jiraServer();
    server.use(
      http.post(apiUrl(apiRoutes.jiraTickets), async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ result: 'unreachable' });
      }),
    );
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await screen.findByRole('button', { name: 'New ticket' }));
    await within(dialog()).findByRole('combobox', { name: 'Type' });

    await user.click(within(dialog()).getByRole('button', { name: 'Create ticket' }));

    expect(await within(dialog()).findByText('Add a title.')).toBeVisible();
    expect(within(dialog()).getByRole('textbox', { name: 'Title' })).toHaveFocus();
    expect(sent).toEqual([]);
  });
});
