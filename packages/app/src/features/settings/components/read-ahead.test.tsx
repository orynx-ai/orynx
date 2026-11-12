import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type PreferencesChange } from '@devhub/contracts';
import { makePreferences } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** Settings on the server: what it holds, and each change sent. */
function serveSettings() {
  let held = false;
  const sent: PreferencesChange[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.preferences), () => HttpResponse.json(makePreferences({ readReviewsAhead: held }))),
    http.patch(apiUrl(apiRoutes.preferences), async ({ request }) => {
      const change = (await request.json()) as PreferencesChange;
      sent.push(change);
      held = change.readReviewsAhead ?? held;
      return HttpResponse.json(makePreferences({ readReviewsAhead: held }));
    }),
  );
  return sent;
}

describe('Read review requests ahead (spec 057, AC-34)', () => {
  it('is off, says what it does and that it posts nothing, and saves as you switch it', async () => {
    const sent = serveSettings();
    const { container, user } = await renderApp({ route: '/settings/coding-agent' });

    const toggle = await screen.findByRole('switch', { name: 'Read review requests ahead' });
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText(
        'Claude reviews each new request in the background, so a draft is ready when you open it. Nothing is posted until you press Post. Uses your Claude plan.',
      ),
    ).toBeVisible();
    await expectNoAxeViolations(container);

    await waitFor(() => {
      expect(toggle).toBeEnabled();
    });
    await user.click(toggle);
    await waitFor(() => {
      expect(toggle).toBeChecked();
    });
    expect(sent).toEqual([{ readReviewsAhead: true }]);
  });
});
