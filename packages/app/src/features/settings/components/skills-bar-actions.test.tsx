import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type OrynxSkillList } from '@devhub/contracts';
import { makeOrynxSkill, makeOrynxSkillList } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const howWeReview = makeOrynxSkill({
  folder: 'how-we-review',
  title: 'How we review',
  description: 'Review a pull request the way our team does.',
});

function skills(list: OrynxSkillList) {
  server.use(http.get(apiUrl(apiRoutes.orynxSkills), () => HttpResponse.json(list)));
}

/** The page bar: the strip with the breadcrumb, above the page. */
function pageBar() {
  const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
  const bar = crumbs.parentElement;
  if (bar === null) throw new Error('No page bar.');
  return bar;
}

describe('SkillsBarActions', () => {
  it('AC-2: says one skill, not one skills', async () => {
    skills(makeOrynxSkillList());
    await renderApp({ route: '/settings/skills' });

    expect(await within(pageBar()).findByText('1 skill in ~/.devhub/plugin')).toBeVisible();
  });

  it('AC-2: shows the count with the full path when DEVHUB_HOME is outside the home folder', async () => {
    skills(makeOrynxSkillList({ pluginFolder: '/srv/orynx/plugin', skills: [makeOrynxSkill(), howWeReview] }));
    await renderApp({ route: '/settings/skills' });

    expect(await within(pageBar()).findByText('2 skills in /srv/orynx/plugin')).toBeVisible();
  });

  it('AC-9: New skill opens a new skill in the address', async () => {
    skills(makeOrynxSkillList());
    const { user, history } = await renderApp({ route: '/settings/skills' });
    await screen.findByRole('heading', { level: 2, name: 'Bug bash' });

    await user.click(within(pageBar()).getByRole('button', { name: 'New skill' }));

    await waitFor(() => {
      expect(history.location.search).toBe('?new=true');
    });
  });
});
