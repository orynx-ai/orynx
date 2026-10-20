import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type Inbox, type SyncActivity } from '@devhub/contracts';
import { makeInbox, makeSyncActivity, makeSyncTool } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** A local 10:44 on 20 Oct 2026, so clock times read the same on every computer. */
const now = new Date(2026, 9, 20, 10, 44);
const at = (hours: number, minutes: number) => new Date(2026, 9, 20, hours, minutes).toISOString();

const jiraFailing = makeSyncTool({
  state: { state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: at(9, 40) },
  lastSyncAt: at(9, 57),
  lastGoodSyncAt: at(9, 40),
  failingSince: at(9, 42),
  failedInARow: 3,
  changesToday: 4,
});
const jiraFine = makeSyncTool({ lastSyncAt: at(10, 41), lastGoodSyncAt: at(10, 41) });
const githubFine = makeSyncTool({
  tool: 'github',
  state: { state: 'synced', at: at(10, 39) },
  lastSyncAt: at(10, 39),
  lastGoodSyncAt: at(10, 39),
});
const githubOff = makeSyncTool({
  tool: 'github',
  state: { state: 'not_connected' },
  lastSyncAt: null,
  lastGoodSyncAt: null,
  changesToday: 0,
  lastTwoHours: { worked: 0, total: 0 },
});

/** The server: the inbox's tool states as `tools` say, and the sync log for every query. */
function serve(tools: SyncActivity['tools']) {
  const inboxTools = Object.fromEntries(tools.map((tool) => [tool.tool, tool.state])) as Inbox['tools'];
  server.use(
    http.get(apiUrl(apiRoutes.inbox), () => HttpResponse.json(makeInbox({ tools: inboxTools }))),
    http.get(apiUrl(apiRoutes.syncActivity), () => HttpResponse.json(makeSyncActivity({ tools }))),
  );
}

async function open() {
  const app = await renderApp();
  await app.user.click(await screen.findByRole('button', { name: /^Sync activity/ }));
  return { ...app, dialog: await screen.findByRole('dialog', { name: 'Sync activity' }) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Sync activity dialog (spec 035)', () => {
  it('AC-5, AC-8: lists the tools that need attention first, and opens on the failing one', async () => {
    serve([jiraFailing, githubFine]);
    const { dialog } = await open();

    expect(dialog).toHaveAccessibleDescription('2 connected · 1 needs attention');
    expect(within(dialog).getByRole('button', { name: 'Sync all now' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Close sync activity' })).toBeVisible();
    const attention = await within(dialog).findByRole('list', { name: 'Needs attention' });
    const jira = within(attention).getByRole('button', { name: 'Jira, Failing' });
    expect(jira).toHaveAttribute('aria-current', 'true');
    expect(jira).toHaveAccessibleDescription('Failing since 09:42');
    const fine = within(dialog).getByRole('list', { name: 'Syncing fine' });
    expect(within(fine).getByRole('button', { name: 'GitHub, Syncing fine' })).toHaveAccessibleDescription(
      'Synced 10:39',
    );
    expect(within(dialog).getByRole('button', { name: 'All activity' })).not.toHaveAttribute('aria-current');
  });

  it('AC-6, AC-17: with every tool fine it opens on All activity', async () => {
    serve([jiraFine, githubFine]);
    const { dialog } = await open();

    expect(dialog).toHaveAccessibleDescription('2 connected · all syncing fine');
    expect(await within(dialog).findByRole('heading', { name: 'All activity' })).toBeVisible();
    expect(within(dialog).getByText('Every sync from your 2 connected tools, newest first')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'All activity' })).toHaveAttribute('aria-current', 'true');
    expect(within(dialog).queryByText('Last good sync')).toBeNull();
  });

  it('AC-9: a tool that syncs fine shows its status line and its four stats', async () => {
    serve([jiraFine, githubFine]);
    const { dialog, user } = await open();

    await user.click(await within(dialog).findByRole('button', { name: 'Jira, Syncing fine' }));

    expect(await within(dialog).findByRole('heading', { name: 'Jira' })).toBeVisible();
    expect(within(dialog).getByText('Syncing fine · last sync 10:41')).toBeVisible();
    const terms = within(dialog)
      .getAllByRole('term')
      .map((term) => term.textContent);
    const details = within(dialog)
      .getAllByRole('definition')
      .map((detail) => detail.textContent);
    expect(terms).toEqual(['Last good sync', 'Next sync', 'Changes today', 'Success, last 2 h']);
    expect(details).toEqual(['10:41', '10:43', '14', '60 of 60']);
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('AC-10: a refused token gets a red alert that says how to fix it', async () => {
    serve([jiraFailing, githubFine]);
    const { dialog } = await open();

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Jira refused Orynx’s saved token.');
    expect(alert).toHaveTextContent('Reconnect to fix it. Syncing again won’t help.');
    expect(alert).toHaveTextContent('Failing since 09:42 · 3 failed syncs');
    expect(within(dialog).getByText('Failing · last good sync 09:40')).toBeVisible();
  });

  it('AC-11: a rate limit gets an amber notice that asks nothing of you', async () => {
    serve([
      jiraFine,
      {
        ...githubFine,
        state: { state: 'failed', problem: { kind: 'rate_limited', until: at(10, 50) }, lastSyncedAt: at(10, 30) },
        failingSince: at(10, 34),
        failedInARow: 1,
      },
    ]);
    const { dialog } = await open();

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('GitHub’s rate limit is used up until 10:50.');
    expect(alert).toHaveTextContent('Orynx syncs again after that. Nothing for you to do.');
  });

  it('AC-7: a tool that isn’t connected says nothing is synced, with no stats', async () => {
    serve([jiraFine, githubOff]);
    const { dialog, user } = await open();

    expect(dialog).toHaveAccessibleDescription('1 connected · all syncing fine · 1 not connected');
    const off = await within(dialog).findByRole('list', { name: 'Not connected' });
    await user.click(within(off).getByRole('button', { name: 'GitHub, Not connected' }));

    expect(await within(dialog).findByText('Not connected. Nothing is synced.')).toBeVisible();
    expect(within(dialog).queryByRole('term')).toBeNull();
  });

  it('AC-28: shows the dialog at once, and the tools when the log comes', async () => {
    serve([jiraFine, githubFine]);
    server.use(
      http.get(apiUrl(apiRoutes.syncActivity), async () => {
        await delay(50);
        return HttpResponse.json(makeSyncActivity({ tools: [jiraFine, githubFine] }));
      }),
    );
    const { dialog } = await open();

    expect(within(dialog).queryByRole('list', { name: 'Syncing fine' })).toBeNull();
    expect(await within(dialog).findByRole('list', { name: 'Syncing fine' })).toBeVisible();
  });

  it('AC-29: says the log didn’t load, and Try again reads it again', async () => {
    serve([jiraFine, githubFine]);
    let fail = true;
    server.use(
      http.get(apiUrl(apiRoutes.syncActivity), () =>
        fail
          ? HttpResponse.json({ code: 'internal', message: 'Something went wrong.' }, { status: 500 })
          : HttpResponse.json(makeSyncActivity({ tools: [jiraFine, githubFine] })),
      ),
    );
    const { dialog, user } = await open();

    expect(await within(dialog).findByText('Sync activity didn’t load.')).toBeVisible();
    fail = false;
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));

    expect(await within(dialog).findByRole('list', { name: 'Syncing fine' })).toBeVisible();
  });

  it('AC-23: Reconnect closes the modal and opens Jira’s connection dialog in Settings', async () => {
    serve([jiraFailing, githubFine]);
    const { dialog, user, history } = await open();

    await user.click(within(await within(dialog).findByRole('alert')).getByRole('link', { name: 'Reconnect' }));

    expect(await screen.findByRole('dialog', { name: 'Jira' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Sync activity' })).toBeNull();
    expect(history.location.pathname).toBe('/settings/connections');
  });

  it('AC-7: Connect GitHub opens GitHub’s connection dialog in Settings', async () => {
    serve([jiraFine, githubOff]);
    const { dialog, user } = await open();
    await user.click(await within(dialog).findByRole('button', { name: 'GitHub, Not connected' }));

    await user.click(await within(dialog).findByRole('link', { name: 'Connect GitHub' }));

    expect(await screen.findByRole('dialog', { name: 'GitHub' })).toBeVisible();
  });

  it('AC-11: a failure Orynx gets past on its own has no Reconnect', async () => {
    serve([
      { ...jiraFailing, state: { state: 'failed', problem: { kind: 'no_answer' }, lastSyncedAt: at(9, 40) } },
      githubFine,
    ]);
    const { dialog } = await open();

    expect(within(await within(dialog).findByRole('alert')).queryByRole('link', { name: 'Reconnect' })).toBeNull();
  });
});
