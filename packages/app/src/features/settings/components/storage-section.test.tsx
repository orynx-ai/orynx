import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type PreferencesChange } from '@devhub/contracts';
import { makePreferences, makeStorage } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const route = '/settings/coding-agent';
const saveFailed = "Couldn't save that change. Check that Orynx is still running, then try again.";

const measured = makeStorage({
  bytes: 12_400_000_000,
  choices: [
    { days: 7, sessions: 5, bytes: 6_000_000_000 },
    { days: 14, sessions: 4, bytes: 5_000_000_000 },
    { days: 30, sessions: 3, bytes: 4_100_000_000 },
    { days: 90, sessions: 0, bytes: 0 },
  ],
});

/** Every PATCH /api/preferences the page sends, answered as the server would, or with an error. */
function saves({ fails = false } = {}) {
  const sent: PreferencesChange[] = [];
  server.use(
    http.patch(apiUrl(apiRoutes.preferences), async ({ request }) => {
      const change = (await request.json()) as PreferencesChange;
      sent.push(change);
      if (fails) return HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 });
      return HttpResponse.json(makePreferences({ deleteSessionsAfterDays: change.deleteSessionsAfterDays ?? null }));
    }),
  );
  return sent;
}

const storage = () => screen.getByRole('region', { name: 'Storage' });
const picker = () => within(storage()).getByRole('combobox', { name: 'Delete old sessions' });

describe('Storage (spec 047, D)', () => {
  it("AC-16: is Coding agent's last section, reads Never, and says what the session worktrees use", async () => {
    server.use(http.get(apiUrl(apiRoutes.storage), () => HttpResponse.json(measured)));
    await renderApp({ route });

    expect(
      await within(await screen.findByRole('region', { name: 'Storage' })).findByText(
        'Session worktrees use 12 GB on this computer.',
      ),
    ).toBeVisible();
    await waitFor(() => {
      expect(picker()).toBeEnabled();
    });
    expect(picker()).toHaveTextContent('Never');
    expect(within(screen.getByRole('main')).getAllByRole('region').at(-1)).toBe(storage());
  });

  it('AC-16: holds the line while it measures, and leaves it out when measuring fails, still saving', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.storage), async () => {
        await delay('infinite');
        return HttpResponse.json(measured);
      }),
    );
    const first = await renderApp({ route });
    await waitFor(() => {
      expect(picker()).toBeEnabled();
    });
    expect(within(storage()).queryByText(/on this computer/)).toBeNull();
    first.unmount();

    server.use(
      http.get(apiUrl(apiRoutes.storage), () => HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 })),
    );
    const sent = saves();
    const { user } = await renderApp({ route });
    await waitFor(() => {
      expect(picker()).toBeEnabled();
    });
    await user.click(picker());
    await user.click(screen.getByRole('option', { name: 'After 30 days' }));
    await waitFor(() => {
      expect(sent).toEqual([{ deleteSessionsAfterDays: 30 }]);
    });
    expect(within(storage()).queryByText(/on this computer/)).toBeNull();
  });

  it('AC-17: each choice says what it would delete now, and a pick saves at once, sending only that', async () => {
    server.use(http.get(apiUrl(apiRoutes.storage), () => HttpResponse.json(measured)));
    const sent = saves();
    const { user } = await renderApp({ route });
    await within(await screen.findByRole('region', { name: 'Storage' })).findByText(/on this computer/);
    await waitFor(() => {
      expect(picker()).toBeEnabled();
    });

    await user.click(picker());
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Never',
      'After 7 days · 5 sessions now, 6.0 GB',
      'After 14 days · 4 sessions now, 5.0 GB',
      'After 30 days · 3 sessions now, 4.1 GB',
      'After 90 days',
    ]);
    await user.click(screen.getByRole('option', { name: 'After 30 days · 3 sessions now, 4.1 GB' }));

    expect(picker()).toHaveTextContent('After 30 days · 3 sessions now, 4.1 GB');
    await waitFor(() => {
      expect(sent).toEqual([{ deleteSessionsAfterDays: 30 }]);
    });
  });

  it('AC-17: goes back to Never and says so when the save fails', async () => {
    saves({ fails: true });
    const { user } = await renderApp({ route });
    await waitFor(() => {
      expect(picker()).toBeEnabled();
    });
    await user.click(picker());
    await user.click(screen.getByRole('option', { name: 'After 14 days' }));
    expect(await within(storage()).findByText(saveFailed)).toBeVisible();
    expect(picker()).toHaveTextContent('Never');
  });
});
