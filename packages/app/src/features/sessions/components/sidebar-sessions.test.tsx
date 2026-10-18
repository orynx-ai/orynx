import { act, screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { apiRoutes, type SessionSummary } from '@devhub/contracts';
import { makeSessionList } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { FakeIntersectionObserver } from '../../../test/fake-intersection-observer.ts';
import { apiUrl, server, sessionsHandler, sessionsPage } from '../../../test/msw.ts';
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
  it('AC-10 (spec 011): asks for recent sessions only, so a long-discarded one leaves the sidebar', async () => {
    const asked: URLSearchParams[] = [];
    server.use(
      http.get(apiUrl(apiRoutes.sessions), ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json(makeSessionList([]));
      }),
    );
    await renderApp({ route: '/' });
    await within(mainNav()).findByText('No sessions yet');
    expect(asked.some((params) => params.get('recent') === 'true' && params.get('limit') === '16')).toBe(true);
  });

  it('AC-8: shows each session as a two-line link', async () => {
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
    // Spec 020: no longer only the five newest.
    expect(within(nav).getByRole('link', { name: /^Seventh session/ })).toBeVisible();
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

/** Forty sessions, "Session 1" the newest. */
const forty = makeSessionList(Array.from({ length: 40 }, (_, index) => ({ title: `Session ${String(index + 1)}` })));

/** The titles of the session rows the sidebar shows, in order. */
function shownTitles() {
  return within(mainNav())
    .getAllByRole('link', { name: /^Session \d+ / })
    .map((link) => /^Session \d+/.exec(link.textContent)?.[0]);
}

/** The person scrolls the sidebar's sessions to their end. */
function scrollToEnd() {
  act(() => {
    FakeIntersectionObserver.scrollIntoView();
  });
}

const titles = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => `Session ${String(from + index)}`);

describe('Sidebar sessions, 16 at a time (spec 020)', () => {
  it('AC-1: lists the 16 with the newest activity first', async () => {
    server.use(sessionsHandler(forty));
    await renderApp();

    await within(mainNav()).findByRole('link', { name: /^Session 1 / });
    expect(shownTitles()).toEqual(titles(1, 16));
  });

  it('AC-2: loads the next 16 at the list’s end, with skeleton rows meanwhile, then the last 8, then stops', async () => {
    let release: () => void = () => undefined;
    let pages = 0;
    server.use(
      http.get(apiUrl(apiRoutes.sessions), async ({ request }) => {
        // Only the sidebar asks a page at a time; Home's waiting banner asks for the whole list (spec 015).
        if (new URL(request.url).searchParams.has('limit')) {
          pages += 1;
          if (pages === 2) await new Promise<void>((resolve) => (release = resolve));
        }
        return HttpResponse.json(sessionsPage(forty, request.url));
      }),
    );
    await renderApp();
    const nav = mainNav();
    await within(nav).findByRole('link', { name: /^Session 16 / });

    scrollToEnd();
    expect(await within(nav).findByRole('status')).toHaveTextContent('Loading more sessions');
    release();
    await within(nav).findByRole('link', { name: /^Session 32 / });
    expect(within(nav).queryByRole('status')).toBeNull();
    expect(shownTitles()).toEqual(titles(1, 32));

    scrollToEnd();
    await within(nav).findByRole('link', { name: /^Session 40 / });
    expect(shownTitles()).toEqual(titles(1, 40));
    scrollToEnd();
    expect(pages).toBe(3);
  });

  it('AC-3: when a session on page two gets new activity, it moves to the top once, and both pages stay', async () => {
    let list = forty;
    server.use(
      http.get(apiUrl(apiRoutes.sessions), ({ request }) => HttpResponse.json(sessionsPage(list, request.url))),
    );
    await renderApp();
    const nav = mainNav();
    await within(nav).findByRole('link', { name: /^Session 16 / });
    scrollToEnd();
    await within(nav).findByRole('link', { name: /^Session 32 / });

    const moved = list.sessions.find((session) => session.title === 'Session 20');
    list = makeSessionList([
      { ...moved, updatedAt: '2026-10-16T11:00:00.000Z' },
      ...forty.sessions.filter((session) => session !== moved),
    ]);
    act(() => {
      FakeEventSource.latest().emit({ type: 'sessions.changed' });
    });

    await vi.waitFor(() => {
      expect(shownTitles()[0]).toBe('Session 20');
    });
    expect(shownTitles()).toEqual(['Session 20', ...titles(1, 19), ...titles(21, 32)]);
  });

  it('AC-5: when the next 16 fail, keeps the rows shown and tries again on request', async () => {
    let fail = false;
    server.use(
      http.get(apiUrl(apiRoutes.sessions), ({ request }) =>
        fail
          ? HttpResponse.json({ code: 'internal', message: 'Disk full' }, { status: 500 })
          : HttpResponse.json(sessionsPage(forty, request.url)),
      ),
    );
    const { user } = await renderApp();
    const nav = mainNav();
    await within(nav).findByRole('link', { name: /^Session 16 / });

    fail = true;
    scrollToEnd();
    expect(await within(nav).findByText("Couldn't load sessions")).toBeVisible();
    expect(shownTitles()).toEqual(titles(1, 16));

    fail = false;
    await user.click(within(nav).getByRole('button', { name: 'Try again' }));
    await within(nav).findByRole('link', { name: /^Session 32 / });
    expect(within(nav).queryByText("Couldn't load sessions")).toBeNull();
  });
});
