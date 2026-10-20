import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Inbox } from '@devhub/contracts';
import { makeInbox, makeSyncActivity } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

function inboxWith(tools: Inbox['tools']) {
  server.use(
    http.get(apiUrl(apiRoutes.inbox), () => HttpResponse.json(makeInbox({ tools }))),
    http.get(apiUrl(apiRoutes.syncActivity), () => HttpResponse.json(makeSyncActivity())),
  );
}

/** The page bar: the header that holds the breadcrumb. */
function pageBar() {
  const bar = screen.getByRole('navigation', { name: 'Breadcrumb' }).closest('header');
  if (bar === null) throw new Error('No page bar');
  return within(bar);
}

const synced = { state: 'synced', at: '2026-10-20T10:41:00.000Z' } as const;

describe('Sync activity button (spec 035)', () => {
  it('AC-1, AC-17 (039): is the "Synced" line itself, before Sync, with a green dot while syncs go well', async () => {
    inboxWith({ jira: synced, github: synced });
    await renderApp();

    const button = await pageBar().findByRole('button', { name: /^Synced .*, Sync activity$/ });
    const sync = pageBar().getByRole('button', { name: 'Sync' });
    // Spec 039, Q2: the line is the button, and the separate Sync activity button is gone.
    expect(button.compareDocumentPosition(sync) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button).toHaveTextContent(/Synced /);
    expect(button.querySelector('.bg-success')).not.toBeNull();
    expect(pageBar().getAllByRole('button', { name: /Sync activity/ })).toHaveLength(1);
  });

  it('AC-2: says how many tools need attention, with a red dot', async () => {
    inboxWith({ jira: { state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: null }, github: synced });
    await renderApp();

    const button = await pageBar().findByRole('button', { name: /, Sync activity, 1 needs attention$/ });
    expect(button.querySelector('.bg-danger')).not.toBeNull();
    expect(button.querySelector('.bg-success')).toBeNull();
  });

  it('AC-3: isn’t there while no tool is connected', async () => {
    await renderApp();
    await screen.findByText('Nothing needs you yet');

    expect(screen.queryByRole('button', { name: /Sync activity/ })).toBeNull();
  });

  it('AC-4, AC-26: opens the modal from the keyboard, and Escape, Close or Done give focus back to it', async () => {
    inboxWith({ jira: synced, github: synced });
    const { user } = await renderApp();
    const button = await pageBar().findByRole('button', { name: /Sync activity$/ });

    for (const close of ['{Escape}', 'Close sync activity', 'Done']) {
      button.focus();
      await user.keyboard('{Enter}');
      const dialog = await screen.findByRole('dialog', { name: 'Sync activity' });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);

      if (close.startsWith('{')) await user.keyboard(close);
      else await user.click(within(dialog).getByRole('button', { name: close }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(button).toHaveFocus();
    }
  });
});

describe('Sync activity in a narrow page bar (spec 039)', () => {
  it('AC-17: keeps the line in its name, and draws the history icon for when the line steps aside', async () => {
    inboxWith({ jira: synced, github: synced });
    const { user } = await renderApp();

    const button = await pageBar().findByRole('button', { name: /^Synced .*, Sync activity$/ });
    // Under 1280 px CSS hides the line and shows the icon; jsdom draws both.
    expect(button.querySelector('svg')).not.toBeNull();
    await user.click(button);
    expect(await screen.findByRole('dialog', { name: 'Sync activity' })).toBeVisible();
  });
});
