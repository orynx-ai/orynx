import { fireEvent, screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type GitHubConnection } from '@devhub/contracts';
import { makeGitHubConnection } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { failingGitHubSave, githubServer } from '../../../test/github.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const newTokenUrl = 'https://github.com/settings/tokens/new?scopes=repo&description=Orynx';

async function openForm(connection: GitHubConnection = makeGitHubConnection({ ghFound: true })) {
  const sent = githubServer({ connection });
  const app = await renderApp({ route: '/settings/connections' });
  await app.user.click(await screen.findByRole('button', { name: 'GitHub: Not connected. Manage connection' }));
  return { ...app, sent, form: await screen.findByRole('form', { name: 'GitHub connection' }) };
}

/** Opens the form with the token way picked, and types a token. */
async function openTokenWay(token = 'fake-token-for-tests') {
  const app = await openForm(makeGitHubConnection({ ghFound: false }));
  await app.user.type(within(app.form).getByLabelText('Personal access token'), token);
  return app;
}

describe('GitHub connection form', () => {
  it('AC-2: offers both ways with a title and a detail line, picks gh when it is there, and focuses it', async () => {
    const { form } = await openForm();

    const ways = within(form).getByRole('radiogroup', { name: 'Connect with' });
    const gh = within(ways).getByRole('radio', { name: 'Use my gh login' });
    expect(gh).toBeChecked();
    expect(gh).toHaveFocus();
    expect(gh).toHaveAccessibleDescription(
      'Orynx asks the gh command-line tool for your token each time and keeps no copy.',
    );
    expect(within(ways).getByRole('radio', { name: 'Use a personal access token' })).toHaveAccessibleDescription(
      'Orynx keeps the token in your keychain.',
    );
    expect(within(form).queryByLabelText('Personal access token')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'GitHub' })).toBeVisible();
  });

  it("AC-2: picks the token way when gh isn't there, and says so on the gh choice", async () => {
    const { form } = await openForm(makeGitHubConnection({ ghFound: false }));

    const token = within(form).getByRole('radio', { name: 'Use a personal access token' });
    expect(token).toBeChecked();
    expect(token).toHaveFocus();
    expect(within(form).getByRole('radio', { name: 'Use my gh login' })).toHaveAccessibleDescription(
      "gh isn't installed on this computer.",
    );
    const field = within(form).getByLabelText('Personal access token');
    expect(field).toHaveAttribute('type', 'password');
    // Browsers ignore "off" on a password and offer to save it as a sign-in; they never save a one-time code.
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field).toHaveAccessibleDescription(
      'Create a classic token with the repo scope. If your company uses single sign-on, authorize the token for it.',
    );
    expect(within(form).getByRole('link', { name: 'Create a token' })).toHaveAttribute('href', newTokenUrl);
  });

  it('AC-2: the token link opens outside DevHub', async () => {
    const { user, form, platform } = await openForm(makeGitHubConnection({ ghFound: false }));

    await user.click(within(form).getByRole('link', { name: 'Create a token' }));

    expect(platform.openExternal).toHaveBeenCalledWith(newTokenUrl);
  });

  it('AC-3: the gh way sends no token', async () => {
    const { user, form, sent } = await openForm();

    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));

    expect(await screen.findByText('GitHub is connected.')).toBeInTheDocument();
    expect(sent).toEqual([{ method: 'gh' }]);
  });

  it('AC-4: puts what stopped gh under the choices, and marks them', async () => {
    const message = "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again.";
    const { user, form } = await openForm();
    failingGitHubSave(422, { code: 'integration_rejected', message });

    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));

    const ways = within(form).getByRole('radiogroup', { name: 'Connect with' });
    await expect.poll(() => ways.getAttribute('aria-invalid')).toBe('true');
    expect(ways).toHaveAccessibleDescription(message);
    expect(within(ways).getByRole('radio', { name: 'Use my gh login' })).toHaveFocus();
    expect(within(form).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('AC-5, AC-18: the arrow keys pick the token way, which shows its field, and Enter sends the trimmed token', async () => {
    const { user, form, sent } = await openForm();

    await user.keyboard('{ArrowDown}');
    expect(within(form).getByRole('radio', { name: 'Use a personal access token' })).toBeChecked();
    await user.type(within(form).getByLabelText('Personal access token'), ' fake-token-for-tests {Enter}');

    expect(await screen.findByText('GitHub is connected.')).toBeInTheDocument();
    expect(sent).toEqual([{ method: 'token', token: 'fake-token-for-tests' }]);
  });

  it('AC-6, AC-7: puts a refused token under the token field and keeps what was typed', async () => {
    const message = "This token can't read private repositories. Create one with the repo scope.";
    const { user, form } = await openTokenWay('fake-wrong-token');
    failingGitHubSave(422, { code: 'integration_rejected', message });

    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));

    const token = within(form).getByLabelText('Personal access token');
    await expect.poll(() => token.getAttribute('aria-invalid')).toBe('true');
    expect(token).toHaveAccessibleDescription(message);
    expect(token).toHaveFocus();
    expect(token).toHaveValue('fake-wrong-token');
    expect(within(form).getByRole('link', { name: 'Create a token' })).toBeVisible();
  });

  it("AC-8: says github.com can't be reached in one line above the buttons", async () => {
    const message = "Can't reach github.com. Check your network or VPN, then try again.";
    const { user, form } = await openForm();
    failingGitHubSave(502, { code: 'integration_unreachable', message });

    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(message);
    expect(within(form).getByRole('radiogroup', { name: 'Connect with' })).not.toHaveAttribute('aria-invalid');
  });

  it('AC-9: asks for a token, focuses the field, and sends nothing', async () => {
    const { user, form, sent } = await openForm(makeGitHubConnection({ ghFound: false }));

    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));

    const token = within(form).getByLabelText('Personal access token');
    await expect.poll(() => token.getAttribute('aria-invalid')).toBe('true');
    expect(token).toHaveAccessibleDescription('Paste your GitHub token.');
    expect(token).toHaveFocus();
    expect(sent).toEqual([]);
  });

  it('AC-9: refuses a token with a space inside', async () => {
    const { user, form, sent } = await openTokenWay('fake token');

    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));

    await expect
      .poll(() => within(form).getByLabelText('Personal access token').getAttribute('aria-invalid'))
      .toBe('true');
    expect(within(form).getByLabelText('Personal access token')).toHaveAccessibleDescription(
      'Paste the token without spaces or line breaks.',
    );
    expect(sent).toEqual([]);
  });

  it('puts "Paste your GitHub token." under the field when the server has no token after all', async () => {
    const { user, form } = await openTokenWay();
    failingGitHubSave(400, { code: 'bad_request', message: 'Paste your GitHub token.' });

    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));

    const token = within(form).getByLabelText('Personal access token');
    await expect.poll(() => token.getAttribute('aria-invalid')).toBe('true');
    expect(token).toHaveAccessibleDescription('Paste your GitHub token.');
  });

  it("AC-10: says the keychain can't be reached in one line above the buttons", async () => {
    const message = "Orynx can't reach your OS keychain. Unlock it, or turn on the .env fallback (see .env.example).";
    const { user, form } = await openTokenWay();
    failingGitHubSave(503, { code: 'keychain_unavailable', message });

    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(message);
  });

  it('AC-15: while GitHub is checked, Connect GitHub waits and a second press sends nothing', async () => {
    let calls = 0;
    const { user, form } = await openForm();
    server.use(
      http.put(apiUrl(apiRoutes.githubConnection), async () => {
        calls += 1;
        await delay('infinite');
        return HttpResponse.json(makeGitHubConnection({ saved: { method: 'gh' } }));
      }),
    );

    const connect = within(form).getByRole('button', { name: 'Connect GitHub' });
    await user.click(connect);
    await expect.poll(() => connect.getAttribute('aria-disabled')).toBe('true');
    await user.click(connect);
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));

    expect(calls).toBe(1);
    expect(screen.getByRole('form', { name: 'GitHub connection' })).toBeInTheDocument();
  });

  it('AC-15: two presses before the page can show it waits still send one request', async () => {
    const { form, sent } = await openForm();

    const connect = within(form).getByRole('button', { name: 'Connect GitHub' });
    fireEvent.click(connect);
    fireEvent.click(connect);

    expect(await screen.findByText('GitHub is connected.')).toBeInTheDocument();
    expect(sent).toHaveLength(1);
  });

  it('AC-18: has no accessibility violations with the form open, and with errors showing', async () => {
    const { user, form, container } = await openForm(makeGitHubConnection({ ghFound: false }));
    await expectNoAxeViolations(container);

    await user.click(within(form).getByRole('button', { name: 'Connect GitHub' }));
    await expect
      .poll(() => within(form).getByLabelText('Personal access token').getAttribute('aria-invalid'))
      .toBe('true');

    await expectNoAxeViolations(container);
  });

  it('AC-18: says an error out loud when it lands where focus already is', async () => {
    const message = "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again.";
    const { user, form } = await openForm();
    failingGitHubSave(422, { code: 'integration_rejected', message });

    // Focus is on the gh choice, so Enter submits from where the error will land.
    await user.keyboard('{Enter}');

    await expect.poll(() => screen.getByRole('status').textContent).toBe(message);
    expect(within(form).getByRole('radio', { name: 'Use my gh login' })).toHaveFocus();
  });

  it('AC-18: says a refused token out loud when Enter was pressed in the token field', async () => {
    const message = "GitHub didn't accept this token. Check it, or create a new one.";
    const { user, form } = await openTokenWay('fake-wrong-token');
    failingGitHubSave(422, { code: 'integration_rejected', message });

    await user.type(within(form).getByLabelText('Personal access token'), '{Enter}');

    await expect.poll(() => screen.getByRole('status').textContent).toBe(message);
  });

  it('AC-16: keeps the way it opened with, and focus, when the saved settings change while it is open', async () => {
    let calls = 0;
    let saved: { method: 'gh' } | null = null;
    server.use(
      http.get(apiUrl(apiRoutes.githubConnection), () => {
        calls += 1;
        return HttpResponse.json(makeGitHubConnection({ saved, ghFound: saved !== null }));
      }),
    );
    const { user } = await renderApp({ route: '/settings/connections' });
    await user.click(await screen.findByRole('button', { name: 'GitHub: Not connected. Manage connection' }));
    const form = await screen.findByRole('form', { name: 'GitHub connection' });
    const token = within(form).getByLabelText('Personal access token');
    await user.type(token, 'fake-tok');
    const before = calls;

    saved = { method: 'gh' };
    FakeEventSource.latest().emit({ type: 'status.changed' });
    await expect.poll(() => calls).toBeGreaterThan(before);
    await user.keyboard('en');

    expect(token).toHaveFocus();
    expect(token).toHaveValue('fake-token');
    expect(within(form).getByRole('radio', { name: 'Use a personal access token' })).toBeChecked();
    expect(within(form).queryByRole('button', { name: 'Disconnect GitHub' })).not.toBeInTheDocument();
  });
});
