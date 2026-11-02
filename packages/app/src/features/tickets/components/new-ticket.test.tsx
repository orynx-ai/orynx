import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiRoutes,
  NewJiraTicketSchema,
  type NewJiraTicket,
  type NewJiraTicketAnswer,
  type Ticket,
} from '@devhub/contracts';
import { makeTicket, makeTickets } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { designTickets, ticketsHandler, ticketsToday } from '../../../test/tickets.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: ticketsToday });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('New ticket says where the ticket goes (spec 039)', () => {
  it('AC-40: from the page bar’s New, an Orynx ticket says it stays in Orynx, not Jira (Jira first, spec 019)', async () => {
    server.use(ticketsHandler());
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('button', { name: 'New ticket' })).toHaveTextContent(/^New$/);
    await user.click(within(banner).getByRole('button', { name: 'New ticket' }));

    const dialog = await screen.findByRole('dialog', { name: 'New ticket' });
    expect(dialog).toHaveAccessibleDescription('Goes to Jira’s PROJ project, in Sprint 42.');
    await user.click(within(dialog).getByRole('button', { name: 'Orynx' }));
    expect(dialog).toHaveAccessibleDescription('Saved in Orynx on this computer. It isn’t added to Jira.');
  });

  it('AC-40: a column’s + says the same', async () => {
    server.use(ticketsHandler());
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(screen.getByRole('button', { name: 'New ticket in In progress' }));

    const dialog = await screen.findByRole('dialog', { name: 'New ticket' });
    await user.click(within(dialog).getByRole('button', { name: 'Orynx' }));
    expect(dialog).toHaveAccessibleDescription('Saved in Orynx on this computer. It isn’t added to Jira.');
  });

  it('AC-41: without Jira it doesn’t mention Jira', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.tickets), () =>
        HttpResponse.json(makeTickets({ jira: { state: 'not_connected' }, sprint: null, tickets: [] })),
      ),
    );
    const { user } = await renderApp({ route: '/tickets' });
    await user.click(await within(screen.getByRole('banner')).findByRole('button', { name: 'New ticket' }));

    expect(await screen.findByRole('dialog', { name: 'New ticket' })).toHaveAccessibleDescription(
      'Saved in Orynx on this computer.',
    );
  });
});

describe('Create ticket on Jira (spec 019)', () => {
  const url = 'https://your-team.atlassian.net/browse/PROJ-1424';
  const dialog = () => screen.getByRole('dialog', { name: 'New ticket' });

  /** Sprint 42 of PROJ, Jira answering `answer` to each new ticket, and the board holding a ticket once it's made. */
  function jiraServer(answer: NewJiraTicketAnswer, { slow = false } = {}) {
    const sent: NewJiraTicket[] = [];
    const made: Ticket[] = [];
    server.use(
      http.get(apiUrl(apiRoutes.tickets), () =>
        HttpResponse.json(makeTickets({ tickets: [...designTickets, ...made] })),
      ),
      http.post(apiUrl(apiRoutes.jiraTickets), async ({ request }) => {
        const body = NewJiraTicketSchema.parse(await request.json());
        sent.push(body);
        if (slow) await delay(200);
        if (answer.result === 'made' || answer.result === 'made_but') {
          made.push(makeTicket({ key: answer.key, url: answer.url, title: body.title, column: body.column }));
        }
        return HttpResponse.json(answer);
      }),
    );
    return { sent };
  }

  /** Opens New ticket from `opener`, waits for PROJ's types, and types a title. */
  async function fillIn(user: UserEvent, opener: string) {
    await user.click(await screen.findByRole('button', { name: opener }));
    await within(dialog()).findByRole('combobox', { name: 'Type' });
    await user.type(within(dialog()).getByRole('textbox', { name: 'Title' }), 'Add bulk archive');
  }

  it('AC-3: makes the ticket in PROJ, Sprint 42 and In progress, closes, and shows its card there', async () => {
    const { sent } = jiraServer({ result: 'made', key: 'PROJ-1424', url });
    const { user } = await renderApp({ route: '/tickets' });
    const opener = await screen.findByRole('button', { name: 'New ticket in In progress' });
    await fillIn(user, 'New ticket in In progress');

    await user.click(within(dialog()).getByRole('button', { name: 'Create ticket' }));

    const column = await screen.findByRole('region', { name: /^In progress/ });
    expect(await within(column).findByRole('article', { name: 'Add bulk archive' })).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
    expect(sent).toEqual([
      {
        projectKey: 'PROJ',
        sprintId: 42,
        column: 'in_progress',
        title: 'Add bulk archive',
        description: '',
        typeId: '10001',
        priorityId: '3',
        dueDate: null,
      },
    ]);
  });

  it('AC-9: a ticket Jira refuses says so in Jira’s words, and keeps what you typed', async () => {
    jiraServer({ result: 'refused', reason: 'Epic Name is required.' });
    const { user } = await renderApp({ route: '/tickets' });
    await fillIn(user, 'New ticket in To do');

    await user.click(within(dialog()).getByRole('button', { name: 'Create ticket' }));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Jira didn’t make the ticket: Epic Name is required.',
    );
    expect(within(dialog()).getByRole('textbox', { name: 'Title' })).toHaveValue('Add bulk archive');
  });

  it('AC-10: made, but not in the sprint: it says so, the form can’t change, and Open in Jira and Close are left', async () => {
    const { sent } = jiraServer({
      result: 'made_but',
      key: 'PROJ-1424',
      url,
      missed: 'sprint',
      reason: 'Sprint 42 is closed.',
    });
    const { user } = await renderApp({ route: '/tickets' });
    await fillIn(user, 'New ticket in To do');

    await user.click(within(dialog()).getByRole('button', { name: 'Create ticket' }));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Made PROJ-1424, but Jira didn’t add it to Sprint 42: Sprint 42 is closed.',
    );
    expect(within(dialog()).getByRole('textbox', { name: 'Title' })).toBeDisabled();
    expect(within(dialog()).queryByRole('button', { name: 'Create ticket' })).toBeNull();
    expect(within(dialog()).getByRole('link', { name: 'Open PROJ-1424 in Jira' })).toHaveAttribute('href', url);
    expect(within(dialog()).getByRole('button', { name: 'Close' })).toHaveFocus();
    await expectNoAxeViolations(dialog());

    await user.click(within(dialog()).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it('AC-10: made, but the workflow has no way to the column: it names the column it couldn’t reach', async () => {
    jiraServer({
      result: 'made_but',
      key: 'PROJ-1424',
      url,
      missed: 'column',
      reason: 'there’s no move there from To Do',
    });
    const { user } = await renderApp({ route: '/tickets' });
    await fillIn(user, 'New ticket in In review');

    await user.click(within(dialog()).getByRole('button', { name: 'Create ticket' }));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Made PROJ-1424, but Jira didn’t move it to In review: there’s no move there from To Do.',
    );
  });

  it('AC-11: no answer from Jira says to check PROJ before trying again, and keeps what you typed', async () => {
    jiraServer({ result: 'unreachable' });
    const { user } = await renderApp({ route: '/tickets' });
    await fillIn(user, 'New ticket in To do');

    await user.click(within(dialog()).getByRole('button', { name: 'Create ticket' }));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'Couldn’t reach Jira. Check PROJ before you try again, in case the ticket was made.',
    );
    expect(within(dialog()).getByRole('textbox', { name: 'Title' })).toHaveValue('Add bulk archive');
  });

  it('AC-12: a double click makes one ticket, the button waiting until Jira answers', async () => {
    const { sent } = jiraServer({ result: 'made', key: 'PROJ-1424', url }, { slow: true });
    const { user } = await renderApp({ route: '/tickets' });
    await fillIn(user, 'New ticket in To do');

    await user.dblClick(within(dialog()).getByRole('button', { name: 'Create ticket' }));

    expect(within(dialog()).getByRole('button', { name: /Create ticket/ })).toHaveAttribute('aria-disabled', 'true');
    expect(await screen.findByRole('article', { name: 'Add bulk archive' })).toBeVisible();
    expect(sent).toHaveLength(1);
  });
});
