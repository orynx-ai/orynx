import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type Inbox } from '@devhub/contracts';
import { makeInbox, makeInboxItem } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const noon = new Date('2026-10-17T12:00:00.000Z');

function minutesBefore(minutes: number): string {
  return new Date(noon.getTime() - minutes * 60_000).toISOString();
}

function inboxAs(overrides: Partial<Inbox>) {
  server.use(http.get(apiUrl(apiRoutes.inbox), () => HttpResponse.json(makeInbox(overrides))));
}

/** The page bar: the header that holds the breadcrumb. */
function pageBar() {
  const bar = screen.getByRole('navigation', { name: 'Breadcrumb' }).closest('header');
  if (bar === null) throw new Error('No page bar');
  return within(bar);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(noon);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SyncStatus', () => {
  it('AC-19: shows the cached rows at once with how old they are, and updates when the sync ends', async () => {
    inboxAs({ items: [makeInboxItem()], syncedAt: minutesBefore(25) });
    await renderApp();

    expect(await pageBar().findByText('Synced 25 min ago')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Lazy-load the people directory' })).toBeVisible();

    inboxAs({ items: [makeInboxItem()], syncedAt: noon.toISOString() });
    FakeEventSource.latest().emit({ type: 'inbox.changed' });

    expect(await pageBar().findByText('Synced just now')).toBeVisible();
  });

  it('AC-20: reads "Syncing" while the very first sync runs', async () => {
    inboxAs({ tools: { jira: { state: 'syncing' }, github: { state: 'syncing' } }, syncedAt: null });
    await renderApp();

    expect(await pageBar().findByText('Syncing')).toBeVisible();
    expect(pageBar().getByRole('button', { name: 'Refresh' })).toBeVisible();
  });

  it('AC-21: has no Synced line and no Refresh when no tool is connected', async () => {
    await renderApp();
    await screen.findByText('Nothing needs you yet');

    expect(pageBar().queryByText(/Synced|Syncing/)).not.toBeInTheDocument();
    expect(pageBar().queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
  });

  it('AC-17: syncs at once on Refresh, ignores presses until the sync ends, then reads "Synced just now"', async () => {
    let refreshes = 0;
    let endSync: (() => void) | undefined;
    const syncing = new Promise<void>((resolve) => {
      endSync = resolve;
    });
    inboxAs({ syncedAt: minutesBefore(2) });
    server.use(
      http.post(apiUrl(apiRoutes.inboxRefresh), async () => {
        refreshes += 1;
        await syncing;
        inboxAs({ syncedAt: noon.toISOString() });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderApp();
    await pageBar().findByText('Synced 2 min ago');
    const refresh = pageBar().getByRole('button', { name: 'Refresh' });

    await user.click(refresh);
    await waitFor(() => {
      expect(refresh).toHaveAttribute('aria-disabled', 'true');
    });
    await user.click(refresh);
    expect(refreshes).toBe(1);

    endSync?.();

    expect(await pageBar().findByText('Synced just now')).toBeVisible();
    expect(refresh).not.toHaveAttribute('aria-disabled');
    expect(refresh).toHaveFocus();
  });
});
