import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeSessionList } from '@devhub/contracts/testing';
import { apiUrl, server, sessionsHandler } from '../../test/msw.ts';
import { renderApp } from '../../test/render.tsx';

const list = makeSessionList([
  { title: 'Add bulk archive', source: { kind: 'jira', key: 'PROJ-1423' } },
  { title: 'Fix timezone shift', source: { kind: 'pull_request', number: 2836 } },
  { title: 'Tidy the README', source: null },
]);

function pageBar() {
  return screen.getByRole('banner');
}

describe('SessionScreen', () => {
  it('Q8: shows Sessions / the title, with the ticket key beside it', async () => {
    server.use(sessionsHandler(list));
    await renderApp({ route: '/sessions/session-1' });

    const crumbs = within(pageBar()).getByRole('navigation', { name: 'Breadcrumb' });
    expect(await within(crumbs).findByText('Add bulk archive')).toHaveAttribute('aria-current', 'page');
    expect(within(crumbs).getByRole('link', { name: 'Sessions' })).toHaveAttribute('href', '/sessions');
    expect(within(pageBar()).getByText('PROJ-1423')).toBeVisible();
  });

  it('Q8: names a pull request source as PR #<number>', async () => {
    server.use(sessionsHandler(list));
    await renderApp({ route: '/sessions/session-2' });

    expect(await within(pageBar()).findByText('PR #2836')).toBeVisible();
  });

  it('shows no source when the session has none', async () => {
    server.use(sessionsHandler(list));
    await renderApp({ route: '/sessions/session-3' });

    expect(await within(pageBar()).findByText('Tidy the README')).toBeVisible();
    expect(within(pageBar()).queryByText(/PROJ-|PR #/)).toBeNull();
  });

  it('Q8: shows only the Sessions crumb while the session loads', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.sessions), async () => {
        await delay('infinite');
        return HttpResponse.json({ sessions: [] });
      }),
    );
    await renderApp({ route: '/sessions/session-1' });

    const crumbs = within(pageBar()).getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Sessions' })).toBeVisible();
    expect(within(crumbs).queryByText('Add bulk archive')).toBeNull();
  });

  it('says the page does not exist for an unknown session', async () => {
    server.use(sessionsHandler(list));
    await renderApp({ route: '/sessions/nope' });

    expect(await screen.findByText('This page does not exist')).toBeVisible();
  });

  it("says the session couldn't load", async () => {
    server.use(http.get(apiUrl(apiRoutes.sessions), () => HttpResponse.json({}, { status: 500 })));
    await renderApp({ route: '/sessions/session-1' });

    expect(await within(screen.getByRole('main')).findByText("Couldn't load sessions")).toBeVisible();
  });
});
