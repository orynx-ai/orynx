import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type SkillList } from '@devhub/contracts';
import { makeSkill, makeSkillList } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
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

  it('AC-3: opens the first skill, and the one you pick, in the address', async () => {
    skills(makeSkillList({ skills: [makeSkill(), howWeReview] }));
    const { user, history } = await renderApp({ route: '/settings/skills' });

    const list = await screen.findByRole('list', { name: 'Your skills' });
    expect(within(list).getByRole('button', { name: 'Bug bash' })).toHaveAttribute('aria-current', 'true');

    await user.click(within(list).getByRole('button', { name: 'How we review' }));

    expect(history.location.search).toBe('?skill=how-we-review');
    expect(within(list).getByRole('button', { name: 'How we review' })).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('button', { name: 'Bug bash' })).not.toHaveAttribute('aria-current');
  });

  it('AC-3: opens the skill the address names, and the first one when it names none listed', async () => {
    skills(makeSkillList({ skills: [makeSkill(), howWeReview] }));
    const { unmount } = await renderApp({ route: '/settings/skills?skill=how-we-review' });
    expect(await screen.findByRole('button', { name: 'How we review' })).toHaveAttribute('aria-current', 'true');
    unmount();

    await renderApp({ route: '/settings/skills?skill=deleted-elsewhere' });
    expect(await screen.findByRole('button', { name: 'Bug bash' })).toHaveAttribute('aria-current', 'true');
  });

  it('AC-19: shows a change made in another tab when the server says skills changed', async () => {
    let list = makeSkillList();
    server.use(http.get(apiUrl(apiRoutes.skills), () => HttpResponse.json(list)));
    await renderApp({ route: '/settings/skills' });
    await screen.findByRole('button', { name: 'Bug bash' });

    list = makeSkillList({ skills: [makeSkill(), howWeReview] });
    FakeEventSource.latest().emit({ type: 'skills.changed' });

    expect(await screen.findByRole('button', { name: 'How we review' })).toBeVisible();
  });

  it('AC-9: New skill opens an empty editor with focus in Name, and Save skill adds the skill and opens it', async () => {
    let list = makeSkillList();
    let added: unknown;
    server.use(
      http.get(apiUrl(apiRoutes.skills), () => HttpResponse.json(list)),
      http.post(apiUrl(apiRoutes.skills), async ({ request }) => {
        added = await request.json();
        const skill = makeSkill({
          folder: 'pr-review',
          title: 'PR review',
          description: 'Review it.',
          instructions: 'Go.',
        });
        list = makeSkillList({ skills: [makeSkill(), skill] });
        return HttpResponse.json(skill, { status: 201 });
      }),
    );
    const { user, history } = await renderApp({ route: '/settings/skills' });
    await screen.findByRole('heading', { level: 2, name: 'Bug bash' });

    await user.click(within(pageBar()).getByRole('button', { name: 'New skill' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'New skill' })).toBeVisible();
    const name = screen.getByRole('textbox', { name: 'Name' });
    await waitFor(() => {
      expect(name).toHaveFocus();
    });
    expect(name).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Bug bash' })).not.toHaveAttribute('aria-current');
    expect(within(screen.getByRole('list', { name: 'Your skills' })).getAllByRole('button')).toHaveLength(1);

    await user.type(name, 'PR review');
    expect(screen.getByRole('textbox', { name: 'Folder name' })).toHaveValue('pr-review');
    await user.type(screen.getByRole('textbox', { name: 'When to use it' }), 'Review it.');
    await user.type(screen.getByRole('textbox', { name: 'Instructions for Claude' }), 'Go.');
    await user.click(screen.getByRole('button', { name: 'Save skill' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'PR review' })).toBeVisible();
    expect(added).toEqual({ title: 'PR review', description: 'Review it.', instructions: 'Go.' });
    expect(history.location.search).toBe('?skill=pr-review');
    expect(screen.getByRole('button', { name: 'PR review' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('AC-9: New skill works with no skills yet', async () => {
    const { user } = await renderApp({ route: '/settings/skills' });
    await screen.findByText('No skills yet.');

    await user.click(within(pageBar()).getByRole('button', { name: 'New skill' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'New skill' })).toBeVisible();
    expect(screen.queryByText('No skills yet.')).not.toBeInTheDocument();
  });

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
