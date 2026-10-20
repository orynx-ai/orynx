import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeTickets } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { ticketsHandler, ticketsToday } from '../../../test/tickets.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: ticketsToday });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('New ticket says where the ticket goes (spec 039)', () => {
  it('AC-40: from the page bar’s New, the dialog says it stays in Orynx, not Jira', async () => {
    server.use(ticketsHandler());
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('button', { name: 'New ticket' })).toHaveTextContent(/^New$/);
    await user.click(within(banner).getByRole('button', { name: 'New ticket' }));

    const dialog = await screen.findByRole('dialog', { name: 'New ticket' });
    expect(dialog).toHaveAccessibleDescription('Saved in Orynx on this computer. It isn’t added to Jira.');
  });

  it('AC-40: a column’s + says the same', async () => {
    server.use(ticketsHandler());
    const { user } = await renderApp({ route: '/tickets' });
    await screen.findByText('6 tickets');

    await user.click(screen.getByRole('button', { name: 'New ticket in In progress' }));

    expect(await screen.findByRole('dialog', { name: 'New ticket' })).toHaveAccessibleDescription(
      'Saved in Orynx on this computer. It isn’t added to Jira.',
    );
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
