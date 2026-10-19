import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type SkillList } from '@devhub/contracts';
import { makeRepository } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { useComposerStore } from '../store.ts';

const web = makeRepository({ id: '00000000000000aa', name: 'web-app', displayPath: '~/code/web-app' });
const api = makeRepository({ id: '00000000000000bb', name: 'api', displayPath: '~/code/api', jiraProject: null });
const skills: SkillList = {
  skills: [
    { name: 'build', description: 'Build the next task', source: 'folder' },
    { name: 'review', description: 'Review the branch', source: 'folder' },
    { name: 'notes', description: null, source: 'yours' },
  ],
};

/** Two folders, web-app picked; the skills read answers `answer`, or never; returns each folder asked for. */
function serve(answer: SkillList | 'slow' | 'fails' = skills) {
  const asked: (string | null)[] = [];
  const posted: unknown[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.repositories), () => HttpResponse.json({ repositories: [web, api] })),
    http.get(apiUrl(apiRoutes.skills), async ({ request }) => {
      asked.push(new URL(request.url).searchParams.get('repositoryId'));
      if (answer === 'slow') await delay('infinite');
      if (answer === 'fails') return HttpResponse.json({ code: 'internal', message: 'No.' }, { status: 500 });
      return HttpResponse.json(answer);
    }),
    http.post(apiUrl(apiRoutes.sessions), async ({ request }) => {
      posted.push(await request.json());
      return HttpResponse.json({ result: 'started', sessionId: '0123456789abcdef' });
    }),
  );
  useComposerStore.setState({ picked: web.id });
  return { asked, posted };
}

const box = () => screen.getByRole('textbox', { name: 'Describe a task for Claude' });
const list = () => screen.queryByRole('listbox', { name: 'Skills' });
const names = () =>
  within(screen.getByRole('listbox', { name: 'Skills' }))
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('the composer’s / list (spec 022, G)', () => {
  it('AC-49: / at the start opens the skills of the shown folder and yours, the first active, focus in the box', async () => {
    const { asked } = serve();
    const { user, container } = await renderApp();
    await user.click(box());
    expect(asked).toEqual([]);

    await user.keyboard('/');

    await waitFor(() => {
      expect(names()).toEqual([
        '/build, Build the next task, web-app',
        '/review, Review the branch, web-app',
        '/notes, , Yours',
      ]);
    });
    expect(asked).toEqual(['00000000000000aa']);
    expect(box()).toHaveFocus();
    expect(box()).toHaveAttribute('aria-controls', list()?.id);
    const [first] = within(list() ?? container).getAllByRole('option');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(box()).toHaveAttribute('aria-activedescendant', first?.id);
    await expectNoAxeViolations(container);
  });

  it('AC-50, AC-51: typing filters, arrows move, and Enter puts /name in the box without sending', async () => {
    const { posted } = serve();
    const { user } = await renderApp();
    await user.click(box());
    await user.keyboard('Use /re');
    await waitFor(() => {
      expect(names()).toEqual(['/review, Review the branch, web-app']);
    });

    await user.keyboard('{Backspace}{Backspace}');
    await waitFor(() => {
      expect(names()).toHaveLength(3);
    });
    await user.keyboard('{ArrowDown}');
    expect(within(list() ?? document.body).getByRole('option', { name: /\/review/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{Enter}');

    expect(box()).toHaveValue('Use /review ');
    expect(list()).toBeNull();
    expect(posted).toEqual([]);
    expect((box() as HTMLTextAreaElement).selectionStart).toBe('Use /review '.length);
  });

  it('AC-51: Tab or a click picks too', async () => {
    serve();
    const { user } = await renderApp();
    await user.click(box());
    await user.keyboard('/b');
    await waitFor(() => {
      expect(names()).toHaveLength(1);
    });
    await user.keyboard('{Tab}');
    expect(box()).toHaveValue('/build ');
    expect(box()).toHaveFocus();

    await user.keyboard('and /');
    await user.click(await screen.findByRole('option', { name: /\/notes/ }));
    expect(box()).toHaveValue('/build and /notes ');
    expect(box()).toHaveFocus();
  });

  it('AC-52: Esc or a space closes it and keeps what was typed; / inside a word opens nothing', async () => {
    serve();
    const { user } = await renderApp();
    await user.click(box());
    await user.keyboard('/re');
    await waitFor(() => {
      expect(list()).not.toBeNull();
    });
    await user.keyboard('{Escape}');
    expect(list()).toBeNull();
    expect(box()).toHaveValue('/re');

    await user.keyboard(' and src/app');
    expect(list()).toBeNull();
    await user.keyboard(' /');
    await waitFor(() => {
      expect(list()).not.toBeNull();
    });
    await user.keyboard(' ');
    expect(list()).toBeNull();
  });

  it('AC-54: with no skill to match, the list goes, and Enter sends the words as they are', async () => {
    const { posted } = serve();
    const { user } = await renderApp();
    await user.click(box());
    await user.keyboard('Try /nope');
    await waitFor(() => {
      expect(list()).toBeNull();
    });
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(posted).toEqual([{ message: 'Try /nope', repositoryId: web.id, context: [] }]);
    });
  });

  it('AC-55: a folder with no skills, and none of yours, says so', async () => {
    serve({ skills: [] });
    const { user } = await renderApp();
    await user.click(box());
    await user.keyboard('/');
    expect(await screen.findByText('No skills in web-app or in ~/.claude.')).toBeVisible();
  });

  it('AC-56: shows loading rows while the skills are read', async () => {
    serve('slow');
    const { user } = await renderApp();
    await user.click(box());
    await user.keyboard('/');
    await waitFor(() => {
      expect(list()).toHaveAttribute('aria-busy', 'true');
    });
  });

  it('AC-56: says so in one line if the read fails, and typing goes on as text', async () => {
    serve('fails');
    const { user } = await renderApp();
    await user.click(box());
    await user.keyboard('/');
    expect(await screen.findByText("Orynx couldn't read the skills.")).toBeVisible();
    await user.keyboard('review');
    expect(box()).toHaveValue('/review');
  });

  it('AC-59: picking another folder lists its skills', async () => {
    const { asked } = serve();
    const { user } = await renderApp();
    await user.click(box());
    await user.keyboard('/');
    await waitFor(() => {
      expect(asked).toEqual(['00000000000000aa']);
    });
    await user.keyboard('{Escape}');
    useComposerStore.setState({ picked: api.id });
    await user.keyboard(' /');
    await waitFor(() => {
      expect(asked).toEqual(['00000000000000aa', '00000000000000bb']);
    });
  });

  it('022 Q12: more than 5 skills named says so, and Send waits', async () => {
    serve({
      skills: ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => ({ name, description: null, source: 'folder' as const })),
    });
    const { user } = await renderApp();
    await user.click(box());
    await user.keyboard('/');
    await waitFor(() => {
      expect(list()).not.toBeNull();
    });
    await user.keyboard('{Escape}');
    await user.keyboard('{Backspace}');
    await user.type(box(), 'Use /a /b /c /d /e and /f.');
    expect(await screen.findByRole('alert')).toHaveTextContent('Use up to 5 skills.');
    expect(screen.getByRole('button', { name: 'Send to Claude' })).toHaveAttribute('aria-disabled', 'true');
  });
});
