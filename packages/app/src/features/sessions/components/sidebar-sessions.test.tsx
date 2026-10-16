import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type SessionSummary } from '@devhub/contracts';
import { makeSessionList } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server, sessionsHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

function mainNav() {
  return screen.getByRole('navigation', { name: 'Main' });
}

const seven = makeSessionList([
  { title: 'Add bulk archive', source: { kind: 'jira', key: 'PROJ-1423' }, state: 'needs_you' },
  { title: 'Read receipts on analytics', source: { kind: 'jira', key: 'PROJ-1398' }, state: 'working' },
  { title: 'Fix timezone shift in event cards', source: { kind: 'pull_request', number: 2836 }, state: 'done' },
  { title: 'Bulk archive for events', source: { kind: 'jira', key: 'PROJ-1401' }, state: 'pr_open' },
  { title: 'Tidy the README', source: null, state: 'stopped' },
  { title: 'Sixth session', state: 'done' },
  { title: 'Seventh session', state: 'done' },
]);

describe('Sidebar sessions', () => {
  it('AC-8: shows the 5 sessions with the newest activity as two-line links', async () => {
    server.use(sessionsHandler(seven));
    await renderApp();
    const nav = mainNav();

    expect(await within(nav).findByRole('link', { name: 'Add bulk archive PROJ-1423 Needs you' })).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Read receipts on analytics PROJ-1398 Working' })).toBeVisible();
    expect(
      within(nav).getByRole('link', { name: 'Fix timezone shift in event cards PR #2836 Done, ready for PR' }),
    ).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Bulk archive for events PROJ-1401 PR open' })).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Tidy the README Stopped' })).toHaveAttribute(
      'href',
      '/sessions/session-5',
    );
    expect(within(nav).queryByText('Sixth session')).toBeNull();
  });

  it('AC-10: says there are no sessions yet and still links to the full list', async () => {
    const { user, history } = await renderApp();
    const nav = mainNav();

    expect(await within(nav).findByText('No sessions yet')).toBeVisible();
    await user.click(within(nav).getByRole('link', { name: 'View all' }));

    expect(history.location.pathname).toBe('/sessions');
  });

  it('AC-11: shows nothing under the heading while the list loads', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.sessions), async () => {
        await delay('infinite');
        return HttpResponse.json({ sessions: [] });
      }),
    );
    await renderApp();
    const nav = mainNav();

    expect(within(nav).getByRole('heading', { name: 'Sessions' })).toBeVisible();
    expect(within(nav).queryByText('No sessions yet')).toBeNull();
    expect(within(nav).queryByText("Couldn't load sessions")).toBeNull();
  });

  it('AC-12: says the list could not load and tries again on request', async () => {
    let fail = true;
    server.use(
      http.get(apiUrl(apiRoutes.sessions), () =>
        fail
          ? HttpResponse.json({ code: 'internal', message: 'Disk full' }, { status: 500 })
          : HttpResponse.json(makeSessionList([{ title: 'Add bulk archive' }])),
      ),
    );
    const { user } = await renderApp();
    const nav = mainNav();

    expect(await within(nav).findByText("Couldn't load sessions")).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Home' })).toBeVisible();

    fail = false;
    await user.click(within(nav).getByRole('button', { name: 'Try again' }));

    expect(await within(nav).findByRole('link', { name: /^Add bulk archive/ })).toBeVisible();
    expect(within(nav).queryByText("Couldn't load sessions")).toBeNull();
  });

  it('AC-13: refetches when the server says the sessions changed', async () => {
    let state: SessionSummary['state'] = 'working';
    server.use(http.get(apiUrl(apiRoutes.sessions), () => HttpResponse.json(makeSessionList([{ state }]))));
    await renderApp();
    const nav = mainNav();
    await within(nav).findByRole('link', { name: 'Add bulk archive PROJ-1423 Working' });

    state = 'needs_you';
    FakeEventSource.latest().emit({ type: 'sessions.changed' });

    expect(await within(nav).findByRole('link', { name: 'Add bulk archive PROJ-1423 Needs you' })).toBeVisible();
  });

  it('AC-14: marks the open session as current, and no place with it', async () => {
    server.use(sessionsHandler(seven));
    await renderApp({ route: '/sessions/session-2' });
    const nav = mainNav();

    expect(await within(nav).findByRole('link', { name: /^Read receipts on analytics/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: /^Add bulk archive/ })).not.toHaveAttribute('aria-current');
    // The narrow-window "Sessions" place is current here too, by design: under 768 px it stands in
    // for the session rows. From 768 px it is display: none, so only the row is current on screen.
    for (const name of ['Home', 'Tickets', 'Settings', 'View all']) {
      expect(within(nav).getByRole('link', { name })).not.toHaveAttribute('aria-current');
    }
  });
});
