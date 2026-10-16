import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeSessionList } from '@devhub/contracts/testing';
import { apiUrl, server, sessionsHandler } from '../../test/msw.ts';
import { renderApp } from '../../test/render.tsx';

function content() {
  return screen.getByRole('main');
}

describe('SessionsScreen', () => {
  it('AC-8: lists every session, newest activity first, with the sidebar rows', async () => {
    const titles = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
    server.use(sessionsHandler(makeSessionList(titles.map((title) => ({ title, source: null, state: 'done' })))));
    await renderApp({ route: '/sessions' });

    const list = await within(content()).findByRole('list', { name: 'Sessions' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(titles.map((title) => `${title} Done, ready for PR`));
    expect(links[6]).toHaveAttribute('href', '/sessions/session-7');
  });

  it('AC-10: shows that there are no sessions and how to start one', async () => {
    await renderApp({ route: '/sessions' });

    expect(await within(content()).findByText('No sessions yet')).toBeVisible();
    expect(within(content()).getByText('Start one from Home or from a ticket.')).toBeVisible();
  });

  it('shows the page bar and nothing else while the list loads', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.sessions), async () => {
        await delay('infinite');
        return HttpResponse.json({ sessions: [] });
      }),
    );
    await renderApp({ route: '/sessions' });

    expect(within(content()).getByText('Sessions', { selector: '[aria-current="page"]' })).toBeVisible();
    expect(within(content()).queryByText('No sessions yet')).toBeNull();
    expect(within(content()).queryByRole('list', { name: 'Sessions' })).toBeNull();
  });

  it("AC-12: says the sessions couldn't load", async () => {
    server.use(http.get(apiUrl(apiRoutes.sessions), () => HttpResponse.json({}, { status: 500 })));
    await renderApp({ route: '/sessions' });

    expect(await within(content()).findByText("Couldn't load sessions")).toBeVisible();
    expect(within(content()).getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
