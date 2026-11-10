import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type ClaudeLimit } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { FakeEventSource } from '../test/fake-event-source.ts';
import { apiUrl, server } from '../test/msw.ts';
import { renderApp } from '../test/render.tsx';

// Tuesday 10 Nov 2026, 14:00 on the laptop's own clock.
const now = new Date(2026, 10, 10, 14, 0);
const near: ClaudeLimit = {
  window: 'five_hour',
  usedPercent: 82,
  resetsAt: new Date(2026, 10, 10, 15, 40).toISOString(),
};

function statusSays(claudeLimit: ClaudeLimit | null) {
  server.use(http.get(apiUrl(apiRoutes.status), () => HttpResponse.json({ ...makeStatus(), claudeLimit })));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("close to Claude's limit (spec 057, E)", () => {
  it.each(['/', '/sessions'])('AC-45, AC-49: %s warns at the top, without taking focus', async (route) => {
    vi.useFakeTimers({ toFake: ['Date'], now });
    statusSays(near);
    const { container } = await renderApp({ route });

    const callout = await within(screen.getByRole('main')).findByRole('status', { name: 'Close to your Claude limit' });
    expect(
      within(callout).getByText("You've used 82% of your 5-hour Claude limit. It resets at 3:40 pm."),
    ).toBeVisible();
    expect(callout).not.toHaveFocus();
    await expectNoAxeViolations(container);
  });

  it('AC-47: the warning goes when the hub says the limit reset, without a reload', async () => {
    statusSays(near);
    await renderApp({ route: '/' });
    await screen.findByRole('status', { name: 'Close to your Claude limit' });

    statusSays(null);
    FakeEventSource.latest().emit({ type: 'status.changed' });
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Close to your Claude limit' })).toBeNull();
    });
  });

  it('shows nothing while Claude is nowhere near a limit', async () => {
    statusSays(null);
    await renderApp({ route: '/sessions' });
    await within(screen.getByRole('main')).findByRole('group', { name: 'Spend' });
    expect(screen.queryByRole('status', { name: 'Close to your Claude limit' })).toBeNull();
  });
});
