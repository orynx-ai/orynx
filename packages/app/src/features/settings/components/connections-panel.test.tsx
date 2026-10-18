import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeGitHubConnection, makeStatus } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

async function rows() {
  const list = await screen.findByRole('list', { name: 'Connections' });
  return within(list).getAllByRole('listitem');
}

/** The connection row for one tool, found by the name a person reads. */
async function row(name: 'Jira' | 'GitHub' | 'Slack') {
  const item = (await rows()).find((li) => within(li).queryByText(name, { selector: 'span' }) !== null);
  if (!item) throw new Error(`No connection row for ${name}`);
  return item;
}

describe('ConnectionsPanel', () => {
  it('lists Jira, GitHub and Slack as not connected, with how to connect each', async () => {
    await renderApp({ route: '/settings/connections' });

    expect(await within(await row('Jira')).findByText('Not connected')).toBeVisible();
    expect(await rows()).toHaveLength(3);
    expect(await row('GitHub')).toHaveTextContent('Reuses your gh command-line login, or a personal access token.');
    expect(await row('Slack')).toHaveTextContent('Reading your mentions needs a Slack app your admin approves.');
  });

  it('shows each state in words and the detail the server sends', async () => {
    const base = makeStatus().integrations;
    server.use(
      http.get(apiUrl(apiRoutes.status), () =>
        HttpResponse.json(
          makeStatus({
            integrations: {
              jira: { state: 'connected', detail: 'Personal API token for your-team.atlassian.net' },
              github: { state: 'error', detail: 'The token was revoked. Connect again.' },
              slack: { ...base.slack, state: 'needs_admin_approval' },
            },
          }),
        ),
      ),
    );
    await renderApp({ route: '/settings/connections' });

    const jira = await row('Jira');
    expect(await within(jira).findByText('Connected')).toBeVisible();
    expect(jira).toHaveTextContent('Personal API token for your-team.atlassian.net');
    expect(within(await row('GitHub')).getByText('Error')).toBeVisible();
    expect(within(await row('Slack')).getByText('Needs admin approval')).toBeVisible();
  });

  it('keeps every row in place while the status loads', async () => {
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    server.use(
      http.get(apiUrl(apiRoutes.status), async () => {
        await answered;
        return HttpResponse.json(makeStatus());
      }),
    );
    await renderApp({ route: '/settings/connections' });

    expect(await rows()).toHaveLength(3);
    expect(within(await row('Jira')).getByText('Checking')).toHaveAttribute('aria-busy', 'true');

    answer();

    expect(await within(await row('Jira')).findByText('Not connected')).toBeVisible();
    expect(await rows()).toHaveLength(3);
  });

  it('says what to do when the server cannot be reached', async () => {
    server.use(http.get(apiUrl(apiRoutes.status), () => HttpResponse.error()));
    await renderApp({ route: '/settings/connections' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not reach the Orynx server');
  });

  it('opens one connection form at a time, so the page never has two primary buttons', async () => {
    const { user } = await renderApp({ route: '/settings/connections' });

    await user.click(await within(await row('Jira')).findByRole('button', { name: 'Connect' }));
    expect(screen.getByRole('form', { name: 'Jira connection' })).toBeVisible();
    await user.click(within(await row('GitHub')).getByRole('button', { name: 'Connect' }));

    expect(screen.queryByRole('form', { name: 'Jira connection' })).not.toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'GitHub connection' })).toBeVisible();
    expect(within(await row('Jira')).getByRole('button', { name: 'Connect' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getAllByRole('button', { name: /^Connect (Jira|GitHub)$/ })).toHaveLength(1);
  });

  it("while one tool's change is on its way, the other rows' buttons wait", async () => {
    server.use(
      http.get(apiUrl(apiRoutes.githubConnection), () => HttpResponse.json(makeGitHubConnection({ ghFound: true }))),
      http.put(apiUrl(apiRoutes.githubConnection), async () => {
        await delay('infinite');
        return HttpResponse.json(makeGitHubConnection({ saved: { method: 'gh' } }));
      }),
    );
    const { user } = await renderApp({ route: '/settings/connections' });
    await user.click(await within(await row('GitHub')).findByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Connect GitHub' }));

    const jira = within(await row('Jira')).getByRole('button', { name: 'Connect' });
    await expect.poll(() => jira.getAttribute('aria-disabled')).toBe('true');
    await user.click(jira);

    expect(screen.queryByRole('form', { name: 'Jira connection' })).not.toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'GitHub connection' })).toBeVisible();
  });
});
