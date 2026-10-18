import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeJiraConnection, makeStatus } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { connectedJiraStatus, jiraRow, jiraServer, savedJira } from '../../../test/jira.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** Settings with Jira already connected, and the Manage form open. */
async function openManage() {
  const sent = jiraServer({ connection: makeJiraConnection({ saved: savedJira }), connected: true });
  const app = await renderApp({ route: '/settings/connections' });
  await app.user.click(await within(await jiraRow()).findByRole('button', { name: 'Manage' }));
  return { ...app, sent, form: await screen.findByRole('form', { name: 'Jira connection' }) };
}

async function openForm() {
  const app = await renderApp({ route: '/settings/connections' });
  await app.user.click(await within(await jiraRow()).findByRole('button', { name: 'Connect' }));
  return { ...app, form: await screen.findByRole('form', { name: 'Jira connection' }) };
}

describe('Jira connection row', () => {
  it('AC-1: the Jira row says Not connected and offers Connect', async () => {
    await renderApp({ route: '/settings/connections' });

    const row = await jiraRow();
    expect(await within(row).findByText('Not connected')).toBeVisible();
    expect(within(row).getByRole('button', { name: 'Connect' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('AC-3: connects, closes the form, puts focus on Manage and says so', async () => {
    const sent = jiraServer();
    const { user, form } = await openForm();

    await user.type(within(form).getByLabelText('Jira site'), 'https://your-team.atlassian.net/jira/your-work');
    await user.type(within(form).getByLabelText('Email'), 'dev@example.com');
    await user.type(within(form).getByLabelText('API token'), ' fake-token-for-tests ');
    await user.click(within(form).getByRole('button', { name: 'Connect Jira' }));

    const row = await jiraRow();
    expect(await within(row).findByText('Connected')).toBeVisible();
    expect(row).toHaveTextContent('Personal API token for your-team.atlassian.net');
    expect(screen.queryByRole('form', { name: 'Jira connection' })).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Manage' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Jira is connected.');
    expect(sent).toEqual([
      { site: 'your-team.atlassian.net', email: 'dev@example.com', apiToken: 'fake-token-for-tests' },
    ]);
  });

  it('AC-16: works from the keyboard, and Cancel puts focus back on Connect', async () => {
    const sent = jiraServer();
    const { user } = await renderApp({ route: '/settings/connections' });
    const connect = await within(await jiraRow()).findByRole('button', { name: 'Connect' });
    connect.focus();

    await user.keyboard('{Enter}');
    const form = await screen.findByRole('form', { name: 'Jira connection' });
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('form', { name: 'Jira connection' })).not.toBeInTheDocument();
    expect(within(await jiraRow()).getByRole('button', { name: 'Connect' })).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard('your-team');
    await user.tab();
    await user.keyboard('dev@example.com');
    await user.tab();
    await user.keyboard('fake-token-for-tests{Enter}');

    expect(await within(await jiraRow()).findByText('Connected')).toBeVisible();
    expect(sent).toHaveLength(1);
  });

  it('AC-10: Manage opens the form with the site and email filled in, and the token may stay empty', async () => {
    const { user, form, sent } = await openManage();

    expect(within(form).getByLabelText('Jira site')).toHaveValue('your-team.atlassian.net');
    expect(within(form).getByLabelText('Email')).toHaveValue('dev@example.com');
    expect(within(form).getByLabelText('API token')).toHaveValue('');
    expect(within(form).getByLabelText('API token')).toHaveAccessibleDescription(
      'Leave empty to keep the saved token.',
    );

    await user.clear(within(form).getByLabelText('Email'));
    await user.type(within(form).getByLabelText('Email'), 'new@example.com');
    await user.click(within(form).getByRole('button', { name: 'Connect Jira' }));

    expect(await screen.findByText('Jira is connected.')).toBeInTheDocument();
    expect(sent).toEqual([{ site: 'your-team.atlassian.net', email: 'new@example.com' }]);
  });

  it('AC-11: Disconnect asks first, and Cancel changes nothing', async () => {
    const { user, form, sent } = await openManage();

    await user.click(within(form).getByRole('button', { name: 'Disconnect Jira' }));

    const confirm = within(form).getByRole('group', { name: 'Disconnect Jira?' });
    expect(confirm).toHaveAccessibleDescription(
      'Orynx deletes the API token from your keychain and forgets the site and email.',
    );
    expect(confirm).toHaveFocus();
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(within(form).queryByRole('group', { name: 'Disconnect Jira?' })).not.toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Disconnect Jira' })).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it('AC-11: Disconnect removes Jira, closes the form, puts focus on Connect and says so', async () => {
    const { user, form, sent } = await openManage();

    await user.click(within(form).getByRole('button', { name: 'Disconnect Jira' }));
    await user.click(within(form).getByRole('button', { name: 'Disconnect' }));

    const row = await jiraRow();
    expect(await within(row).findByText('Not connected')).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Jira connection' })).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Connect' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Jira is disconnected.');
    expect(sent).toEqual(['DELETE']);
  });

  it("AC-11: says why when Disconnect can't reach the keychain, and keeps the form", async () => {
    const message = "Orynx can't reach your OS keychain. Unlock it, or turn on the .env fallback (see .env.example).";
    const { user, form } = await openManage();
    server.use(
      http.delete(apiUrl(apiRoutes.jiraConnection), () =>
        HttpResponse.json({ code: 'keychain_unavailable', message }, { status: 503 }),
      ),
    );

    await user.click(within(form).getByRole('button', { name: 'Disconnect Jira' }));
    await user.click(within(form).getByRole('button', { name: 'Disconnect' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(message);
  });

  it('AC-12: with a .env token, says the token may stay empty and connects without one', async () => {
    const sent = jiraServer({ connection: makeJiraConnection({ envToken: true }) });
    const { user, form } = await openForm();

    expect(within(form).getByLabelText('API token')).toHaveAccessibleDescription(
      'Leave empty to use DEVHUB_JIRA_API_TOKEN from .env.',
    );
    await user.type(within(form).getByLabelText('Jira site'), 'your-team');
    await user.type(within(form).getByLabelText('Email'), 'dev@example.com');
    await user.click(within(form).getByRole('button', { name: 'Connect Jira' }));

    expect(await screen.findByText('Jira is connected.')).toBeInTheDocument();
    expect(sent).toEqual([{ site: 'your-team.atlassian.net', email: 'dev@example.com' }]);
  });

  it('AC-14: follows a change made in another tab, without a reload', async () => {
    let connectedElsewhere = false;
    server.use(
      http.get(apiUrl(apiRoutes.jiraConnection), () =>
        HttpResponse.json(makeJiraConnection({ saved: connectedElsewhere ? savedJira : null })),
      ),
      http.get(apiUrl(apiRoutes.status), () =>
        HttpResponse.json(connectedElsewhere ? connectedJiraStatus : makeStatus()),
      ),
    );
    await renderApp({ route: '/settings/connections' });
    expect(await within(await jiraRow()).findByRole('button', { name: 'Connect' })).toBeVisible();

    connectedElsewhere = true;
    FakeEventSource.latest().emit({ type: 'status.changed' });

    const row = await jiraRow();
    expect(await within(row).findByText('Connected')).toBeVisible();
    expect(await within(row).findByRole('button', { name: 'Manage' })).toBeVisible();
  });

  it("says the Orynx server can't be reached when the Jira settings don't load, and points at no missing form", async () => {
    server.use(http.get(apiUrl(apiRoutes.jiraConnection), () => HttpResponse.error()));
    const { user } = await renderApp({ route: '/settings/connections' });
    const row = await jiraRow();

    await user.click(within(row).getByRole('button', { name: 'Connect' }));

    expect(await within(row).findByRole('alert')).toHaveTextContent('Could not reach the Orynx server.');
    expect(within(row).getByRole('button', { name: 'Close' })).not.toHaveAttribute('aria-controls');
  });

  it('AC-11: once Disconnect is on its way, Cancel in the confirm step waits', async () => {
    const { user, form } = await openManage();
    server.use(
      http.delete(apiUrl(apiRoutes.jiraConnection), async () => {
        await delay('infinite');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await user.click(within(form).getByRole('button', { name: 'Disconnect Jira' }));
    await user.click(within(form).getByRole('button', { name: 'Disconnect' }));

    const cancel = within(form).getByRole('button', { name: 'Cancel' });
    await expect.poll(() => cancel.getAttribute('aria-disabled')).toBe('true');
    await user.click(cancel);
    expect(within(form).getByRole('group', { name: 'Disconnect Jira?' })).toBeVisible();
  });
});
