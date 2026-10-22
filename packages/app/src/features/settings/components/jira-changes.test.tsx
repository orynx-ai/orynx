import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type PreferencesChange } from '@devhub/contracts';
import { makePreferences } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** Settings on the server: what it holds, and each change sent. */
function serveSettings({ jiraChanges = false, fails = false } = {}) {
  let held = jiraChanges;
  const sent: PreferencesChange[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.preferences), () => HttpResponse.json(makePreferences({ jiraChanges: held }))),
    http.patch(apiUrl(apiRoutes.preferences), async ({ request }) => {
      const change = (await request.json()) as PreferencesChange;
      sent.push(change);
      if (fails) return HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 });
      held = change.jiraChanges ?? held;
      return HttpResponse.json(makePreferences({ jiraChanges: held }));
    }),
  );
  return sent;
}

const toggle = () => screen.getByRole('switch', { name: 'Claude changes Jira' });

describe('Claude changes Jira (spec 044, Q8)', () => {
  it('is off by default, and says what turning it on does', async () => {
    serveSettings();
    const { container } = await renderApp({ route: '/settings/coding-agent' });

    expect(await screen.findByRole('switch', { name: 'Claude changes Jira' })).not.toBeChecked();
    expect(screen.getByText('Comments, status changes and assigning run without asking you first')).toBeVisible();
    await expectNoAxeViolations(container);
  });

  it('turns on, saves only that, and stays on', async () => {
    const sent = serveSettings();
    const { user } = await renderApp({ route: '/settings/coding-agent' });

    await user.click(await screen.findByRole('switch', { name: 'Claude changes Jira' }));

    await waitFor(() => {
      expect(sent).toEqual([{ jiraChanges: true }]);
    });
    expect(toggle()).toBeChecked();
  });

  it('goes back and says so when the save fails', async () => {
    serveSettings({ fails: true });
    const { user } = await renderApp({ route: '/settings/coding-agent' });

    await user.click(await screen.findByRole('switch', { name: 'Claude changes Jira' }));

    expect(await screen.findByRole('alert')).toBeVisible();
    await waitFor(() => {
      expect(toggle()).not.toBeChecked();
    });
  });
});
