import { act, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeInbox, makeInboxItem } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../test/msw.ts';
import { renderApp } from '../../test/render.tsx';

afterEach(() => {
  vi.useRealTimers();
});

describe('HomeScreen', () => {
  it('greets you and shows Home as the only breadcrumb', async () => {
    await renderApp();

    expect(await screen.findByRole('heading', { level: 1, name: 'What should we ship today?' })).toBeVisible();
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Home')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('AC-21: explains how the attention list gets filled and links to Connections', async () => {
    const { user, history } = await renderApp();
    const panel = screen.getByRole('region', { name: 'Needs your attention' });

    expect(await within(panel).findByText('Nothing needs you yet')).toBeVisible();
    await user.click(within(panel).getByRole('link', { name: 'Connect your tools' }));

    expect(history.location.pathname).toBe('/settings/connections');
  });

  it('AC-13, AC-16: moves the Synced line and the waits on by themselves each minute', async () => {
    // The clock and the minute timer are fake; everything else runs on real timers.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
    server.use(
      http.get(apiUrl(apiRoutes.inbox), () =>
        HttpResponse.json(
          makeInbox({
            items: [makeInboxItem({ reason: { kind: 'approval' }, waitingSince: '2026-10-17T11:55:00.000Z' })],
            syncedAt: '2026-10-17T11:58:00.000Z',
          }),
        ),
      ),
    );
    await renderApp();
    expect(await screen.findByText('Synced 2 min ago')).toBeVisible();
    expect(screen.getByText('Approve command · 5 min')).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('Synced 3 min ago')).toBeVisible();
    expect(screen.getByText('Approve command · 6 min')).toBeVisible();
    expect(screen.getByText('Approve command, 6 minutes')).toBeInTheDocument();
  });
});
