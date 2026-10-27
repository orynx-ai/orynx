import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Session } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;

const done: Session = makeSession({
  id,
  state: 'done',
  step: 'review',
  activities: [
    {
      id: 'step-1',
      state: 'done',
      kind: 'brief',
      key: 'PROJ-1423',
      tickets: [],
      message: true,
      pullRequests: [],
      files: [],
      skills: [],
    },
    {
      id: 'step-2',
      state: 'done',
      kind: 'explore',
      files: ['src/content/ContentList.tsx', 'src/content/api/contentApi.ts', 'src/a.ts', 'src/b.ts'],
    },
    { id: 'step-3', state: 'done', kind: 'edit', files: ['src/content/ContentList.tsx'] },
    { id: 'step-4', state: 'done', kind: 'command', commands: ['npm test -- --run', 'npm run lint'] },
    { id: 'step-5', state: 'done', kind: 'finished', summary: 'Added **bulk archive**.\n\n- Checkbox on each row' },
    { id: 'step-6', state: 'done', kind: 'message', text: 'One\nTwo\nThree\nFour' },
  ],
});

function serve(brief: { text: string | null } | 'fails' = { text: 'Only the tests\n\n## Jira ticket PROJ-1423' }) {
  server.use(
    sessionHandler(done),
    http.get(apiUrl(apiRoutes.sessionBrief), () =>
      brief === 'fails'
        ? HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 })
        : HttpResponse.json(brief),
    ),
  );
}

const progress = async () => within(await screen.findByRole('region', { name: 'What agent did' }));

describe('a step in full (the user’s call, 19 Oct 2026)', () => {
  it('Sent Claude the brief shows exactly what Claude was sent, and Esc gives focus back to the step', async () => {
    serve();
    const { user } = await renderApp({ route });
    const step = (await progress()).getByRole('button', { name: 'Sent Claude the brief' });
    await user.click(step);

    const dialog = await screen.findByRole('dialog', { name: 'What Claude was sent' });
    expect(await within(dialog).findByText('Only the tests')).toBeVisible();
    expect(within(dialog).getByRole('heading', { name: 'Jira ticket PROJ-1423' })).toBeVisible();
    await expectNoAxeViolations(dialog);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(step).toHaveFocus();
  });

  it('says when nothing was sent yet, and when the brief couldn’t be read, with Try again', async () => {
    serve({ text: null });
    const { user } = await renderApp({ route });
    await user.click((await progress()).getByRole('button', { name: 'Sent Claude the brief' }));
    expect(await screen.findByText('Nothing was sent to Claude yet.')).toBeVisible();
    await user.keyboard('{Escape}');

    serve('fails');
    await user.click((await progress()).getByRole('button', { name: 'Sent Claude the brief' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read what Claude was sent.");
    serve({ text: 'Now it reads' });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Now it reads')).toBeVisible();
  });

  it('lists every file read with its full path and a copy button', async () => {
    serve();
    const { user } = await renderApp({ route });
    await user.click((await progress()).getByRole('button', { name: 'Explored the code' }));
    const dialog = await screen.findByRole('dialog', { name: 'Explored the code' });
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['src/content/ContentList.tsx', 'src/content/api/contentApi.ts', 'src/a.ts', 'src/b.ts']);
    await user.click(within(dialog).getByRole('button', { name: 'Copy src/content/api/contentApi.ts' }));
    expect(await navigator.clipboard.readText()).toBe('src/content/api/contentApi.ts');
  });

  it('an edited file opens its diff in the Changes tab', async () => {
    serve();
    const { user, history } = await renderApp({ route: `${route}?tab=context` });
    await user.click((await progress()).getByRole('button', { name: 'Edited 1 file' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edited 1 file' });
    await user.click(within(dialog).getByRole('button', { name: 'src/content/ContentList.tsx' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const search = new URLSearchParams(history.location.search);
    expect(search.get('file')).toBe('src/content/ContentList.tsx');
    expect(search.get('tab')).toBeNull();
  });

  it('shows each command as code, in the step and in full', async () => {
    serve();
    const { user } = await renderApp({ route });
    const steps = await progress();
    // In the step's line too, each command is code.
    expect(steps.getByText('npm test -- --run').tagName).toBe('CODE');
    await user.click(steps.getByRole('button', { name: 'Ran 2 commands' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ran 2 commands' });
    expect(within(dialog).getByText('npm test -- --run').closest('pre')).not.toBeNull();
    expect(within(dialog).getByText('npm run lint').closest('pre')).not.toBeNull();
  });

  it('shows Claude’s whole summary laid out, and your whole message', async () => {
    serve();
    const { user } = await renderApp({ route });
    await user.click((await progress()).getByRole('button', { name: 'Finished' }));
    const summary = await screen.findByRole('dialog', { name: 'Finished' });
    expect(within(summary).getByText('bulk archive').tagName).toBe('STRONG');
    expect(within(summary).getByRole('listitem')).toHaveTextContent('Checkbox on each row');
    await user.keyboard('{Escape}');

    await user.click((await progress()).getByRole('button', { name: 'You asked Claude' }));
    const message = await screen.findByRole('dialog', { name: 'You asked Claude' });
    expect(within(message).getByText(/Four/)).toHaveTextContent('One Two Three Four');
  });
});
