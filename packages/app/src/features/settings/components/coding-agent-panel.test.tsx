import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type PreferencesChange } from '@devhub/contracts';
import { makePreferences } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const legend = 'What Claude can do without asking';
const saveFailed = "Couldn't save that change. Check that DevHub is still running, then try again.";

/** Answers PATCH /api/preferences once `release` is called, and records what was sent. */
function slowSave() {
  const sent: PreferencesChange[] = [];
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.patch(apiUrl(apiRoutes.preferences), async ({ request }) => {
      const change = (await request.json()) as PreferencesChange;
      sent.push(change);
      await released;
      return HttpResponse.json(makePreferences(change.permissionMode ? { permissionMode: change.permissionMode } : {}));
    }),
  );
  return { sent, release };
}

describe('CodingAgentPanel', () => {
  it('AC-2: offers three modes with their lines, picks the recommended one, and says what always asks', async () => {
    await renderApp({ route: '/settings/coding-agent' });

    const group = await screen.findByRole('radiogroup', { name: legend });
    await waitFor(() => {
      expect(within(group).getByRole('radio', { name: 'Edit files freely, ask before commands' })).toBeChecked();
    });
    expect(within(group).getByRole('radio', { name: 'Ask before everything' })).toHaveAccessibleDescription(
      'Every file edit and every command waits for your click.',
    );
    expect(
      within(group).getByRole('radio', { name: 'Edit files freely, ask before commands' }),
    ).toHaveAccessibleDescription(
      "Recommended. Claude edits files in the session's own copy of the repository; every command waits for your click.",
    );
    expect(
      within(group).getByRole('radio', { name: 'Edit files and run allowed commands' }),
    ).toHaveAccessibleDescription(
      'Commands on your allow list, such as npm test, run without asking. Anything else waits for your click.',
    );
    expect(group).toHaveAccessibleDescription(
      "Commands that reach the network, delete outside the session's folder or push to git always ask, whatever you pick. Claude never pushes code or opens a pull request by itself.",
    );
  });

  it('AC-3: shows the new mode at once, before the server answers, and sends only the mode', async () => {
    const save = slowSave();
    const { user } = await renderApp({ route: '/settings/coding-agent' });
    const everything = await screen.findByRole('radio', { name: 'Ask before everything' });
    await waitFor(() => {
      expect(everything).toBeEnabled();
    });

    await user.click(everything);

    expect(everything).toBeChecked();
    await waitFor(() => {
      expect(save.sent).toEqual([{ permissionMode: 'ask_everything' }]);
    });
    save.release();
    await waitFor(() => {
      expect(everything).toBeChecked();
    });
  });

  it('AC-14: goes back to the saved mode and says so when the save fails, and focus stays put', async () => {
    server.use(
      http.patch(apiUrl(apiRoutes.preferences), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );
    const { user } = await renderApp({ route: '/settings/coding-agent' });
    const everything = await screen.findByRole('radio', { name: 'Ask before everything' });
    await waitFor(() => {
      expect(everything).toBeEnabled();
    });

    await user.click(everything);

    expect(await screen.findByRole('alert')).toHaveTextContent(saveFailed);
    expect(screen.getByRole('radio', { name: 'Edit files freely, ask before commands' })).toBeChecked();
    expect(everything).toHaveFocus();
  });

  it('AC-14: the line goes away with the next change', async () => {
    let fail = true;
    server.use(
      http.patch(apiUrl(apiRoutes.preferences), () =>
        fail
          ? HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 })
          : HttpResponse.json(makePreferences({ permissionMode: 'edit_and_run_allowed' })),
      ),
    );
    const { user } = await renderApp({ route: '/settings/coding-agent' });
    const everything = await screen.findByRole('radio', { name: 'Ask before everything' });
    await waitFor(() => {
      expect(everything).toBeEnabled();
    });
    await user.click(everything);
    await screen.findByRole('alert');

    fail = false;
    await user.click(screen.getByRole('radio', { name: 'Edit files and run allowed commands' }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('AC-15: draws the same choices while the preferences load, none picked and none usable', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.preferences), async () => {
        await delay('infinite');
        return HttpResponse.json(makePreferences());
      }),
    );
    await renderApp({ route: '/settings/coding-agent' });

    const radios = within(await screen.findByRole('radiogroup', { name: legend })).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toBeDisabled();
      expect(radio).not.toBeChecked();
    }
  });

  it('AC-16: says the server is out of reach when the preferences fail to load, and Appearance still works', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.preferences), () =>
        HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 }),
      ),
    );
    const { user } = await renderApp({ route: '/settings/coding-agent' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the DevHub server');

    await user.click(screen.getByRole('tab', { name: 'Appearance' }));
    expect(await screen.findByRole('radio', { name: 'Dark' })).toBeEnabled();
  });

  it('AC-19: the arrow keys move between the modes, and each move saves', async () => {
    const save = slowSave();
    save.release();
    const { user } = await renderApp({ route: '/settings/coding-agent' });
    const recommended = await screen.findByRole('radio', { name: 'Edit files freely, ask before commands' });
    await waitFor(() => {
      expect(recommended).toBeChecked();
    });
    recommended.focus();

    await user.keyboard('{ArrowDown}');

    const allowed = screen.getByRole('radio', { name: 'Edit files and run allowed commands' });
    expect(allowed).toBeChecked();
    expect(allowed).toHaveFocus();
    await waitFor(() => {
      expect(save.sent).toEqual([{ permissionMode: 'edit_and_run_allowed' }]);
    });
  });
});
