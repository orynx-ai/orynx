import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Updates } from '@devhub/contracts';
import { makeUpdates } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

function answering(updates: Partial<Updates>) {
  server.use(http.get(apiUrl(apiRoutes.updates), () => HttpResponse.json(makeUpdates(updates))));
}

async function versionRow() {
  await renderApp({ route: '/settings/about' });
  return within(await screen.findByRole('group', { name: 'Version' }));
}

describe('Settings › About: Version (spec 045)', () => {
  it('AC-1: the desktop app shows its version and says it is the desktop app', async () => {
    const row = await versionRow();
    expect(await row.findByText('0.1.37')).toBeVisible();
    expect(row.getByText('Desktop app')).toBeVisible();
  });

  it('AC-2: an installed clone shows the release, the commits past it and its commit, and names its folder', async () => {
    answering({
      kind: 'service',
      folder: '~/Code/orynx',
      running: { release: '0.1.37', commits: 4, commit: 'abc1234' },
    });
    const row = await versionRow();
    expect(await row.findByText('0.1.37 + 4 commits (abc1234)')).toBeVisible();
    expect(row.getByText(/^Installed from/)).toHaveTextContent('Installed from ~/Code/orynx');
  });

  it('AC-2: one commit past a release, on the release itself, and with no release at all', async () => {
    answering({ kind: 'by_hand', folder: '~/orynx', running: { release: '0.1.37', commits: 1, commit: 'abc1234' } });
    const row = await versionRow();
    expect(await row.findByText('0.1.37 + 1 commit (abc1234)')).toBeVisible();
    expect(row.getByText(/^Started by hand from/)).toHaveTextContent('Started by hand from ~/orynx');
  });

  it('AC-2: a clone on its release tag shows the release alone, and one with no tag its commit alone', async () => {
    answering({ kind: 'service', folder: '~/orynx', running: { release: '0.1.37', commits: 0, commit: 'abc1234' } });
    expect(await (await versionRow()).findByText('0.1.37')).toBeVisible();
  });

  it('AC-2: a clone with no release tag shows its commit alone', async () => {
    answering({ kind: 'service', folder: '~/orynx', running: { release: null, commits: 0, commit: 'abc1234' } });
    expect(await (await versionRow()).findByText('abc1234')).toBeVisible();
  });

  it('AC-4: before the first answer, the parts hold their places, busy, with no spinner', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.updates), async () => {
        await delay('infinite');
        return HttpResponse.json(makeUpdates());
      }),
    );
    await renderApp({ route: '/settings/about' });
    const panel = await screen.findByRole('tabpanel', { name: 'About' });
    expect(within(panel).getByRole('group', { name: 'Version' })).toBeVisible();
    expect(within(panel).getByRole('heading', { name: 'What’s new' })).toBeVisible();
    expect(panel.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(panel).queryByRole('status')).toBeNull();
    expect(within(panel).queryByText('0.1.37')).toBeNull();
  });

  it('AC-4: while the hub’s first check of GitHub is on its way, Updates and What’s new hold their places', async () => {
    answering({ checkedAt: null, checking: true });
    const row = await versionRow();
    expect(await row.findByText('0.1.37')).toBeVisible();
    const panel = screen.getByRole('tabpanel', { name: 'About' });
    expect(panel.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(within(panel).queryByRole('group', { name: 'Updates' })).toBeNull();
    expect(within(panel).queryByText('No releases yet')).toBeNull();
  });

  it('says so when the Orynx server does not answer', async () => {
    server.use(http.get(apiUrl(apiRoutes.updates), () => HttpResponse.error()));
    await renderApp({ route: '/settings/about' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the Orynx server');
  });

  it('AC-5: has no axe violations', async () => {
    const { container } = await renderApp({ route: '/settings/about' });
    await screen.findByText('Desktop app');
    await expectNoAxeViolations(container);
  });
});
