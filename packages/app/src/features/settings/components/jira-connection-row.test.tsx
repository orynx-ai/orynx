import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { jiraRow, jiraServer } from '../../../test/jira.ts';
import { renderApp } from '../../../test/render.tsx';

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
});
