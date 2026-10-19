import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type ReadySkill, type SkillList } from '@devhub/contracts';
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

describe('DiscardSkillChanges', () => {
  async function editBugBash() {
    skills(makeSkillList({ skills: [makeSkill(), howWeReview] }));
    const app = await renderApp({ route: '/settings/skills' });
    await screen.findByRole('heading', { level: 2, name: 'Bug bash' });
    await app.user.type(screen.getByRole('textbox', { name: 'Instructions for Claude' }), ' More.');
    return app;
  }

  it('AC-11: asks before another skill opens; Cancel keeps you on Bug bash with your changes', async () => {
    const { user, history } = await editBugBash();

    await user.click(screen.getByRole('button', { name: 'How we review' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard changes to Bug bash?' });
    const [first, last] = within(dialog).getAllByRole('button');
    expect(first).toHaveAccessibleName('Cancel');
    expect(last).toHaveAccessibleName('Discard changes');
    expect(first).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(history.location.search).toBe('');
    expect(screen.getByRole('heading', { level: 2, name: 'Bug bash' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Instructions for Claude' })).toHaveValue(
      `${makeSkill().instructions} More.`,
    );
  });

  it('AC-11: Discard changes goes on to the skill you picked', async () => {
    const { user, history } = await editBugBash();

    await user.click(screen.getByRole('button', { name: 'How we review' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'How we review' })).toBeVisible();
    expect(history.location.search).toBe('?skill=how-we-review');
  });

  it('AC-11: asks before New skill, and before leaving Settings › Skills', async () => {
    const { user, history } = await editBugBash();

    await user.click(within(pageBar()).getByRole('button', { name: 'New skill' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Discard changes to Bug bash?' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await user.click(screen.getByRole('tab', { name: 'Repositories' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    await waitFor(() => {
      expect(history.location.pathname).toBe('/settings/repositories');
    });
  });

  it('AC-11: lets you go without asking once the changes are saved', async () => {
    server.use(
      http.put(apiUrl(apiRoutes.skill), async ({ request }) =>
        HttpResponse.json(makeSkill((await request.json()) as Partial<ReadySkill>)),
      ),
    );
    const { user, history } = await editBugBash();

    await user.click(screen.getByRole('button', { name: 'Save skill' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
    });
    await user.click(screen.getByRole('button', { name: 'How we review' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'How we review' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(history.location.search).toBe('?skill=how-we-review');
  });
});
