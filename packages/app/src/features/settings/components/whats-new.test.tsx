import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Release } from '@devhub/contracts';
import { makeRelease, makeUpdates } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

function answering(releases: Release[]) {
  server.use(http.get(apiUrl(apiRoutes.updates), () => HttpResponse.json(makeUpdates({ releases }))));
}

async function whatsNew() {
  const app = await renderApp({ route: '/settings/about' });
  const heading = await screen.findByRole('heading', { name: 'What’s new' });
  const section = heading.closest('section');
  if (section === null) throw new Error('What’s new is not a section');
  return { ...app, section: within(section) };
}

describe('Settings › About: What’s new (spec 045)', () => {
  it('AC-14: lists the releases newest first, each with its date and notes, the newer ones New and yours marked', async () => {
    answering(
      [40, 39, 38, 37, 36, 35, 34, 33, 32, 31].map((patch) =>
        makeRelease({
          version: `0.1.${String(patch)}`,
          publishedAt: `2026-10-${String(patch - 18)}T10:00:00.000Z`,
          notes: `- Change in ${String(patch)}`,
          newer: patch > 37,
          mine: patch === 37,
        }),
      ),
    );
    const { section } = await whatsNew();
    const releases = await section.findAllByRole('article');
    expect(releases.map((release) => within(release).getByRole('heading', { level: 3 }).textContent)).toEqual([
      '0.1.40New',
      '0.1.39New',
      '0.1.38New',
      '0.1.37Your version',
      '0.1.36',
      '0.1.35',
      '0.1.34',
      '0.1.33',
      '0.1.32',
      '0.1.31',
    ]);
    const newest = within(releases[0] ?? document.body);
    expect(newest.getByText('22 Oct 2026')).toBeVisible();
    expect(newest.getByRole('listitem')).toHaveTextContent('Change in 40');
  });

  it('AC-15, AC-16: notes draw links, headings and lists, show raw HTML as text, and open links in the browser', async () => {
    answering([
      makeRelease({
        notes:
          '## New\n\n- Show the [inbox tabs](https://github.com/orynx-ai/orynx/pull/9)\n\n<img src=x onerror=alert(1)>',
      }),
    ]);
    const { section, user, platform } = await whatsNew();
    expect(await section.findByRole('heading', { name: 'New', level: 4 })).toBeVisible();
    expect(section.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(document.querySelector('img')).toBeNull();

    await user.click(section.getByRole('link', { name: /inbox tabs/ }));
    expect(platform.openExternal).toHaveBeenCalledWith('https://github.com/orynx-ai/orynx/pull/9');
    await user.click(section.getByRole('link', { name: /All releases on GitHub/ }));
    expect(platform.openExternal).toHaveBeenCalledWith('https://github.com/orynx-ai/orynx/releases');
  });

  it('AC-17: a release with no notes says so', async () => {
    answering([makeRelease({ notes: '' })]);
    const { section } = await whatsNew();
    expect(await section.findByText('No notes for this release.')).toBeVisible();
  });

  it('AC-11: with no releases, shows its empty state', async () => {
    answering([]);
    const { section } = await whatsNew();
    expect(await section.findByText('No releases yet')).toBeVisible();
    expect(section.getByText('Each release’s notes show here.')).toBeVisible();
  });

  it('AC-5: has no axe violations', async () => {
    answering([makeRelease(), makeRelease({ version: '0.1.37', newer: false, mine: true })]);
    const { container } = await renderApp({ route: '/settings/about' });
    await screen.findAllByRole('article');
    await expectNoAxeViolations(container);
  });
});
