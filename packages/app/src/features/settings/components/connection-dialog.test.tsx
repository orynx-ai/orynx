import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeStatus } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { answerWith, mixedStatus } from '../../../test/connections.ts';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { renderApp } from '../../../test/render.tsx';

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
});
