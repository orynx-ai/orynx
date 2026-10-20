import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeStatus } from '@devhub/contracts/testing';
import { answerWith, mixedStatus } from '../../../test/connections.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

async function rows() {
  const list = await screen.findByRole('list', { name: 'Connections' });
  return within(list).getAllByRole('listitem');
}

describe('ConnectionsPanel (spec 030)', () => {
  it('AC-1: lists Jira, GitHub and Slack with their lines, and a status button for each saying its state', async () => {
    answerWith(mixedStatus);
    await renderApp({ route: '/settings/connections' });

    expect(await screen.findByRole('heading', { name: 'Your tools' })).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Jira: Connected. Manage connection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'GitHub: Needs reconnecting. Manage connection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Slack: Not connected. Manage connection' })).toBeInTheDocument();
    const [jira, github, slack] = await rows();
    expect(jira).toHaveTextContent('JiraPersonal API token for your-team.atlassian.net');
    expect(github).toHaveTextContent("GitHubgh isn't signed in to github.com.");
    expect(slack).toHaveTextContent('SlackReading your mentions needs a Slack app your admin approves.');
  });

  it('AC-2: the page bar says how many tools work, and how many need attention', async () => {
    answerWith(mixedStatus);
    await renderApp({ route: '/settings/connections' });

    expect(await screen.findByText('1 of 3 connected · 1 needs attention')).toBeVisible();
    expect(screen.queryByText('Changes save automatically')).not.toBeInTheDocument();
  });

  it('AC-2: says only how many are connected when nothing needs attention', async () => {
    const status = mixedStatus();
    answerWith(() =>
      makeStatus({ integrations: { ...status.integrations, github: { state: 'not_connected', detail: null } } }),
    );
    await renderApp({ route: '/settings/connections' });

    expect(await screen.findByText('1 of 3 connected')).toBeVisible();
  });

  it('AC-3: spells out the three looks in a key under the list', async () => {
    await renderApp({ route: '/settings/connections' });

    const key = await screen.findByRole('list', { name: 'Status key' });
    expect(
      within(key)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Connected', 'Needs reconnecting', 'Not connected']);
  });

  it('AC-4: a status button shows what pressing does in its tooltip', async () => {
    answerWith(mixedStatus);
    const { user } = await renderApp({ route: '/settings/connections' });

    await user.hover(await screen.findByRole('button', { name: 'GitHub: Needs reconnecting. Manage connection' }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Needs reconnecting · select to fix');
  });

  it('AC-5: while the status loads, every row keeps its place with a round placeholder for its button', async () => {
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
    expect(screen.getByRole('list', { name: 'Connections' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: /Manage connection$/ })).not.toBeInTheDocument();
    answer();

    expect(await screen.findAllByRole('button', { name: /: Not connected\. Manage connection$/ })).toHaveLength(3);
    expect(screen.getByRole('list', { name: 'Connections' })).not.toHaveAttribute('aria-busy');
  });

  it('AC-6: says what to do when the server cannot be reached', async () => {
    server.use(http.get(apiUrl(apiRoutes.status), () => HttpResponse.error()));
    await renderApp({ route: '/settings/connections' });

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the Orynx server');
  });
});
