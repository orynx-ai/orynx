import { act, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type Session } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
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

describe('a step opened in place (spec 046)', () => {
  it('AC-7: Sent Claude the brief opens under itself to exactly what Claude was sent, with nothing over the page', async () => {
    serve();
    const { user } = await renderApp({ route });
    const step = (await progress()).getByRole('button', { name: 'Sent Claude the brief' });
    expect(step).toHaveAttribute('aria-expanded', 'false');
    await user.click(step);

    expect(step).toHaveAttribute('aria-expanded', 'true');
    expect(step).toHaveFocus();
    const pane = await progress();
    expect(await pane.findByText('Only the tests')).toBeVisible();
    expect(pane.getByRole('heading', { name: 'Jira ticket PROJ-1423' })).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    await expectNoAxeViolations(document.body);
    await user.click(step);
    expect(pane.queryByText('Only the tests')).toBeNull();
  });

  it('AC-7: says when nothing was sent yet, and when the brief couldn’t be read, with Try again', async () => {
    serve({ text: null });
    const { user } = await renderApp({ route });
    const step = (await progress()).getByRole('button', { name: 'Sent Claude the brief' });
    await user.click(step);
    expect(await screen.findByText('Nothing was sent to Claude yet.')).toBeVisible();
    await user.click(step);

    serve('fails');
    await user.click(step);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read what Claude was sent.");
    serve({ text: 'Now it reads' });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Now it reads')).toBeVisible();
  });

  it('AC-5, AC-9: lists every file read with its full path and a copy button, beside another open step', async () => {
    serve();
    const { user } = await renderApp({ route });
    const pane = await progress();
    await user.click(pane.getByRole('button', { name: 'Explored the code' }));
    await user.click(pane.getByRole('button', { name: 'Edited 1 file' }));
    for (const path of ['src/content/api/contentApi.ts', 'src/a.ts', 'src/b.ts']) {
      expect(pane.getByText(path)).toBeVisible();
    }
    expect(pane.getByRole('button', { name: 'src/content/ContentList.tsx' })).toBeVisible();
    await user.click(pane.getByRole('button', { name: 'Copy src/content/api/contentApi.ts' }));
    expect(await navigator.clipboard.readText()).toBe('src/content/api/contentApi.ts');
  });

  it('AC-6: an edited file opens its diff in the Changes tab', async () => {
    serve();
    const { user, history } = await renderApp({ route: `${route}?tab=context` });
    const pane = await progress();
    await user.click(pane.getByRole('button', { name: 'Edited 1 file' }));
    await user.click(pane.getByRole('button', { name: 'src/content/ContentList.tsx' }));
    await waitFor(() => {
      expect(new URLSearchParams(history.location.search).get('file')).toBe('src/content/ContentList.tsx');
    });
    expect(new URLSearchParams(history.location.search).get('tab')).toBeNull();
  });

  it('shows each command as code, in the step and in full', async () => {
    serve();
    const { user } = await renderApp({ route });
    const pane = await progress();
    // In the step's line too, each command is code.
    expect(pane.getAllByText('npm test -- --run')[0]?.tagName).toBe('CODE');
    await user.click(pane.getByRole('button', { name: 'Ran 2 commands' }));
    expect(pane.getAllByText('npm run lint').some((command) => command.closest('pre') !== null)).toBe(true);
  });

  it('AC-11: Claude’s whole summary shows under Finished, which isn’t a button; your whole message opens in place', async () => {
    serve();
    const { user } = await renderApp({ route });
    const pane = await progress();
    expect(pane.getByText('bulk archive').tagName).toBe('STRONG');
    expect(pane.queryByRole('button', { name: 'Finished' })).toBeNull();

    await user.click(pane.getByRole('button', { name: 'You asked Claude' }));
    expect(pane.getByText(/Four/)).toHaveTextContent('One Two Three Four');
  });

  it('AC-18: a plan with no items and a command step with no commands have nothing to open', async () => {
    server.use(
      sessionHandler(
        makeSession({
          id,
          state: 'done',
          activities: [
            { id: 'step-1', state: 'done', kind: 'plan', items: [] },
            { id: 'step-2', state: 'done', kind: 'command', commands: [] },
          ],
        }),
      ),
    );
    await renderApp({ route });
    const pane = await progress();
    expect(await pane.findByText('Made a plan')).toBeVisible();
    expect(pane.queryByRole('button', { name: 'Made a plan' })).toBeNull();
    expect(pane.getByText('Ran 0 commands')).toBeVisible();
    expect(pane.queryByRole('button', { name: 'Ran 0 commands' })).toBeNull();
  });

  it('AC-8: an open command step shows each new command as Claude runs it, and stays open', async () => {
    const running = (commands: string[]): Session =>
      makeSession({
        id,
        state: 'working',
        updatedAt: `2026-10-16T10:00:0${String(commands.length)}.000Z`,
        activities: [{ id: 'step-1', state: 'running', kind: 'command', commands }],
      });
    server.use(sessionHandler(running(['npm install'])));
    const { user } = await renderApp({ route });
    const pane = await progress();
    const step = pane.getByRole('button', { name: 'Running a command' });
    await user.click(step);

    server.use(sessionHandler(running(['npm install', 'npm test'])));
    act(() => {
      FakeEventSource.latest().emit({ type: 'session.changed', sessionId: id });
    });
    await waitFor(() => {
      expect(pane.getAllByText('npm test').some((command) => command.closest('pre') !== null)).toBe(true);
    });
    expect(pane.getByRole('button', { name: 'Running a command' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('AC-1, AC-3: the running step’s title shimmers; a call waiting for you and the steps done stay still', async () => {
    server.use(
      sessionHandler(
        makeSession({
          id,
          state: 'needs_you',
          activities: [
            { id: 'step-1', state: 'done', kind: 'edit', files: ['src/a.ts'] },
            { id: 'step-2', state: 'running', kind: 'explore', files: ['src/b.ts'] },
            { id: 'step-3', state: 'running', kind: 'waiting', approvalId: 'ap-1', about: 'command', text: 'npm test' },
          ],
        }),
      ),
    );
    await renderApp({ route });
    const pane = await progress();
    expect(await pane.findByText('Exploring the code')).toHaveClass('motion-safe:shimmer');
    expect(pane.getByText('Waiting for your approval')).not.toHaveClass('motion-safe:shimmer');
    expect(pane.getByText('Edited 1 file')).not.toHaveClass('motion-safe:shimmer');
  });

  it('AC-12, AC-13, AC-15: a done command step with a failure is red, says so, and marks each command; still running, it isn’t', async () => {
    const calls = [
      { id: 't1', failed: false },
      { id: 't2', failed: true },
      { id: 't3', failed: false },
    ];
    const commands = ['npm install', 'npm test', 'npm run lint'];
    server.use(
      sessionHandler(
        makeSession({
          id,
          state: 'done',
          activities: [
            { id: 'step-1', state: 'done', kind: 'command', commands, calls },
            { id: 'step-2', state: 'done', kind: 'refused', access: 'run', reason: 'push', path: 'git push' },
            { id: 'step-3', state: 'done', kind: 'denied', about: 'command', text: 'rm -rf dist' },
            { id: 'step-4', state: 'done', kind: 'stopped' },
            {
              id: 'step-5',
              state: 'running',
              kind: 'command',
              commands: ['npm test'],
              calls: [{ id: 't4', failed: true }],
            },
          ],
        }),
      ),
    );
    const { user } = await renderApp({ route });
    const pane = await progress();
    const [failed, ...rest] = pane.getAllByRole('listitem').filter((row) => row.dataset['slot'] === 'activity-step');
    expect(failed).toHaveTextContent(/^Ran 3 commands, 1 failed, failed/);
    // Refused, denied and stopped keep their plain dot, and the one still running isn't red yet.
    expect(rest.filter((row) => row.textContent.includes(', failed'))).toEqual([]);
    expect(pane.getByText('Running a command')).toHaveClass('motion-safe:shimmer');

    await user.click(pane.getByRole('button', { name: 'Ran 3 commands, 1 failed' }));
    const marks = within(failed ?? document.body)
      .getAllByRole('listitem')
      .map((row) => row.textContent);
    expect(marks).toEqual(['npm install', 'npm test, failed', 'npm run lint']);
  });

  it('AC-14: a session saved before keeps its command steps green and its plan a plain list', async () => {
    server.use(
      sessionHandler(
        makeSession({
          id,
          state: 'done',
          activities: [
            { id: 'step-1', state: 'done', kind: 'plan', items: ['Read the route', 'Add it'] },
            { id: 'step-2', state: 'done', kind: 'command', commands: ['npm test'] },
          ],
        }),
      ),
    );
    const { user } = await renderApp({ route });
    const pane = await progress();
    expect(await pane.findByText('Ran 1 command')).toBeVisible();
    expect(pane.getAllByText(', done')).toHaveLength(2);
    await user.click(pane.getByRole('button', { name: 'Made a plan' }));
    const plan = pane.getByRole('list', { name: 'Made a plan' });
    expect(
      within(plan)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['Read the route', 'Add it']);
  });

  it('AC-16, AC-17: the open plan marks done, in progress and to come, and moves on as Claude ticks one off', async () => {
    const planned = (statuses: ('pending' | 'in_progress' | 'completed')[]): Session =>
      makeSession({
        id,
        state: 'working',
        updatedAt: `2026-10-16T10:00:0${String(statuses.filter((one) => one === 'completed').length)}.000Z`,
        activities: [
          { id: 'step-1', state: 'done', kind: 'plan', items: ['One', 'Two', 'Three', 'Four', 'Five'], statuses },
          { id: 'step-2', state: 'running', kind: 'edit', files: ['src/a.ts'] },
        ],
      });
    server.use(sessionHandler(planned(['completed', 'completed', 'in_progress', 'pending', 'pending'])));
    const { user } = await renderApp({ route });
    const pane = await progress();
    await user.click(pane.getByRole('button', { name: 'Made a plan' }));
    const items = () =>
      within(pane.getByRole('list', { name: 'Made a plan' }))
        .getAllByRole('listitem')
        .map((row) => row.textContent);
    expect(items()).toEqual(['One, done', 'Two, done', 'Three', 'Four, to come', 'Five, to come']);
    expect(pane.getByText('Three')).toHaveClass('motion-safe:shimmer');

    server.use(sessionHandler(planned(['completed', 'completed', 'completed', 'in_progress', 'pending'])));
    act(() => {
      FakeEventSource.latest().emit({ type: 'session.changed', sessionId: id });
    });
    await waitFor(() => {
      expect(items()).toEqual(['One, done', 'Two, done', 'Three, done', 'Four', 'Five, to come']);
    });
    expect(pane.getByText('Four')).toHaveClass('motion-safe:shimmer');
    expect(pane.getByRole('button', { name: 'Made a plan' })).toHaveAttribute('aria-expanded', 'true');
  });
});
