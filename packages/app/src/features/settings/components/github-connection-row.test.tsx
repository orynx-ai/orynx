import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeGitHubConnection, makeStatus } from '@devhub/contracts/testing';
import { githubRow, githubServer } from '../../../test/github.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

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
});
