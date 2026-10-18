import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeGitHubConnection, makeStatus } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { githubRow, githubServer } from '../../../test/github.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** Settings with GitHub already connected the given way, and the Manage form open. */
async function openManage(method: 'gh' | 'token') {
  const sent = githubServer({ connection: makeGitHubConnection({ saved: { method }, ghFound: true }) });
  const app = await renderApp({ route: '/settings/connections' });
  await app.user.click(await within(await githubRow()).findByRole('button', { name: 'Manage' }));
  return { ...app, sent, form: await screen.findByRole('form', { name: 'GitHub connection' }) };
}

describe('GitHub connection row', () => {
  it('AC-1: the GitHub row says Not connected and offers Connect', async () => {
    await renderApp({ route: '/settings/connections' });

    const row = await githubRow();
    expect(await within(row).findByText('Not connected')).toBeVisible();
    expect(row).toHaveTextContent('Reuses your gh command-line login, or a personal access token.');
    expect(within(row).getByRole('button', { name: 'Connect' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('AC-3: connects the gh way, closes the form, puts focus on Manage, and names the account', async () => {
    githubServer();
    const { user } = await renderApp({ route: '/settings/connections' });
    await user.click(await within(await githubRow()).findByRole('button', { name: 'Connect' }));
    const form = await screen.findByRole('form', { name: 'GitHub connection' });

    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));

    const row = await githubRow();
    expect(await within(row).findByText('Connected')).toBeVisible();
    expect(row).toHaveTextContent('Signed in as octocat with the gh command-line tool');
    expect(screen.queryByRole('form', { name: 'GitHub connection' })).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Manage' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('GitHub is connected.');
  });

  it('AC-18: works from the keyboard, and Cancel puts focus back on Connect', async () => {
    const sent = githubServer({ connection: makeGitHubConnection({ ghFound: true }) });
    const { user } = await renderApp({ route: '/settings/connections' });
    const connect = await within(await githubRow()).findByRole('button', { name: 'Connect' });
    connect.focus();

    await user.keyboard('{Enter}');
    const form = await screen.findByRole('form', { name: 'GitHub connection' });
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'GitHub connection' })).not.toBeInTheDocument();
    expect(within(await githubRow()).getByRole('button', { name: 'Connect' })).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');

    expect(await within(await githubRow()).findByText('Connected')).toBeVisible();
    expect(sent).toEqual([{ method: 'gh' }]);
  });

  it('AC-11: shows why the saved connection stopped working', async () => {
    const detail = "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again.";
    server.use(
      http.get(apiUrl(apiRoutes.status), () =>
        HttpResponse.json(makeStatus({ integrations: { github: { state: 'error', detail } } })),
      ),
      http.get(apiUrl(apiRoutes.githubConnection), () =>
        HttpResponse.json(makeGitHubConnection({ saved: { method: 'gh' }, ghFound: true })),
      ),
    );
    await renderApp({ route: '/settings/connections' });

    const row = await githubRow();
    expect(await within(row).findByText('Error')).toBeVisible();
    expect(row).toHaveTextContent(detail);
    expect(within(row).getByRole('button', { name: 'Manage' })).toBeVisible();
  });

  it('AC-12: Manage opens the form on the saved token way, and an empty token keeps the saved one', async () => {
    const { user, form, sent } = await openManage('token');

    expect(within(form).getByRole('radio', { name: 'Use a personal access token' })).toBeChecked();
    const token = within(form).getByLabelText('Personal access token');
    expect(token).toHaveValue('');
    expect(token).toHaveAccessibleDescription('Leave empty to keep the saved token.');
    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));

    expect(await screen.findByText('GitHub is connected.')).toBeInTheDocument();
    expect(sent).toEqual([{ method: 'token' }]);
  });

  it('AC-12: Manage opens the form on the saved gh way', async () => {
    const { form } = await openManage('gh');

    expect(within(form).getByRole('radio', { name: 'Use my gh login' })).toBeChecked();
    expect(within(form).queryByLabelText('Personal access token')).not.toBeInTheDocument();
  });

  it('AC-14: with a .env token, says the token may stay empty and connects without one', async () => {
    const sent = githubServer({ connection: makeGitHubConnection({ envToken: true }) });
    const { user } = await renderApp({ route: '/settings/connections' });
    await user.click(await within(await githubRow()).findByRole('button', { name: 'Connect' }));
    const form = await screen.findByRole('form', { name: 'GitHub connection' });

    expect(within(form).getByLabelText('Personal access token')).toHaveAccessibleDescription(
      'Leave empty to use DEVHUB_GITHUB_TOKEN from .env.',
    );
    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));

    expect(await screen.findByText('GitHub is connected.')).toBeInTheDocument();
    expect(sent).toEqual([{ method: 'token' }]);
  });

  it.each([
    ['gh', 'Orynx stops using your gh login. gh stays signed in.'],
    ['token', 'Orynx deletes the token from your keychain.'],
  ] as const)('AC-13: Disconnect from the %s way asks first, and Cancel changes nothing', async (method, line) => {
    const { user, form, sent } = await openManage(method);

    await user.click(within(form).getByRole('button', { name: 'Disconnect GitHub' }));

    const confirm = within(form).getByRole('group', { name: 'Disconnect GitHub?' });
    expect(confirm).toHaveAccessibleDescription(line);
    expect(confirm).toHaveFocus();
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(within(form).queryByRole('group', { name: 'Disconnect GitHub?' })).not.toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Disconnect GitHub' })).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it('AC-13: Disconnect removes GitHub, closes the form, puts focus on Connect and says so', async () => {
    const { user, form, sent } = await openManage('gh');

    await user.click(within(form).getByRole('button', { name: 'Disconnect GitHub' }));
    await user.click(within(form).getByRole('button', { name: 'Disconnect' }));

    const row = await githubRow();
    expect(await within(row).findByText('Not connected')).toBeVisible();
    expect(screen.queryByRole('form', { name: 'GitHub connection' })).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Connect' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('GitHub is disconnected.');
    expect(sent).toEqual(['DELETE']);
  });

  it("AC-13: says why when Disconnect can't reach the keychain, and keeps the form", async () => {
    const message = "Orynx can't reach your OS keychain. Unlock it, or turn on the .env fallback (see .env.example).";
    const { user, form } = await openManage('token');
    server.use(
      http.delete(apiUrl(apiRoutes.githubConnection), () =>
        HttpResponse.json({ code: 'keychain_unavailable', message }, { status: 503 }),
      ),
    );

    await user.click(within(form).getByRole('button', { name: 'Disconnect GitHub' }));
    await user.click(within(form).getByRole('button', { name: 'Disconnect' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(message);
  });

  it('AC-16: follows a change made in another tab, without a reload', async () => {
    let connectedElsewhere = false;
    server.use(
      http.get(apiUrl(apiRoutes.githubConnection), () =>
        HttpResponse.json(makeGitHubConnection({ saved: connectedElsewhere ? { method: 'gh' } : null })),
      ),
      http.get(apiUrl(apiRoutes.status), () =>
        HttpResponse.json(
          connectedElsewhere
            ? makeStatus({
                integrations: {
                  github: { state: 'connected', detail: 'Signed in as octocat with the gh command-line tool' },
                },
              })
            : makeStatus(),
        ),
      ),
    );
    await renderApp({ route: '/settings/connections' });
    expect(await within(await githubRow()).findByRole('button', { name: 'Connect' })).toBeVisible();

    connectedElsewhere = true;
    FakeEventSource.latest().emit({ type: 'status.changed' });

    const row = await githubRow();
    expect(await within(row).findByText('Connected')).toBeVisible();
    expect(await within(row).findByRole('button', { name: 'Manage' })).toBeVisible();
  });
});
