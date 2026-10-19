import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, folderFromName, type ReadySkill, type SaveSkillRequest } from '@devhub/contracts';
import { makeOrynxSkill, makeOrynxSkillList } from '@devhub/contracts/testing';
import { useComposerStore } from '../../home/store.ts';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

/** A skills folder on the fake server: the list, and saves that change it as the real one would. */
function skillsServer(start: ReadySkill[] = [makeOrynxSkill()]) {
  let skills = start;
  const saves: { folder: string; body: SaveSkillRequest }[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.orynxSkills), () => HttpResponse.json(makeOrynxSkillList({ skills }))),
    http.put(apiUrl(apiRoutes.orynxSkill), async ({ params, request }) => {
      const body = (await request.json()) as SaveSkillRequest;
      const folder = String(params['folder']);
      saves.push({ folder, body });
      const saved = makeOrynxSkill({ ...body, folder: folderFromName(body.title) });
      skills = skills.map((skill) => (skill.folder === folder ? saved : skill));
      return HttpResponse.json(saved);
    }),
  );
  return { saves };
}

/** The editor: the region that holds Save skill. */
function editor(): HTMLElement {
  const region = screen.getByRole('button', { name: 'Save skill' }).closest('section');
  if (region === null) throw new Error('No editor.');
  return region;
}

async function openBugBash() {
  const app = await renderApp({ route: '/settings/skills' });
  await screen.findByRole('heading', { level: 2, name: 'Bug bash' });
  return app;
}

describe('SkillEditor', () => {
  it("AC-2: shows the open skill's Name, its file, its fields with their help, and Saved", async () => {
    skillsServer();
    await openBugBash();

    const panel = editor();
    expect(panel).toHaveAccessibleName('Bug bash');
    expect(within(panel).getByText('~/.devhub/plugin/skills/bug-bash/SKILL.md')).toBeVisible();
    expect(within(panel).getByRole('textbox', { name: 'Name' })).toHaveValue('Bug bash');
    expect(within(panel).getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription(
      'Shown in this list. In the composer you type /bug-bash.',
    );
    const folder = within(panel).getByRole('textbox', { name: 'Folder name' });
    expect(folder).toHaveValue('bug-bash');
    expect(folder).toHaveAttribute('readonly');
    expect(folder).toHaveAccessibleDescription('Made from the name. Letters, numbers and dashes.');
    expect(within(panel).getByRole('textbox', { name: 'When to use it' })).toHaveValue(makeOrynxSkill().description);
    expect(within(panel).getByRole('textbox', { name: 'When to use it' })).toHaveAccessibleDescription(
      'One sentence. You see it when picking a skill.',
    );
    expect(within(panel).getByRole('textbox', { name: 'Instructions for Claude' })).toHaveValue(
      makeOrynxSkill().instructions,
    );
    expect(within(panel).getByRole('textbox', { name: 'Instructions for Claude' })).toHaveAccessibleDescription(
      'Markdown. Steps, what good output looks like, what not to do.',
    );
    expect(within(panel).getByRole('status')).toHaveTextContent('Saved');
    expect(within(panel).getByRole('button', { name: 'Save skill' })).toBeVisible();
  });

  it('AC-5, AC-27: says Unsaved changes after an edit, saves it, then says Saved', async () => {
    const { saves } = skillsServer();
    const { user } = await openBugBash();
    const box = within(editor()).getByRole('textbox', { name: 'Instructions for Claude' });

    await user.clear(box);
    await user.type(box, 'Report only.');
    expect(within(editor()).getByRole('status')).toHaveTextContent('Unsaved changes');
    await user.click(within(editor()).getByRole('button', { name: 'Save skill' }));

    await waitFor(() => {
      expect(within(editor()).getByRole('status')).toHaveTextContent('Saved');
    });
    expect(saves).toEqual([
      {
        folder: 'bug-bash',
        body: { title: 'Bug bash', description: makeOrynxSkill().description, instructions: 'Report only.' },
      },
    ]);
  });

  it('AC-6: shows the folder the new Name makes as you type, and opens the skill under it once saved', async () => {
    const { saves } = skillsServer();
    const { user, history } = await openBugBash();
    const name = within(editor()).getByRole('textbox', { name: 'Name' });

    await user.clear(name);
    await user.type(name, 'Bug hunt');
    expect(within(editor()).getByRole('textbox', { name: 'Folder name' })).toHaveValue('bug-hunt');
    expect(within(editor()).getByText('~/.devhub/plugin/skills/bug-hunt/SKILL.md')).toBeVisible();
    await user.click(within(editor()).getByRole('button', { name: 'Save skill' }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Bug hunt' })).toBeVisible();
    expect(saves[0]?.folder).toBe('bug-bash');
    expect(history.location.search).toBe('?skill=bug-hunt');
    expect(screen.getByRole('button', { name: 'Bug hunt' })).toHaveAttribute('aria-current', 'true');
    expect(within(editor()).getByRole('status')).toHaveTextContent('Saved');
  });

  it('AC-8: says why each field is refused, tied to it, focuses the first, and sends nothing', async () => {
    const { saves } = skillsServer();
    const { user } = await openBugBash();
    const panel = editor();

    await user.clear(within(panel).getByRole('textbox', { name: 'Name' }));
    await user.clear(within(panel).getByRole('textbox', { name: 'When to use it' }));
    await user.clear(within(panel).getByRole('textbox', { name: 'Instructions for Claude' }));
    await user.click(within(panel).getByRole('button', { name: 'Save skill' }));

    expect(within(panel).getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription('Give the skill a name.');
    expect(within(panel).getByRole('textbox', { name: 'Name' })).toHaveFocus();
    expect(within(panel).getByRole('textbox', { name: 'When to use it' })).toHaveAccessibleDescription(
      'Say when to use it.',
    );
    expect(within(panel).getByRole('textbox', { name: 'Instructions for Claude' })).toHaveAccessibleDescription(
      'Write the instructions.',
    );

    await user.type(within(panel).getByRole('textbox', { name: 'Name' }), '!!!');
    expect(within(panel).getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription(
      'Use at least one letter or digit.',
    );
    expect(saves).toEqual([]);
  });

  it("AC-16: keeps your changes and says the skill wasn't saved when the save fails", async () => {
    skillsServer();
    server.use(
      http.put(apiUrl(apiRoutes.orynxSkill), () =>
        HttpResponse.json({ code: 'not_found', message: 'This skill is no longer in the folder.' }, { status: 404 }),
      ),
    );
    const { user } = await openBugBash();
    const box = within(editor()).getByRole('textbox', { name: 'Instructions for Claude' });

    await user.type(box, ' More.');
    await user.click(within(editor()).getByRole('button', { name: 'Save skill' }));

    expect(await within(editor()).findByRole('alert')).toHaveTextContent("The skill wasn't saved. Try again.");
    expect(box).toHaveValue(`${makeOrynxSkill().instructions} More.`);
    expect(within(editor()).getByRole('status')).toHaveTextContent('Unsaved changes');
  });

  it('AC-7: says under Name that another skill has the folder, with focus there', async () => {
    skillsServer([makeOrynxSkill(), makeOrynxSkill({ folder: 'bug-hunt', title: 'Bug hunt' })]);
    server.use(
      http.put(apiUrl(apiRoutes.orynxSkill), () =>
        HttpResponse.json(
          { code: 'skill_rejected', message: 'You already have a skill in bug-hunt.' },
          { status: 422 },
        ),
      ),
    );
    const { user } = await openBugBash();
    const name = within(editor()).getByRole('textbox', { name: 'Name' });

    await user.clear(name);
    await user.type(name, 'Bug hunt');
    await user.click(within(editor()).getByRole('button', { name: 'Save skill' }));

    await waitFor(() => {
      expect(name).toHaveAccessibleDescription('You already have a skill in bug-hunt.');
    });
    expect(name).toHaveFocus();
    expect(within(editor()).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(editor()).getByRole('status')).toHaveTextContent('Unsaved changes');
  });

  it("AC-14: says under Bug bash's instructions what it can and can't do today, and only there", async () => {
    skillsServer([makeOrynxSkill(), makeOrynxSkill({ folder: 'how-we-review', title: 'How we review' })]);
    const { user } = await openBugBash();

    const callout = within(editor()).getByText("What this skill can and can't do today");
    expect(callout).toBeVisible();
    expect(
      within(editor()).getByText(
        "It can read code and run tests. It can't open the running app: sessions have no network and no browser. Bugs come back as a list in the session.",
      ),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'How we review' }));
    await screen.findByRole('heading', { level: 2, name: 'How we review' });
    expect(screen.queryByText("What this skill can and can't do today")).not.toBeInTheDocument();
  });

  it('AC-24: says in its head how many sessions used the skill, or Not used yet', async () => {
    skillsServer([makeOrynxSkill({ uses: 4 }), makeOrynxSkill({ folder: 'how-we-review', title: 'How we review' })]);
    const { user } = await openBugBash();

    expect(within(editor()).getByText('Used in 4 sessions')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'How we review' }));
    await screen.findByRole('heading', { level: 2, name: 'How we review' });
    expect(within(editor()).getByText('Not used yet')).toBeVisible();
  });

  it('AC-23: Try in a new session opens Home with /bug-bash at the start of the box, the caret after it', async () => {
    skillsServer();
    const { user, history } = await openBugBash();
    useComposerStore.getState().setText('on the date picker');

    await user.click(within(editor()).getByRole('button', { name: 'Try in a new session' }));

    await waitFor(() => {
      expect(history.location.pathname).toBe('/');
    });
    const box = await screen.findByRole('textbox', { name: 'Describe a task for Claude' });
    expect(box).toHaveValue('/bug-bash on the date picker');
    await waitFor(() => {
      expect(box).toHaveFocus();
    });
    expect((box as HTMLTextAreaElement).selectionStart).toBe('/bug-bash '.length);
  });

  it('AC-23: with unsaved changes, asks first; Cancel leaves the box as it was, Discard changes goes on', async () => {
    skillsServer();
    const { user, history } = await openBugBash();
    await user.type(within(editor()).getByRole('textbox', { name: 'Instructions for Claude' }), ' More.');

    await user.click(within(editor()).getByRole('button', { name: 'Try in a new session' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(history.location.pathname).toBe('/settings/skills');
    expect(useComposerStore.getState().text).toBe('');

    await user.click(within(editor()).getByRole('button', { name: 'Try in a new session' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard changes' }));

    expect(await screen.findByRole('textbox', { name: 'Describe a task for Claude' })).toHaveValue('/bug-bash ');
  });

  it('AC-23: a new skill has no Try in a new session', async () => {
    skillsServer();
    const { user } = await openBugBash();

    await user.click(screen.getByRole('button', { name: 'New skill' }));
    await screen.findByRole('heading', { level: 2, name: 'New skill' });

    expect(screen.queryByRole('button', { name: 'Try in a new session' })).not.toBeInTheDocument();
  });
});
