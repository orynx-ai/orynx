import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeInbox } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

describe('Home’s quick starts (spec 015, Q12)', () => {
  it('AC-1: offers Pick up a ticket and Review a pull request, and nothing that can’t work yet', async () => {
    await renderApp();
    const group = await screen.findByRole('group', { name: 'Quick starts' });
    expect(
      within(group)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Pick up a ticket']);
    expect(
      within(group)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Review a pull request']);
    expect(within(group).queryByText(/Fix failing checks|Draft a Slack reply/)).toBeNull();
  });

  it('AC-28: Pick up a ticket opens Tickets', async () => {
    const { user, history } = await renderApp();
    await user.click(await screen.findByRole('link', { name: 'Pick up a ticket' }));
    expect(history.location.pathname).toBe('/tickets');
  });

  it('AC-29: Review a pull request switches the list to Pull requests and puts focus on that tab', async () => {
    // Jira and GitHub connected, so the list shows its tabs.
    server.use(http.get(apiUrl(apiRoutes.inbox), () => HttpResponse.json(makeInbox())));
    const { user, history } = await renderApp();
    await screen.findByRole('tab', { name: /Pull requests/ });
    await user.click(await screen.findByRole('button', { name: 'Review a pull request' }));

    await waitFor(() => {
      expect(history.location.search).toBe('?inbox=pull-requests');
    });
    const tab = screen.getByRole('tab', { name: /Pull requests/ });
    await waitFor(() => {
      expect(tab).toHaveFocus();
    });
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });
});
