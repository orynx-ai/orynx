import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Updates } from '@devhub/contracts';
import { makeRelease, makeUpdates } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const fiveMinutesAgo = () => new Date(Date.now() - 5 * 60_000).toISOString();
const out = makeRelease({ version: '0.1.40', newer: true });
const mine = makeRelease({ version: '0.1.37', newer: false, mine: true });

function answering(updates: Partial<Updates>) {
  const answer = makeUpdates({ checkedAt: fiveMinutesAgo(), ...updates });
  server.use(http.get(apiUrl(apiRoutes.updates), () => HttpResponse.json(answer)));
  return answer;
}

/** What Update and Restart to update sent, and the answer the hub gives. */
function installing(answer: Partial<Updates>) {
  const sent: unknown[] = [];
  server.use(
    http.post(apiUrl(apiRoutes.updatesInstall), async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json(makeUpdates({ checkedAt: fiveMinutesAgo(), ...answer }));
    }),
  );
  return sent;
}

async function updatesRow(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({ route: '/settings/about', ...options });
  return { ...app, row: within(await screen.findByRole('group', { name: 'Updates' })) };
}

describe('Settings › About: Updates (spec 045)', () => {
  it('AC-6: says Orynx is up to date and when it last checked, with Check for updates', async () => {
    answering({ releases: [mine] });
    const { row } = await updatesRow();
    expect(await row.findByText('Orynx is up to date.')).toBeVisible();
    expect(row.getByText('Checked 5 minutes ago')).toBeVisible();
    expect(row.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
  });

  it('AC-8: Check for updates waits with a spinner, keeps focus, and its answer replaces the line', async () => {
    answering({ releases: [mine] });
    let answer: () => void = () => undefined;
    server.use(
      http.post(apiUrl(apiRoutes.updatesCheck), async () => {
        await new Promise<void>((resolve) => {
          answer = resolve;
        });
        return HttpResponse.json(makeUpdates({ checkedAt: new Date().toISOString(), releases: [out, mine] }));
      }),
    );
    const { row, user } = await updatesRow();
    const button = await row.findByRole('button', { name: 'Check for updates' });
    await user.click(button);
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });
    expect(button).toHaveFocus();
    answer();
    expect(await row.findByText('Orynx 0.1.40 is out.')).toBeVisible();
    expect(row.getByRole('button', { name: 'Check for updates' })).toHaveFocus();
    expect(row.getByText('Checked just now')).toBeVisible();
  });

  it('AC-10: a check that failed says so, and Try again checks', async () => {
    answering({ checkFailed: true, releases: [mine] });
    let checks = 0;
    server.use(
      http.post(apiUrl(apiRoutes.updatesCheck), () => {
        checks += 1;
        return HttpResponse.json(makeUpdates({ releases: [mine] }));
      }),
    );
    const { row, user } = await updatesRow();
    expect(await row.findByText('Couldn’t check for updates.')).toBeVisible();
    await user.click(row.getByRole('button', { name: 'Try again' }));
    expect(await row.findByText('Orynx is up to date.')).toBeVisible();
    expect(checks).toBe(1);
  });

  it('AC-11: with no releases, says so', async () => {
    answering({ releases: [] });
    const { row } = await updatesRow();
    expect(await row.findByText('No releases yet.')).toBeVisible();
  });

  it('AC-7, AC-25: a newer release offers Update, which an installed clone runs and says it is updating', async () => {
    answering({ kind: 'service', folder: '~/orynx', releases: [out, mine] });
    const sent = installing({
      kind: 'service',
      folder: '~/orynx',
      releases: [out, mine],
      update: { state: 'updating' },
    });
    const { row, user } = await updatesRow();
    expect(await row.findByText('Orynx 0.1.40 is out.')).toBeVisible();
    await user.click(row.getByRole('button', { name: 'Update' }));
    expect(await row.findByText('Updating Orynx. This page reloads when it’s back.')).toBeVisible();
    expect(sent).toEqual([{ step: 'update' }]);
    expect(row.queryByRole('button')).toBeNull();
  });

  it('AC-25: the page that pressed Update reloads itself once the hub is back with a new token', async () => {
    answering({ kind: 'service', folder: '~/orynx', releases: [out, mine] });
    installing({ kind: 'service', folder: '~/orynx', releases: [out, mine], update: { state: 'updating' } });
    const { row, user, platform } = await updatesRow();
    await user.click(await row.findByRole('button', { name: 'Update' }));
    await row.findByText('Updating Orynx. This page reloads when it’s back.');
    // The new hub doesn't know this page's token.
    server.use(
      http.get(apiUrl(apiRoutes.updates), () =>
        HttpResponse.json({ code: 'unauthorized', message: 'No' }, { status: 401 }),
      ),
    );
    await waitFor(
      () => {
        expect(platform.reload).toHaveBeenCalled();
      },
      { timeout: 5000 },
    );
  });

  it('AC-21: a Mac that can’t replace Orynx.app offers Download, which opens the release page', async () => {
    answering({ action: 'download', releases: [out, mine] });
    const sent = installing({});
    const { row, user, platform } = await updatesRow();
    await user.click(await row.findByRole('button', { name: 'Download' }));
    expect(platform.openExternal).toHaveBeenCalledWith(out.url);
    expect(sent).toEqual([]);
  });

  it('AC-18: says the desktop app is downloading, with no button', async () => {
    answering({ action: 'none', releases: [out, mine], update: { state: 'downloading', version: '0.1.40' } });
    const { row } = await updatesRow();
    expect(await row.findByText('Downloading Orynx 0.1.40…')).toBeVisible();
    expect(row.queryByRole('button')).toBeNull();
  });

  it('AC-19: once downloaded, Restart to update asks the hub to restart', async () => {
    answering({ action: 'none', releases: [out, mine], update: { state: 'ready', version: '0.1.40' } });
    const sent = installing({ update: { state: 'ready', version: '0.1.40' } });
    const { row, user } = await updatesRow();
    expect(await row.findByText('Orynx 0.1.40 is out.')).toBeVisible();
    await user.click(row.getByRole('button', { name: 'Restart to update' }));
    await waitFor(() => {
      expect(sent).toEqual([{ step: 'restart' }]);
    });
  });

  it('AC-29: while a session works or waits, Update waits, and says why', async () => {
    answering({ busy: true, kind: 'service', folder: '~/orynx', releases: [out, mine] });
    const { row } = await updatesRow();
    const update = await row.findByRole('button', { name: 'Update' });
    expect(update).toBeDisabled();
    expect(update).toHaveAccessibleDescription('Stop the running sessions first');
  });

  it('AC-22: while a session works or waits, Restart to update waits, and says why', async () => {
    answering({ busy: true, releases: [out, mine], update: { state: 'ready', version: '0.1.40' } });
    const { row } = await updatesRow();
    const restart = await row.findByRole('button', { name: 'Restart to update' });
    expect(restart).toBeDisabled();
    expect(restart).toHaveAccessibleDescription('Stop the running sessions first');
  });

  it('AC-23, AC-28: a failed update names its log, and Try again updates again', async () => {
    answering({
      kind: 'service',
      folder: '~/orynx',
      releases: [out, mine],
      update: { state: 'failed', log: '~/.devhub/update.log' },
    });
    const sent = installing({
      kind: 'service',
      folder: '~/orynx',
      releases: [out, mine],
      update: { state: 'updating' },
    });
    const { row, user } = await updatesRow();
    expect(await row.findByText('Couldn’t update Orynx. See ~/.devhub/update.log.')).toBeVisible();
    await user.click(row.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(sent).toEqual([{ step: 'update' }]);
    });
  });

  it('AC-27: says the clone has changes of its own', async () => {
    answering({
      kind: 'service',
      folder: '~/orynx',
      releases: [out, mine],
      update: { state: 'refused', reason: 'changes' },
    });
    const { row } = await updatesRow();
    expect(await row.findByText('This clone has changes of its own. Commit or stash them, then update.')).toBeVisible();
  });

  it('AC-27: says the clone’s branch moved apart from GitHub’s', async () => {
    answering({
      kind: 'service',
      folder: '~/orynx',
      releases: [out, mine],
      update: { state: 'refused', reason: 'diverged' },
    });
    const { row } = await updatesRow();
    expect(await row.findByText('This clone’s branch has moved apart from GitHub’s. Update it by hand.')).toBeVisible();
  });

  it('AC-30: a clone started by hand shows the commands to run in its folder, with a copy button and no Update', async () => {
    answering({ kind: 'by_hand', folder: '~/orynx', action: 'commands', releases: [out, mine] });
    const { row } = await updatesRow();
    expect(await row.findByText('Orynx 0.1.40 is out.')).toBeVisible();
    expect(row.queryByRole('button', { name: 'Update' })).toBeNull();
    const commands = await screen.findByText(/^To update, run this in/);
    expect(commands).toHaveTextContent('To update, run this in ~/orynx, then start Orynx again:');
    const block = screen.getByRole('group', { name: 'git pull --ff-only && pnpm install' });
    expect(within(block).getByRole('button', { name: /Copy/ })).toBeVisible();
  });

  it('AC-5: has no axe violations with a release out', async () => {
    answering({ kind: 'by_hand', folder: '~/orynx', action: 'commands', releases: [out, mine] });
    const { container } = await renderApp({ route: '/settings/about' });
    await screen.findByText('Orynx 0.1.40 is out.');
    await expectNoAxeViolations(container);
  });
});
