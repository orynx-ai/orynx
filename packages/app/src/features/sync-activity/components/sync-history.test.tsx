import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRoutes, type Inbox, type SyncRun, type SyncTool } from '@devhub/contracts';
import { makeInbox, makeSyncActivity, makeSyncChange, makeSyncRun, makeSyncTool } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** A local 10:44 on 20 Oct 2026, so clock times read the same on every computer. */
const now = new Date(2026, 9, 20, 10, 44);
const at = (hours: number, minutes: number, date = 20) => new Date(2026, 9, date, hours, minutes).toISOString();

const jira = makeSyncTool({ lastSyncAt: at(10, 41), lastGoodSyncAt: at(10, 41) });
const github = makeSyncTool({
  tool: 'github',
  state: { state: 'synced', at: at(10, 39) },
  lastSyncAt: at(10, 39),
  lastGoodSyncAt: at(10, 39),
});
const jiraFailing = makeSyncTool({
  state: { state: 'failed', problem: { kind: 'rejected' }, lastSyncedAt: at(9, 40) },
  lastSyncAt: at(9, 57),
  lastGoodSyncAt: at(9, 40),
  failingSince: at(9, 42),
  failedInARow: 3,
});

const found = makeSyncRun({
  id: '3',
  startedAt: at(10, 41),
  tookMs: 1240,
  changes: [
    makeSyncChange(),
    makeSyncChange({
      kind: 'updated',
      ref: 'PROJ-1423',
      title: 'Archive old posts',
      url: 'https://acme.atlassian.net/browse/PROJ-1423',
    }),
  ],
});
const quiet = makeSyncRun({ id: '2', tool: 'github', startedAt: at(10, 39), tookMs: 2900 });
const refused = makeSyncRun({ id: '1', startedAt: at(9, 57, 19), tookMs: 300, problem: { kind: 'rejected' } });

/** The server: the inbox's states, and a sync log that answers each query from `log.runs`. */
function serve(log: { tools: SyncTool[]; runs: SyncRun[] }) {
  const inboxTools = Object.fromEntries(log.tools.map((tool) => [tool.tool, tool.state])) as Inbox['tools'];
  const refreshes: string[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.inbox), () => HttpResponse.json(makeInbox({ tools: inboxTools }))),
    http.get(apiUrl(apiRoutes.syncActivity), ({ request }) => {
      const query = new URL(request.url).searchParams;
      const runs = log.runs.filter(
        (run) =>
          (query.get('tool') === null || run.tool === query.get('tool')) &&
          (query.get('show') !== 'failed' || run.problem !== null),
      );
      return HttpResponse.json(makeSyncActivity({ tools: log.tools, runs }));
    }),
    http.post(apiUrl(apiRoutes.inboxRefresh), async ({ request }) => {
      refreshes.push(new URL(request.url).search);
      await delay(20);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return refreshes;
}

async function open() {
  const app = await renderApp();
  await app.user.click(await screen.findByRole('button', { name: /Sync activity/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Sync activity' });
  return { ...app, dialog: within(dialog) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Sync activity history (spec 035)', () => {
  it('AC-12, AC-17: All activity lists every tool’s runs, newest first, each led by its tool', async () => {
    serve({ tools: [jira, github], runs: [found, quiet, refused] });
    const { dialog } = await open();

    const history = await dialog.findByRole('list', { name: 'Sync history' });
    const rows = within(history).getAllByRole('button');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAccessibleName('10:41 Jira 1 new · 1 updated 1.2s');
    expect(rows[0]).toHaveAccessibleDescription('succeeded');
    expect(rows[1]).toHaveAccessibleName('10:39 GitHub No changes 2.9s');
    expect(rows[2]).toHaveAccessibleName('19 Oct 09:57 Jira Failed · token refused 0.3s');
    expect(rows[2]).toHaveAccessibleDescription('failed');
  });

  it('AC-13, AC-24: a row opens to its changes, and Open takes each to its tool', async () => {
    serve({ tools: [jira, github], runs: [found] });
    const { dialog, user, platform } = await open();

    const row = await dialog.findByRole('button', { name: /^10:41 Jira/ });
    await user.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    const changes = document.getElementById(row.getAttribute('aria-controls') ?? '');
    expect(changes).toHaveTextContent('NewPROJ-1431Add bulk archive to the content list');
    expect(changes).toHaveTextContent('UpdatedPROJ-1423Archive old posts');
    await user.click(dialog.getByRole('link', { name: 'Open PROJ-1423' }));
    expect(platform.openExternal).toHaveBeenCalledWith('https://acme.atlassian.net/browse/PROJ-1423');
  });

  it('AC-14, AC-16: a quiet run says nothing changed, and a big one counts what it didn’t keep', async () => {
    serve({ tools: [jira, github], runs: [{ ...found, moreChanges: 40 }, quiet] });
    const { dialog, user } = await open();

    await user.click(await dialog.findByRole('button', { name: /^10:39 GitHub/ }));
    await user.click(dialog.getByRole('button', { name: /^10:41 Jira/ }));

    expect(dialog.getByText('Checked everything. Nothing changed.')).toBeVisible();
    expect(dialog.getByText('and 40 more')).toBeVisible();
  });

  it('AC-15: a failed run shows what went wrong, and copies it', async () => {
    serve({ tools: [jiraFailing, github], runs: [refused] });
    const { dialog, user } = await open();

    await user.click(await dialog.findByRole('button', { name: /Failed · token refused/ }));
    await user.click(dialog.getByRole('button', { name: 'Copy Jira refused Orynx’s saved token.' }));

    expect(await navigator.clipboard.readText()).toBe('Jira refused Orynx’s saved token.');
    expect(await dialog.findByRole('button', { name: 'Copied' })).toBeVisible();
  });

  it('AC-18: Failed shows the failed runs alone, says when there are none, and picking a tool goes back to All', async () => {
    serve({ tools: [jira, github], runs: [found, quiet, refused] });
    const { dialog, user } = await open();
    const show = await dialog.findByRole('group', { name: 'Show' });

    await user.click(within(show).getByRole('button', { name: 'Failed' }));
    await waitFor(() => {
      expect(within(dialog.getByRole('list', { name: 'Sync history' })).getAllByRole('button')).toHaveLength(1);
    });

    await user.click(dialog.getByRole('button', { name: 'GitHub, Syncing fine' }));
    expect(within(dialog.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(dialog.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Failed' }));
    expect(await dialog.findByText('No failed syncs here.')).toBeVisible();
  });

  it('AC-19: a tool with no runs says so', async () => {
    serve({ tools: [jira, github], runs: [] });
    const { dialog } = await open();

    expect(await dialog.findByText('No syncs yet.')).toBeVisible();
  });

  it('AC-20: Sync now syncs that tool alone, spins while it runs, and says how it went', async () => {
    const log = { tools: [jira, github], runs: [found] };
    const refreshes = serve(log);
    const { dialog, user } = await open();
    await user.click(await dialog.findByRole('button', { name: 'Jira, Syncing fine' }));
    const syncNow = await dialog.findByRole('button', { name: 'Sync now' });

    log.runs = [makeSyncRun({ id: '9', startedAt: at(10, 44) }), found];
    await user.click(syncNow);

    expect(await dialog.findByRole('button', { name: 'Syncing…' })).toHaveAttribute('aria-disabled', 'true');
    expect(await dialog.findByRole('button', { name: /^10:44 No changes/ })).toBeVisible();
    expect(dialog.getByRole('status')).toHaveTextContent('Jira synced');
    expect(refreshes).toEqual(['?tool=jira']);
  });

  it('AC-21: Retry syncs the failing tool, and says when it still fails', async () => {
    const refreshes = serve({ tools: [jiraFailing, github], runs: [refused] });
    const { dialog, user } = await open();

    await user.click(within(await dialog.findByRole('alert')).getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(dialog.getByRole('status')).toHaveTextContent('Jira still failing');
    });
    expect(refreshes).toEqual(['?tool=jira']);
    expect(dialog.queryByRole('button', { name: 'Sync now' })).toBeNull();
  });

  it('AC-22: Sync all now syncs every tool', async () => {
    const refreshes = serve({ tools: [jira, github], runs: [] });
    const { dialog, user } = await open();

    await user.click(await dialog.findByRole('button', { name: 'Sync all now' }));

    expect(await dialog.findByRole('button', { name: 'Syncing…' })).toBeVisible();
    await waitFor(() => {
      expect(dialog.getByRole('status')).toHaveTextContent('Jira synced. GitHub synced.');
    });
    expect(refreshes).toEqual(['']);
  });

  it('AC-25: a sync that ends while it’s open adds its run, and an open row stays open', async () => {
    const log = { tools: [jira, github], runs: [found] };
    serve(log);
    const { dialog, user } = await open();
    await user.click(await dialog.findByRole('button', { name: /^10:41 Jira/ }));

    log.runs = [makeSyncRun({ id: '9', tool: 'github', startedAt: at(10, 43) }), found];
    FakeEventSource.latest().emit({ type: 'inbox.changed' });

    expect(await dialog.findByRole('button', { name: /^10:43 GitHub/ })).toBeVisible();
    expect(dialog.getByRole('button', { name: /^10:41 Jira/ })).toHaveAttribute('aria-expanded', 'true');
  });
});
