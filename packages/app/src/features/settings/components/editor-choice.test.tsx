import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type PreferencesChange } from '@devhub/contracts';
import { makePreferences } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const route = '/settings/coding-agent';
const saveFailed = "Couldn't save that change. Check that Orynx is still running, then try again.";

/** Every PATCH /api/preferences the page sends, answered as the server would, or with an error. */
function saves({ fails = false } = {}) {
  const sent: PreferencesChange[] = [];
  server.use(
    http.patch(apiUrl(apiRoutes.preferences), async ({ request }) => {
      const change = (await request.json()) as PreferencesChange;
      sent.push(change);
      if (fails) return HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 });
      return HttpResponse.json(makePreferences(change.editor === undefined ? {} : { editor: change.editor }));
    }),
  );
  return sent;
}

const editors = () => screen.getByRole('radiogroup', { name: 'Editor' });

describe('EditorChoice', () => {
  it('AC-26: offers VS Code and Cursor, VS Code picked by default', async () => {
    await renderApp({ route });
    const group = await screen.findByRole('radiogroup', { name: 'Editor' });
    await waitFor(() => {
      expect(within(group).getByRole('radio', { name: 'VS Code' })).toBeChecked();
    });
    expect(within(group).getByRole('radio', { name: 'Cursor' })).not.toBeChecked();
  });

  it('AC-26: saves Cursor as you pick it, shown at once, sending only the editor', async () => {
    const sent = saves();
    const { user } = await renderApp({ route });
    await waitFor(() => {
      expect(within(editors()).getByRole('radio', { name: 'VS Code' })).toBeEnabled();
    });
    await user.click(within(editors()).getByRole('radio', { name: 'Cursor' }));
    expect(within(editors()).getByRole('radio', { name: 'Cursor' })).toBeChecked();
    await waitFor(() => {
      expect(sent).toEqual([{ editor: 'cursor' }]);
    });
  });

  it('AC-26: goes back to VS Code and says so when the save fails', async () => {
    saves({ fails: true });
    const { user } = await renderApp({ route });
    await waitFor(() => {
      expect(within(editors()).getByRole('radio', { name: 'VS Code' })).toBeEnabled();
    });
    await user.click(within(editors()).getByRole('radio', { name: 'Cursor' }));
    expect(await screen.findByText(saveFailed)).toBeVisible();
    expect(within(editors()).getByRole('radio', { name: 'VS Code' })).toBeChecked();
  });

  it('AC-26: the arrow keys move between the two, and each move saves', async () => {
    const sent = saves();
    const { user } = await renderApp({ route });
    await waitFor(() => {
      expect(within(editors()).getByRole('radio', { name: 'VS Code' })).toBeEnabled();
    });
    within(editors()).getByRole('radio', { name: 'VS Code' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(within(editors()).getByRole('radio', { name: 'Cursor' })).toHaveFocus();
    await waitFor(() => {
      expect(sent).toEqual([{ editor: 'cursor' }]);
    });
  });

  it('AC-26: draws the two choices while the preferences load, none picked and none usable', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.preferences), async () => {
        await delay('infinite');
        return HttpResponse.json(makePreferences());
      }),
    );
    await renderApp({ route });
    const group = await screen.findByRole('radiogroup', { name: 'Editor' });
    for (const name of ['VS Code', 'Cursor']) {
      expect(within(group).getByRole('radio', { name })).toBeDisabled();
      expect(within(group).getByRole('radio', { name })).not.toBeChecked();
    }
  });
});
