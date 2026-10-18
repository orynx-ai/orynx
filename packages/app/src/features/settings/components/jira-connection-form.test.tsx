import { fireEvent, screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeJiraConnection } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { failingJiraSave, jiraRow, jiraServer, savedJira } from '../../../test/jira.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

async function openForm() {
  const app = await renderApp({ route: '/settings/connections' });
  await app.user.click(await within(await jiraRow()).findByRole('button', { name: 'Connect' }));
  return { ...app, form: await screen.findByRole('form', { name: 'Jira connection' }) };
}

describe('Jira connection form', () => {
  it('AC-2: Connect opens the form in the row, with a label and help on each field, and focus on Jira site', async () => {
    const { form } = await openForm();

    const site = within(form).getByRole('textbox', { name: 'Jira site' });
    expect(site).toHaveFocus();
    expect(site).toHaveAccessibleDescription('The address you open Jira at, like your-team.atlassian.net.');
    expect(within(form).getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription(
      'The email you sign in to Jira with.',
    );
    expect(within(form).getByLabelText('API token')).toHaveAttribute('type', 'password');
    // Browsers ignore "off" on a password and offer to save it as a sign-in; they never save a one-time code.
    expect(within(form).getByLabelText('API token')).toHaveAttribute('autocomplete', 'one-time-code');
    expect(within(form).getByRole('link', { name: 'Create an API token' })).toHaveAttribute(
      'href',
      'https://id.atlassian.com/manage-profile/security/api-tokens',
    );
    expect(within(await jiraRow()).getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('AC-2: the token link opens outside DevHub', async () => {
    const { user, form, platform } = await openForm();

    await user.click(within(form).getByRole('link', { name: 'Create an API token' }));

    expect(platform.openExternal).toHaveBeenCalledWith('https://id.atlassian.com/manage-profile/security/api-tokens');
  });

  it('AC-4: puts a refused token under API token and keeps what was typed', async () => {
    failingJiraSave(422, {
      code: 'integration_rejected',
      message: "Jira didn't accept this email and API token. Check both, or create a new token.",
    });
    const { user, form } = await openForm();

    await user.type(within(form).getByLabelText('Jira site'), 'your-team');
    await user.type(within(form).getByLabelText('Email'), 'dev@example.com');
    await user.type(within(form).getByLabelText('API token'), 'fake-wrong-token');
    await user.click(within(form).getByRole('button', { name: 'Connect Jira' }));

    const token = within(form).getByLabelText('API token');
    await expect.poll(() => token.getAttribute('aria-invalid')).toBe('true');
    expect(token).toHaveAccessibleDescription(
      "Jira didn't accept this email and API token. Check both, or create a new token.",
    );
    expect(within(form).getByRole('link', { name: 'Create an API token' })).toBeVisible();
    expect(token).toHaveFocus();
    expect(within(form).getByLabelText('Jira site')).toHaveValue('your-team');
    expect(within(form).getByLabelText('Email')).toHaveValue('dev@example.com');
  });

  it("AC-5: puts an address that can't be reached under Jira site", async () => {
    failingJiraSave(502, {
      code: 'integration_unreachable',
      message: "There's no Jira at nobody.atlassian.net. Check the address.",
    });
    const { user, form } = await openForm();

    await user.type(within(form).getByLabelText('Jira site'), 'nobody');
    await user.type(within(form).getByLabelText('Email'), 'dev@example.com');
    await user.type(within(form).getByLabelText('API token'), 'fake-token-for-tests');
    await user.click(within(form).getByRole('button', { name: 'Connect Jira' }));

    const site = within(form).getByLabelText('Jira site');
    await expect.poll(() => site.getAttribute('aria-invalid')).toBe('true');
    expect(site).toHaveAccessibleDescription("There's no Jira at nobody.atlassian.net. Check the address.");
  });

  it('puts "Paste your Jira API token." under API token when the server has no token after all', async () => {
    failingJiraSave(400, { code: 'bad_request', message: 'Paste your Jira API token.' });
    const { user, form } = await openForm();

    await user.type(within(form).getByLabelText('Jira site'), 'your-team');
    await user.type(within(form).getByLabelText('Email'), 'dev@example.com');
    await user.type(within(form).getByLabelText('API token'), 'fake-token-for-tests');
    await user.click(within(form).getByRole('button', { name: 'Connect Jira' }));

    const token = within(form).getByLabelText('API token');
    await expect.poll(() => token.getAttribute('aria-invalid')).toBe('true');
    expect(token).toHaveAccessibleDescription('Paste your Jira API token.');
    expect(within(form).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('AC-7: says what each empty field needs, focuses the first, and sends nothing', async () => {
    const sent = jiraServer();
    const { user, form } = await openForm();

    await user.click(within(form).getByRole('button', { name: 'Connect Jira' }));

    const site = within(form).getByLabelText('Jira site');
    await expect.poll(() => site.getAttribute('aria-invalid')).toBe('true');
    expect(site).toHaveAccessibleDescription('Enter the address you open Jira at.');
    expect(site).toHaveFocus();
    expect(within(form).getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter the email you sign in to Jira with.',
    );
    expect(within(form).getByLabelText('API token')).toHaveAccessibleDescription('Paste your Jira API token.');
    expect(sent).toEqual([]);
  });

  it('AC-7: refuses an address off atlassian.net and a token with a space inside', async () => {
    const sent = jiraServer();
    const { user, form } = await openForm();

    await user.type(within(form).getByLabelText('Jira site'), 'your-team.atlasian.net');
    await user.type(within(form).getByLabelText('Email'), 'dev@example.com');
    await user.type(within(form).getByLabelText('API token'), 'fake token');
    await user.click(within(form).getByRole('button', { name: 'Connect Jira' }));

    await expect.poll(() => within(form).getByLabelText('Jira site').getAttribute('aria-invalid')).toBe('true');
    expect(within(form).getByLabelText('Jira site')).toHaveAccessibleDescription(
      'Use your Jira Cloud address, like your-team.atlassian.net.',
    );
    expect(within(form).getByLabelText('API token')).toHaveAccessibleDescription(
      'Paste the token without spaces or line breaks.',
    );
    expect(sent).toEqual([]);
  });

  it("AC-8: says the keychain can't be reached in one line above the buttons", async () => {
    const message = "Orynx can't reach your OS keychain. Unlock it, or turn on the .env fallback (see .env.example).";
    failingJiraSave(503, { code: 'keychain_unavailable', message });
    const { user, form } = await openForm();

    await user.type(within(form).getByLabelText('Jira site'), 'your-team');
    await user.type(within(form).getByLabelText('Email'), 'dev@example.com');
    await user.type(within(form).getByLabelText('API token'), 'fake-token-for-tests');
    await user.click(within(form).getByRole('button', { name: 'Connect Jira' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(message);
  });

  it('AC-13: while Jira is checked, Connect Jira waits and a second press sends nothing', async () => {
    let calls = 0;
    server.use(
      http.put(apiUrl(apiRoutes.jiraConnection), async () => {
        calls += 1;
        await delay('infinite');
        return HttpResponse.json(makeJiraConnection({ saved: savedJira }));
      }),
    );
    const { user, form } = await openForm();
    await user.type(within(form).getByLabelText('Jira site'), 'your-team');
    await user.type(within(form).getByLabelText('Email'), 'dev@example.com');
    await user.type(within(form).getByLabelText('API token'), 'fake-token-for-tests');

    const connect = within(form).getByRole('button', { name: 'Connect Jira' });
    await user.click(connect);
    await expect.poll(() => connect.getAttribute('aria-disabled')).toBe('true');
    await user.click(connect);
    await user.type(within(form).getByLabelText('API token'), '{Enter}');

    expect(calls).toBe(1);
  });

  it('AC-13: two presses before the page can show it waits still send one request', async () => {
    const sent = jiraServer();
    const { user, form } = await openForm();
    await user.type(within(form).getByLabelText('Jira site'), 'your-team');
    await user.type(within(form).getByLabelText('Email'), 'dev@example.com');
    await user.type(within(form).getByLabelText('API token'), 'fake-token-for-tests');

    // Back to back, with no render between them: faster than any person, so the guard can't lean on the button.
    const connect = within(form).getByRole('button', { name: 'Connect Jira' });
    fireEvent.click(connect);
    fireEvent.click(connect);

    expect(await screen.findByText('Jira is connected.')).toBeInTheDocument();
    expect(sent).toHaveLength(1);
  });

  it("AC-13: while Jira is checked, Cancel and Close can't close the form", async () => {
    server.use(
      http.put(apiUrl(apiRoutes.jiraConnection), async () => {
        await delay('infinite');
        return HttpResponse.json(makeJiraConnection({ saved: savedJira }));
      }),
    );
    const { user, form } = await openForm();
    await user.type(within(form).getByLabelText('Jira site'), 'your-team');
    await user.type(within(form).getByLabelText('Email'), 'dev@example.com');
    await user.type(within(form).getByLabelText('API token'), 'fake-token-for-tests');
    await user.click(within(form).getByRole('button', { name: 'Connect Jira' }));
    const cancel = within(form).getByRole('button', { name: 'Cancel' });
    await expect.poll(() => cancel.getAttribute('aria-disabled')).toBe('true');

    await user.click(cancel);
    await user.click(within(await jiraRow()).getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('form', { name: 'Jira connection' })).toBeVisible();
  });

  it('AC-16: has no accessibility violations with the form open and showing errors', async () => {
    const { user, form, container } = await openForm();
    await user.click(within(form).getByRole('button', { name: 'Connect Jira' }));
    await expect.poll(() => within(form).getByLabelText('Jira site').getAttribute('aria-invalid')).toBe('true');

    await expectNoAxeViolations(container);
  });
});
