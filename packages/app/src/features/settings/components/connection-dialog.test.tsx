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

  it('AC-10: Done, Cancel, Close and Escape each shut the dialog and give focus back to the status button', async () => {
    answerWith(mixedStatus);
    const { user } = await renderApp({ route: '/settings/connections' });
    const button = await screen.findByRole('button', { name: 'Jira: Connected. Manage connection' });

    for (const shut of ['Done', 'Cancel', 'Close', '{Escape}']) {
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
    expect(['Cancel', 'Test connection', 'Done'].map(has)).toEqual([true, true, true]);
    const test = within(dialog).getByRole('button', { name: 'Test connection' });
    await user.click(test);
    expect(test).toHaveAttribute('aria-disabled', 'true');
    release();

    await waitFor(() => {
      expect(within(dialog).getByRole('status')).toHaveTextContent('Working. Jira answered in 180 ms.');
    });
    expect(within(dialog).getByRole('status')).toBeVisible();
    expect(within(dialog).getAllByRole('definition').at(-1)).toHaveTextContent('Just now');
    expect(['Cancel', 'Test connection', 'Test again', 'Done'].map(has)).toEqual([false, false, true, true]);
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
});
