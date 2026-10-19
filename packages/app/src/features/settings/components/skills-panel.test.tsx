import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type SkillList } from '@devhub/contracts';
import { makeSkill, makeSkillList } from '@devhub/contracts/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const howWeReview = makeSkill({
  folder: 'how-we-review',
  title: 'How we review',
  description: 'Review a pull request the way our team does.',
});

function skills(list: SkillList) {
  server.use(http.get(apiUrl(apiRoutes.skills), () => HttpResponse.json(list)));
}

/** The page bar: the strip with the breadcrumb, above the page. */
function pageBar() {
  const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
  const bar = crumbs.parentElement;
  if (bar === null) throw new Error('No page bar.');
  return bar;
}

describe('Settings › Skills', () => {
  it('AC-2: shows the count and New skill in the page bar, the callout, and your skills by Name', async () => {
    skills(makeSkillList({ skills: [makeSkill(), howWeReview] }));
    await renderApp({ route: '/settings/skills' });

    const list = await screen.findByRole('list', { name: 'Your skills' });
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(within(list).getByRole('button', { name: 'Bug bash' })).toBeVisible();
    expect(within(list).getByRole('button', { name: 'How we review' })).toBeVisible();
    expect(within(pageBar()).getByText('2 skills in ~/.devhub/plugin')).toBeVisible();
    expect(within(pageBar()).getByRole('button', { name: 'New skill' })).toBeVisible();
    expect(within(pageBar()).queryByText('Changes save automatically')).not.toBeInTheDocument();
    expect(screen.getByText('A skill tells Claude how to do one kind of work')).toBeVisible();
    expect(
      screen.getByText(
        'Claude reads a skill only in a session where you name it with / in the composer. Skills live in your own folder, outside your repos and ~/.claude.',
      ),
    ).toBeVisible();
  });

  it('AC-2: says one skill, not one skills', async () => {
    skills(makeSkillList());
    await renderApp({ route: '/settings/skills' });

    expect(await within(pageBar()).findByText('1 skill in ~/.devhub/plugin')).toBeVisible();
  });

  it('AC-12: with no skills, says so, offers the starters, and shows no count', async () => {
    await renderApp({ route: '/settings/skills' });

    expect(await screen.findByText('No skills yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add the starter skills' })).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Your skills' })).not.toBeInTheDocument();
    expect(within(pageBar()).getByRole('button', { name: 'New skill' })).toBeVisible();
    expect(within(pageBar()).queryByText(/skills? in/)).not.toBeInTheDocument();
  });

  it('AC-13: Add the starter skills adds them, and the list shows them', async () => {
    let list = makeSkillList({ skills: [] });
    server.use(
      http.get(apiUrl(apiRoutes.skills), () => HttpResponse.json(list)),
      http.post(apiUrl(apiRoutes.skillStarters), () => {
        list = makeSkillList({ skills: [makeSkill(), howWeReview] });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderApp({ route: '/settings/skills' });

    await user.click(await screen.findByRole('button', { name: 'Add the starter skills' }));

    const shown = await screen.findByRole('list', { name: 'Your skills' });
    expect(within(shown).getByRole('button', { name: 'How we review' })).toBeVisible();
    expect(screen.queryByText('No skills yet.')).not.toBeInTheDocument();
  });

  it('AC-15: keeps the callout and shows no list while the skills load', async () => {
    server.use(
      http.get(apiUrl(apiRoutes.skills), async () => {
        await delay(150);
        return HttpResponse.json(makeSkillList());
      }),
    );
    await renderApp({ route: '/settings/skills' });

    expect(await screen.findByText('A skill tells Claude how to do one kind of work')).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Your skills' })).not.toBeInTheDocument();
    expect(screen.queryByText('No skills yet.')).not.toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Your skills' })).toBeVisible();
  });

  it("AC-15: says the skills didn't load, and Try again reads them again", async () => {
    let fail = true;
    server.use(
      http.get(apiUrl(apiRoutes.skills), () =>
        fail
          ? HttpResponse.json({ code: 'internal', message: 'Disk said no.' }, { status: 500 })
          : HttpResponse.json(makeSkillList()),
      ),
    );
    const { user } = await renderApp({ route: '/settings/skills' });

    expect(await screen.findByText("Skills didn't load.")).toBeVisible();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByRole('list', { name: 'Your skills' })).toBeVisible();
    });
    expect(screen.queryByText("Skills didn't load.")).not.toBeInTheDocument();
  });
});
