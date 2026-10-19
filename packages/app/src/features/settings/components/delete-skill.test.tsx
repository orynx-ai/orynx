import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
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

describe('DeleteSkill', () => {
  it('AC-10: Delete skill asks first, deletes the folder, opens the next skill and puts focus on it', async () => {
    const writeTestsFirst = makeSkill({ folder: 'write-tests-first', title: 'Write tests first' });
    let list = makeSkillList({ skills: [makeSkill(), howWeReview, writeTestsFirst] });
    let deleted: string | undefined;
    server.use(
      http.get(apiUrl(apiRoutes.skills), () => HttpResponse.json(list)),
      http.delete(apiUrl(apiRoutes.skill), ({ params }) => {
        deleted = String(params['folder']);
        list = makeSkillList({ skills: list.skills.filter((skill) => skill.folder !== deleted) });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user, history } = await renderApp({ route: '/settings/skills?skill=how-we-review' });
    await screen.findByRole('heading', { level: 2, name: 'How we review' });

    await user.click(screen.getByRole('button', { name: 'Delete skill' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete How we review?' });
    expect(dialog).toHaveAccessibleDescription(
      'Orynx deletes ~/.devhub/plugin/skills/how-we-review. Sessions that used it keep what they were sent.',
    );
    // Actions at the end: Cancel first, Delete skill last.
    const [first, last] = within(dialog).getAllByRole('button');
    expect(first).toHaveAccessibleName('Cancel');
    expect(last).toHaveAccessibleName('Delete skill');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Delete skill' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Write tests first' })).toBeVisible();
    expect(deleted).toBe('how-we-review');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(history.location.search).toBe('?skill=write-tests-first');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Write tests first' })).toHaveFocus();
    });
  });

  it('AC-10: deleting the last skill in the list opens the one before it', async () => {
    let list = makeSkillList({ skills: [makeSkill(), howWeReview] });
    server.use(
      http.get(apiUrl(apiRoutes.skills), () => HttpResponse.json(list)),
      http.delete(apiUrl(apiRoutes.skill), () => {
        list = makeSkillList();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderApp({ route: '/settings/skills?skill=how-we-review' });
    await screen.findByRole('heading', { level: 2, name: 'How we review' });

    await user.click(screen.getByRole('button', { name: 'Delete skill' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete skill' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Bug bash' })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bug bash' })).toHaveFocus();
    });
  });

  it('AC-10: Cancel keeps the skill and puts focus back on Delete skill; a new skill has no Delete skill', async () => {
    skills(makeSkillList());
    const { user } = await renderApp({ route: '/settings/skills' });
    await screen.findByRole('heading', { level: 2, name: 'Bug bash' });

    await user.click(screen.getByRole('button', { name: 'Delete skill' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete skill' })).toHaveFocus();

    await user.click(within(pageBar()).getByRole('button', { name: 'New skill' }));
    await screen.findByRole('heading', { level: 2, name: 'New skill' });
    expect(screen.queryByRole('button', { name: 'Delete skill' })).not.toBeInTheDocument();
  });

  it("AC-10: says the skill wasn't deleted when the delete fails, and keeps it", async () => {
    skills(makeSkillList());
    server.use(
      http.delete(apiUrl(apiRoutes.skill), () =>
        HttpResponse.json({ code: 'internal', message: 'Disk said no.' }, { status: 500 }),
      ),
    );
    const { user } = await renderApp({ route: '/settings/skills' });
    await screen.findByRole('heading', { level: 2, name: 'Bug bash' });

    await user.click(screen.getByRole('button', { name: 'Delete skill' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete skill' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent("The skill wasn't deleted. Try again.");
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Bug bash' })).toBeVisible();
  });
});
