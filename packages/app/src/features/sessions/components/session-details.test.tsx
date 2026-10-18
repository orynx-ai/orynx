import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type SessionChanges } from '@devhub/contracts';
import { makeChangedFile, makeSession, makeSessionChanges, makeSessionTicket } from '@devhub/contracts/testing';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const done = makeSession({ id, state: 'done', step: 'review', ticket: makeSessionTicket() });

function serveChanges(changes: SessionChanges | 'fails') {
  server.use(
    http.get(apiUrl(apiRoutes.sessionChanges), () =>
      changes === 'fails'
        ? HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 })
        : HttpResponse.json(changes),
    ),
  );
}

describe('SessionDetails', () => {
  it('013 AC-1, AC-21: keeps the tab in the address, and the arrow keys move between the tabs', async () => {
    server.use(sessionHandler(done));
    const { user, history } = await renderApp({ route });

    const ticket = await screen.findByRole('tab', { name: 'Ticket PROJ-1423' });
    await user.click(ticket);
    expect(new URLSearchParams(history.location.search).get('tab')).toBe('ticket');
    expect(screen.getByRole('tabpanel', { name: 'Ticket PROJ-1423' })).toBeVisible();
    // Discard sits under the Changes tab only (Q6e).
    expect(screen.queryByRole('button', { name: 'Discard changes' })).toBeNull();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: /^Changes/ })).toHaveFocus();
    expect(new URLSearchParams(history.location.search).get('tab')).toBeNull();
  });

  it('013 AC-1: opens on the tab the address names', async () => {
    server.use(sessionHandler(done));
    await renderApp({ route: `${route}?tab=ticket` });
    expect(await screen.findByRole('tab', { name: 'Ticket PROJ-1423' })).toHaveAttribute('aria-selected', 'true');
  });

  it('013 AC-5: counts the listed files and the ones past the list', async () => {
    server.use(sessionHandler(done));
    serveChanges(makeSessionChanges({ files: [makeChangedFile()], moreFiles: 41 }));
    await renderApp({ route });
    expect(await screen.findByRole('tab', { name: 'Changes 42' })).toHaveAttribute('aria-selected', 'true');
  });

  it('013 AC-6: counts none once the changes are gone', async () => {
    server.use(sessionHandler({ ...done, state: 'stopped', discardedAt: '2026-10-16T10:05:00.000Z' }));
    serveChanges({ state: 'discarded' });
    await renderApp({ route });
    expect(await screen.findByRole('tab', { name: 'Changes 0' })).toBeVisible();
  });

  it('013 AC-7: shows no count when the changes couldn’t be read', async () => {
    server.use(sessionHandler(done));
    serveChanges('fails');
    await renderApp({ route });
    expect(await screen.findByText("Couldn't read the changes.")).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Changes' })).toBeVisible();
  });

  it('013 AC-9: names the Ticket tab with no key when the session has no ticket', async () => {
    server.use(sessionHandler({ ...done, source: null }));
    await renderApp({ route });
    expect(await screen.findByRole('tab', { name: 'Ticket' })).toHaveAttribute('aria-selected', 'false');
  });
});
