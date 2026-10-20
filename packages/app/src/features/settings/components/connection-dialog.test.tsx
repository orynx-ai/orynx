import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type ConnectionCheck } from '@devhub/contracts';
import { makeSessionSummary, makeStatus } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { answerWith, mixedStatus } from '../../../test/connections.ts';
import { jiraServer } from '../../../test/jira.ts';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** Opens Jira's dialog on the design's page, with Test connection answered by `answer` once `release` is called. */
async function openConnectedJira(answer: () => ConnectionCheck) {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.post(apiUrl(apiRoutes.jiraConnectionCheck), async () => {
      await released;
      return HttpResponse.json(answer());
    }),
  );
  answerWith(mixedStatus);
  const app = await renderApp({ route: '/settings/connections' });
  await app.user.click(await screen.findByRole('button', { name: 'Jira: Connected. Manage connection' }));
  return { ...app, release, dialog: await screen.findByRole('dialog', { name: 'Jira' }) };
}

describe('ConnectionDialog (spec 030)', () => {
  it('AC-7: a connected tool opens a dialog with its state, what Orynx is using and when it last checked', async () => {
    answerWith(mixedStatus);
    const { user } = await renderApp({ route: '/settings/connections' });

    await user.click(await screen.findByRole('button', { name: 'Jira: Connected. Manage connection' }));

    const dialog = await screen.findByRole('dialog', { name: 'Jira' });
    expect(dialog).toHaveAccessibleDescription('Orynx is using your Jira login. Nothing here changes Jira itself.');
    expect(within(dialog).getByText('Connected')).toBeVisible();
    expect(
      within(dialog)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['Site', 'Account', 'Signed in with', 'Orynx reads', 'Last checked']);
    expect(
      within(dialog)
        .getAllByRole('definition')
        .map((value) => value.textContent),
    ).toEqual([
      'your-team.atlassian.net',
      'dev@example.com',
      'Personal API token',
      'Issues assigned to you, your sprint, comments',
      '2 min ago',
    ]);
    await expectNoAxeViolations(dialog);
  });

  it('AC-10: Close and Escape each shut the dialog and give focus back to the status button', async () => {
    answerWith(mixedStatus);
    const { user } = await renderApp({ route: '/settings/connections' });
    const button = await screen.findByRole('button', { name: 'Jira: Connected. Manage connection' });

    for (const shut of ['Close', '{Escape}']) {
      await user.click(button);
      const dialog = await screen.findByRole('dialog', { name: 'Jira' });
      if (shut === '{Escape}') await user.keyboard(shut);
      else await user.click(within(dialog).getByRole('button', { name: shut }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(button, shut).toHaveFocus();
    }
  });

  it('AC-26: news from another tab updates the row and the open dialog without a reload', async () => {
    let status = mixedStatus();
    answerWith(() => status);
    const { user } = await renderApp({ route: '/settings/connections' });
    await user.click(await screen.findByRole('button', { name: 'Jira: Connected. Manage connection' }));
    const dialog = await screen.findByRole('dialog', { name: 'Jira' });

    status = makeStatus({
      integrations: { ...status.integrations, jira: { state: 'error', detail: 'The saved API token is missing.' } },
    });
    FakeEventSource.latest().emit({ type: 'status.changed' });

    expect(await within(dialog).findByText('Needs reconnecting')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(
      await screen.findByRole('button', { name: 'Jira: Needs reconnecting. Manage connection' }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Connections' })).getAllByRole('listitem')[0]).toHaveTextContent(
      'The saved API token is missing.',
    );
  });

  it('AC-8: Test connection waits for Jira, then says how long it took, and Last checked reads Just now', async () => {
    const connected = mixedStatus().integrations.jira;
    const { user, dialog, release } = await openConnectedJira(() => ({
      status: { ...connected, checkedAt: new Date().toISOString() },
      ms: 180,
    }));
    const has = (name: string) => within(dialog).queryByRole('button', { name }) !== null;
    expect(['Cancel', 'Test connection', 'Done'].map(has)).toEqual([false, true, false]);
    const test = within(dialog).getByRole('button', { name: 'Test connection' });
    await user.click(test);
    expect(test).toHaveAttribute('aria-disabled', 'true');
    release();

    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent('Working. Jira answered in 180 ms.');
    });
    expect(within(dialog).getByRole('status')).toBeVisible();
    expect(within(dialog).getAllByRole('definition').at(-1)).toHaveTextContent('Just now');
    expect(['Test connection', 'Test again'].map(has)).toEqual([false, true]);
    await expectNoAxeViolations(dialog);
  });

  it('AC-9: a failed test turns the pill and the row to Needs reconnecting, with the reason in a red box', async () => {
    const reason = "Jira didn't accept this email and API token. Check both, or create a new token.";
    const { user, dialog, release } = await openConnectedJira(() => ({
      status: { state: 'error', detail: reason, account: 'dev@example.com', checkedAt: new Date().toISOString() },
      ms: 240,
    }));

    await user.click(within(dialog).getByRole('button', { name: 'Test connection' }));
    release();

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(reason);
    expect(within(dialog).getByText('Needs reconnecting')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(
      await screen.findByRole('button', { name: 'Jira: Needs reconnecting. Manage connection' }),
    ).toBeInTheDocument();
  });

  it("AC-8: says so when the Orynx server can't be reached, and Test connection is ready again", async () => {
    server.use(http.post(apiUrl(apiRoutes.jiraConnectionCheck), () => HttpResponse.error()));
    answerWith(mixedStatus);
    const { user } = await renderApp({ route: '/settings/connections' });
    await user.click(await screen.findByRole('button', { name: 'Jira: Connected. Manage connection' }));
    const dialog = await screen.findByRole('dialog', { name: 'Jira' });

    await user.click(within(dialog).getByRole('button', { name: 'Test connection' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not reach the Orynx server');
    expect(within(dialog).getByRole('button', { name: 'Test connection' })).not.toHaveAttribute('aria-disabled');
  });

  describe('Disconnect', () => {
    async function openJira() {
      const sent = jiraServer({ connected: true });
      const app = await renderApp({ route: '/settings/connections' });
      const button = await screen.findByRole('button', { name: 'Jira: Connected. Manage connection' });
      await app.user.click(button);
      const dialog = await screen.findByRole('dialog', { name: 'Jira' });
      await app.user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
      return { ...app, sent, button, dialog };
    }

    it('AC-11: asks first, saying what goes and what stays, with focus on Keep connected', async () => {
      const { dialog, sent } = await openJira();

      const alert = within(dialog).getByRole('alert');
      expect(alert).toHaveTextContent('Disconnect Jira?');
      expect(alert).toHaveTextContent(
        'Jira tickets leave your inbox and the Tickets board, and sessions lose ticket context. Your token is removed from the keychain. Jira itself is not changed.',
      );
      expect(within(dialog).getByRole('button', { name: 'Keep connected' })).toHaveFocus();
      expect(within(dialog).queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument();
      expect(sent).toEqual([]);
      await expectNoAxeViolations(dialog);
    });

    it('AC-12: says running sessions on a ticket keep what they have', async () => {
      const running = (id: string, key: string) =>
        makeSessionSummary({ id, state: 'working', source: { kind: 'jira', key } });
      server.use(
        http.get(apiUrl(apiRoutes.sessions), () =>
          HttpResponse.json({
            sessions: [
              running('s1', 'PROJ-1'),
              makeSessionSummary({ id: 's2', state: 'needs_you', source: { kind: 'jira', key: 'PROJ-2' } }),
              makeSessionSummary({ id: 's3', state: 'done', source: { kind: 'jira', key: 'PROJ-3' } }),
              makeSessionSummary({ id: 's4', state: 'working', source: null }),
            ],
            nextCursor: null,
          }),
        ),
      );
      const { dialog } = await openJira();

      expect(
        await within(dialog).findByText('2 running sessions keep the ticket text they already have.'),
      ).toBeVisible();
    });

    it('AC-13: Keep connected goes back to the details, with nothing sent', async () => {
      const { user, dialog, sent } = await openJira();

      await user.click(within(dialog).getByRole('button', { name: 'Keep connected' }));

      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Test connection' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Disconnect' })).toHaveFocus();
      expect(sent).toEqual([]);
    });

    it('AC-14: Disconnect shuts the dialog, the row turns Not connected and the page says so', async () => {
      const { user, dialog, sent } = await openJira();

      await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(sent).toEqual(['DELETE']);
      const button = await screen.findByRole('button', { name: 'Jira: Not connected. Manage connection' });
      expect(button).toHaveFocus();
      expect(await screen.findByText('Jira disconnected.')).toBeVisible();
    });
  });

  describe('Needs reconnecting through gh', () => {
    const signedOut = "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again.";

    /** The design's page with GitHub's gh login expired; Reconnect is answered by `answer` once released. */
    async function openGitHub(answer: () => ConnectionCheck) {
      let release: () => void = () => undefined;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let status = mixedStatus();
      server.use(
        http.post(apiUrl(apiRoutes.githubConnectionCheck), async () => {
          await released;
          const check = answer();
          status = makeStatus({ integrations: { ...status.integrations, github: check.status } });
          return HttpResponse.json(check);
        }),
      );
      answerWith(() => status);
      const app = await renderApp({ route: '/settings/connections' });
      await app.user.click(
        await screen.findByRole('button', { name: 'GitHub: Needs reconnecting. Manage connection' }),
      );
      return { ...app, release, dialog: await screen.findByRole('dialog', { name: 'GitHub' }) };
    }
    const reconnected = (): ConnectionCheck => ({
      status: {
        state: 'connected',
        detail: 'Signed in as octocat with the gh command-line tool',
        account: 'octocat',
        checkedAt: new Date().toISOString(),
      },
      ms: 300,
    });

    it('AC-15: says why, shows the command to run, and offers Reconnect', async () => {
      const { dialog } = await openGitHub(reconnected);

      expect(dialog).toHaveAccessibleDescription(
        'Orynx can no longer reach GitHub, so your pull requests have stopped updating. Reconnect to pick up where you left off.',
      );
      expect(within(dialog).getByText('Needs reconnecting')).toBeVisible();
      expect(within(dialog).getByText(signedOut)).toBeVisible();
      expect(within(dialog).getByText('Run this in a terminal, then press Reconnect:')).toBeVisible();
      expect(within(dialog).getByText('gh auth login')).toBeVisible();
      for (const name of ['Disconnect', 'Reconnect']) {
        expect(within(dialog).getByRole('button', { name })).toBeInTheDocument();
      }
      expect(within(dialog).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
      await expectNoAxeViolations(dialog);
    });

    it('AC-16: Copy puts the command on the clipboard and says Copied', async () => {
      const { user, dialog } = await openGitHub(reconnected);

      await user.click(within(dialog).getByRole('button', { name: 'Copy gh auth login' }));

      expect(await navigator.clipboard.readText()).toBe('gh auth login');
      expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    });

    it('AC-17: Reconnect checks gh, then shuts the dialog, turns the row Connected and says so', async () => {
      const { user, dialog, release } = await openGitHub(reconnected);

      const reconnect = within(dialog).getByRole('button', { name: 'Reconnect' });
      await user.click(reconnect);
      expect(reconnect).toHaveAttribute('aria-disabled', 'true');
      expect(within(dialog).getByRole('status')).toHaveTextContent('Checking your gh login…');
      release();

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(await screen.findByRole('button', { name: 'GitHub: Connected. Manage connection' })).toHaveFocus();
      expect(await screen.findByText('GitHub reconnected. Your inbox is refreshing.')).toBeVisible();
    });

    it('AC-18: with gh still signed out, the dialog stays with the new reason, ready to try again', async () => {
      const still = 'gh is still signed out. Run gh auth login, then press Reconnect.';
      const { user, dialog, release } = await openGitHub(() => ({
        status: { state: 'error', detail: still, checkedAt: new Date().toISOString() },
        ms: 120,
      }));

      await user.click(within(dialog).getByRole('button', { name: 'Reconnect' }));
      release();

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(still);
      expect(within(dialog).getByRole('button', { name: 'Reconnect' })).not.toHaveAttribute('aria-disabled');
    });

    it('AC-17: Close shuts the dialog while gh is checked, and the answer still lands on the page', async () => {
      const { user, dialog, release } = await openGitHub(reconnected);

      await user.click(within(dialog).getByRole('button', { name: 'Reconnect' }));
      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      release();

      expect(await screen.findByText('GitHub reconnected. Your inbox is refreshing.')).toBeVisible();
      expect(await screen.findByRole('button', { name: 'GitHub: Connected. Manage connection' })).toBeInTheDocument();
    });
  });

  describe('Not connected', () => {
    it('AC-20: the form sits in the dialog with Connect at its foot, and connecting says so on the page', async () => {
      const sent = jiraServer();
      const { user } = await renderApp({ route: '/settings/connections' });
      await user.click(await screen.findByRole('button', { name: 'Jira: Not connected. Manage connection' }));
      const dialog = await screen.findByRole('dialog', { name: 'Jira' });

      expect(dialog).toHaveAccessibleDescription('Connect Jira to see your tickets in Orynx.');
      expect(within(dialog).getByText('Not connected')).toBeVisible();
      expect(within(dialog).queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
      const form = within(dialog).getByRole('form', { name: 'Jira connection' });
      await user.type(within(form).getByLabelText('Jira site'), 'your-team');
      await user.type(within(form).getByLabelText('Email'), 'dev@example.com');
      await user.type(within(form).getByLabelText('API token'), 'fake-token-for-tests');
      await user.click(within(dialog).getByRole('button', { name: 'Connect' }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(sent).toEqual([
        { site: 'your-team.atlassian.net', email: 'dev@example.com', apiToken: 'fake-token-for-tests' },
      ]);
      expect(await screen.findByText('Jira connected. Your inbox is refreshing.')).toBeVisible();
      expect(await screen.findByRole('button', { name: 'Jira: Connected. Manage connection' })).toHaveFocus();
    });

    it('AC-22: Slack asks its admin first, with the request ready to copy', async () => {
      const { user } = await renderApp({ route: '/settings/connections' });
      await user.click(await screen.findByRole('button', { name: 'Slack: Not connected. Manage connection' }));
      const dialog = await screen.findByRole('dialog', { name: 'Slack' });

      expect(dialog).toHaveAccessibleDescription('Two steps. Until then, Slack items are left out of your inbox.');
      expect(within(dialog).getByText('Ask your Slack admin to approve the Orynx app')).toBeVisible();
      expect(
        within(dialog).getByText('It needs search:read, channels:history and im:history, only for your account.'),
      ).toBeVisible();
      await user.click(within(dialog).getByRole('button', { name: 'Copy request for your admin' }));

      expect(await navigator.clipboard.readText()).toBe(
        'Could you approve the Orynx app in our Slack workspace? It needs search:read, channels:history and im:history, only for my account, so Orynx can show my mentions and DMs. It runs on my computer.',
      );
      expect(await within(dialog).findByRole('button', { name: 'Request copied' })).toBeInTheDocument();
      await expectNoAxeViolations(dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
