import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type SessionChanges } from '@devhub/contracts';
import { makeChangedFile, makeSession, makeSessionChanges, makeSessionTicket } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
const done = makeSession({ id, state: 'done', step: 'review', ticket: makeSessionTicket() });
/** A composer session sent its ticket, another ticket, a pull request and a file. */
const sent = makeSession({
  id,
  state: 'done',
  step: 'review',
  ticket: makeSessionTicket(),
  context: [
    { kind: 'jira', key: 'PROJ-1423' },
    { kind: 'jira', key: 'PROJ-1424' },
    { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 },
    { kind: 'file', path: '~/notes/plan.md' },
  ],
});

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

    const context = await screen.findByRole('tab', { name: 'Context 1' });
    await user.click(context);
    expect(new URLSearchParams(history.location.search).get('tab')).toBe('context');
    expect(screen.getByRole('tabpanel', { name: 'Context 1' })).toBeVisible();
    // Discard sits in the page bar's More actions, whichever tab is open (19 Oct 2026).
    expect(screen.getByRole('button', { name: 'More actions' })).toBeVisible();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: /^Changes/ })).toHaveFocus();
    expect(new URLSearchParams(history.location.search).get('tab')).toBeNull();
  });

  it('AC-18 (spec 048): the tabs are Changes, Ports and Context, and only Changes shows the totals and Wrap lines', async () => {
    server.use(sessionHandler(makeSession({ ...sent, terminal: true })));
    serveChanges(makeSessionChanges());
    const { user } = await renderApp({ route });
    const tabs = await screen.findByRole('tablist', { name: 'Session details' });
    await waitFor(() => {
      expect(
        within(tabs)
          .getAllByRole('tab')
          .map((tab) => tab.textContent),
      ).toEqual(['Changes 4', 'Ports', 'Context 4']);
    });
    await user.click(within(tabs).getByRole('tab', { name: /^Changes/ }));
    expect(await screen.findByRole('switch', { name: 'Wrap lines' })).toBeVisible();
    expect(screen.getByText('+142')).toBeVisible();
    await user.click(within(tabs).getByRole('tab', { name: /^Context/ }));
    expect(screen.queryByRole('switch', { name: 'Wrap lines' })).not.toBeInTheDocument();
    expect(screen.queryByText('+142')).not.toBeInTheDocument();
  });

  it('013 AC-1: opens on the tab the address names, and an old Ticket link opens Context', async () => {
    server.use(sessionHandler(done));
    await renderApp({ route: `${route}?tab=ticket` });
    expect(await screen.findByRole('tab', { name: 'Context 1' })).toHaveAttribute('aria-selected', 'true');
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

  it('015 Q8d (in place of 013 AC-9): a session sent nothing has no Context tab, even when the address asks', async () => {
    server.use(sessionHandler({ ...done, source: null }));
    await renderApp({ route: `${route}?tab=context` });
    expect(await screen.findByRole('tab', { name: /Changes/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: /Context/ })).toBeNull();
  });
});

describe('Full screen (the user’s call, 19 Oct 2026)', () => {
  it('shows the open tab in a dialog that fills the window; Close and Esc give focus back', async () => {
    server.use(sessionHandler(sent));
    serveChanges(makeSessionChanges());
    const { user } = await renderApp({ route });
    const details = await screen.findByRole('region', { name: 'Work details' });
    const button = await within(details).findByRole('button', { name: 'Full screen' });

    await user.click(button);
    const changes = await screen.findByRole('dialog', { name: 'Changes' });
    expect(await within(changes).findByRole('list', { name: 'Changed files' })).toBeVisible();
    await expectNoAxeViolations(changes);
    await user.click(within(changes).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Changes' })).toBeNull();
    });
    expect(button).toHaveFocus();

    await user.click(screen.getByRole('tab', { name: 'Context 4' }));
    await user.click(button);
    const context = await screen.findByRole('dialog', { name: 'Context' });
    expect(within(context).getByRole('list', { name: 'Context Claude was sent' })).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Context' })).toBeNull();
    });
    expect(button).toHaveFocus();
  });
});
