import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type IntegrationStatus } from '@devhub/contracts';
import { makeGitHubConnection, makeJiraConnection, makeStatus } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const saved = { site: 'your-team.atlassian.net', email: 'dev@example.com' };
const revoked = "Jira didn't accept this email and API token. Check both, or create a new token.";

/** A hub whose saved Jira token was revoked: PUT answers `answer`, and a good answer turns Jira connected. */
function revokedJira(answer: () => Response = () => HttpResponse.json(makeJiraConnection({ saved }))) {
  const sent: unknown[] = [];
  let jira: IntegrationStatus = { state: 'error', detail: revoked, account: saved.email };
  server.use(
    http.get(apiUrl(apiRoutes.status), () => HttpResponse.json(makeStatus({ integrations: { jira } }))),
    http.get(apiUrl(apiRoutes.jiraConnection), () => HttpResponse.json(makeJiraConnection({ saved }))),
    http.put(apiUrl(apiRoutes.jiraConnection), async ({ request }) => {
      sent.push(await request.json());
      const response = answer();
      if (response.ok) jira = { state: 'connected', detail: 'Personal API token for your-team.atlassian.net' };
      return response;
    }),
  );
  return sent;
}

async function openJira() {
  const app = await renderApp({ route: '/settings/connections' });
  await app.user.click(await screen.findByRole('button', { name: 'Jira: Needs reconnecting. Manage connection' }));
  return { ...app, dialog: await screen.findByRole('dialog', { name: 'Jira' }) };
}

describe('Reconnect with a token (spec 030, Q3)', () => {
  it('AC-19: says why, and asks for one new token with a link to create it', async () => {
    revokedJira();
    const { dialog } = await openJira();

    expect(within(dialog).getByText(revoked)).toBeVisible();
    const token = within(dialog).getByLabelText('API token');
    expect(token).toHaveAttribute('type', 'password');
    expect(token).toHaveAccessibleDescription('Paste a new token, or leave this empty to try the saved one again.');
    expect(within(dialog).getByRole('link', { name: 'Create an API token' })).toHaveAttribute(
      'href',
      'https://id.atlassian.com/manage-profile/security/api-tokens',
    );
    expect(within(dialog).queryByLabelText('Jira site')).not.toBeInTheDocument();
    for (const name of ['Disconnect', 'Cancel', 'Reconnect']) {
      expect(within(dialog).getByRole('button', { name })).toBeInTheDocument();
    }
    await expectNoAxeViolations(dialog);
  });

  it('AC-19: Reconnect saves the new token with the saved site and email, then shuts the dialog and says so', async () => {
    const sent = revokedJira();
    const { user, dialog } = await openJira();

    await user.type(within(dialog).getByLabelText('API token'), ' fake-new-token ');
    await user.click(within(dialog).getByRole('button', { name: 'Reconnect' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(sent).toEqual([{ ...saved, apiToken: 'fake-new-token' }]);
    expect(await screen.findByText('Jira reconnected. Your inbox is refreshing.')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Jira: Connected. Manage connection' })).toBeInTheDocument();
  });

  it('AC-19: left empty, Reconnect tries the saved token again', async () => {
    const sent = revokedJira();
    const { user, dialog } = await openJira();

    await user.click(within(dialog).getByRole('button', { name: 'Reconnect' }));

    await waitFor(() => {
      expect(sent).toEqual([saved]);
    });
  });

  it('AC-19: a refused token is said under the field, and the dialog stays with what was typed', async () => {
    revokedJira(() => HttpResponse.json({ code: 'integration_rejected', message: revoked }, { status: 422 }));
    const { user, dialog } = await openJira();
    const token = within(dialog).getByLabelText('API token');

    await user.type(token, 'fake-wrong-token');
    await user.click(within(dialog).getByRole('button', { name: 'Reconnect' }));

    await expect.poll(() => token.getAttribute('aria-invalid')).toBe('true');
    expect(token).toHaveAccessibleDescription(revoked);
    expect(token).toHaveValue('fake-wrong-token');
    expect(screen.getByRole('dialog', { name: 'Jira' })).toBeVisible();
  });

  it('AC-19: a GitHub token is reconnected the token way', async () => {
    const sent: unknown[] = [];
    server.use(
      http.get(apiUrl(apiRoutes.status), () =>
        HttpResponse.json(
          makeStatus({
            integrations: {
              github: { state: 'error', detail: "GitHub didn't accept this token. Check it, or create a new one." },
            },
          }),
        ),
      ),
      http.get(apiUrl(apiRoutes.githubConnection), () =>
        HttpResponse.json(makeGitHubConnection({ saved: { method: 'token' } })),
      ),
      http.put(apiUrl(apiRoutes.githubConnection), async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(makeGitHubConnection({ saved: { method: 'token' } }));
      }),
    );
    const { user } = await renderApp({ route: '/settings/connections' });
    await user.click(await screen.findByRole('button', { name: 'GitHub: Needs reconnecting. Manage connection' }));
    const dialog = await screen.findByRole('dialog', { name: 'GitHub' });

    expect(within(dialog).getByRole('link', { name: 'Create a token' })).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Personal access token'), 'fake-github-token');
    await user.click(within(dialog).getByRole('button', { name: 'Reconnect' }));

    await waitFor(() => {
      expect(sent).toEqual([{ method: 'token', token: 'fake-github-token' }]);
    });
  });
});
