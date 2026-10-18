import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const route = `/sessions/${id}`;
// 4 min 12 s after the session started.
const now = new Date('2026-10-16T10:00:12.000Z');

function session(overrides: Partial<Session> = {}): Session {
  return makeSession({
    id,
    title: 'Add bulk archive to the content list',
    state: 'working',
    step: 'build',
    startedAt: '2026-10-16T09:56:00.000Z',
    activities: [
      { id: 'step-1', state: 'done', kind: 'worktree', branch: 'feat/PROJ-1423', base: 'origin/main', fetched: true },
      { id: 'step-2', state: 'done', kind: 'brief', key: 'PROJ-1423' },
      {
        id: 'step-3',
        state: 'done',
        kind: 'explore',
        files: ['src/ContentList.tsx', 'src/contentApi.ts', 'src/useSelection.ts', 'a.ts'],
      },
      { id: 'step-4', state: 'running', kind: 'edit', files: ['src/ContentList.tsx'] },
    ],
    ...overrides,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now });
});
afterEach(() => {
  vi.useRealTimers();
});

async function progress() {
  return within(await screen.findByRole('region', { name: "Claude's progress" }));
}

describe('SessionProgress', () => {
  it('AC-7: the stepper shows Plan done and Build as the current step', async () => {
    server.use(sessionHandler(session()));
    await renderApp({ route });

    const stepper = await screen.findByRole('list', { name: 'Session progress' });
    const steps = within(stepper).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Plan, done',
      '2Build',
      '3Test',
      '4Review',
      '5Pull request',
    ]);
    expect(within(stepper).getByText('Build').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('AC-4: lists Claude’s steps in their words, the latest still running, and the time it has worked', async () => {
    server.use(sessionHandler(session()));
    await renderApp({ route });
    const pane = await progress();

    const items = within(pane.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Made a worktree, donefeat/PROJ-1423 from origin/main',
      'Sent Claude the brief, donePROJ-1423 and its description',
      'Explored the code, doneContentList.tsx, contentApi.ts, useSelection.ts and 1 more',
      'Editing filesContentList.tsx',
    ]);
    expect(pane.getByRole('list')).toHaveAttribute('aria-live', 'polite');
    expect(pane.getByText('4 min 12 s')).toBeVisible();
  });

  it('012 AC-1, AC-10: a call waiting for you is a step in the amber look, with Claude’s line about it', async () => {
    server.use(
      sessionHandler(
        session({
          state: 'needs_you',
          step: 'test',
          activities: [
            { id: 'step-1', state: 'done', kind: 'edit', files: ['src/ContentList.tsx'] },
            {
              id: 'step-2',
              state: 'running',
              kind: 'waiting',
              approvalId: 'approval-1',
              about: 'command',
              text: 'Run the content list tests',
            },
          ],
        }),
      ),
    );
    await renderApp({ route });
    const pane = await progress();
    const items = within(pane.getByRole('list')).getAllByRole('listitem');
    expect(items.at(-1)?.textContent).toBe('Waiting for your approval, needs youRun the content list tests');
  });

  it('012 AC-17: the stepper shows Test once Claude runs a command after building', async () => {
    server.use(sessionHandler(session({ step: 'test' })));
    await renderApp({ route });
    const stepper = await screen.findByRole('list', { name: 'Session progress' });
    expect(within(stepper).getByText('Test').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(
      within(stepper)
        .getAllByRole('listitem')
        .map((step) => step.textContent),
    ).toEqual(['Plan, done', 'Build, done', '3Test', '4Review', '5Pull request']);
  });

  it('AC-8: a finished session shows Claude’s summary and how long it worked, the time stopped', async () => {
    server.use(
      sessionHandler(
        session({
          state: 'done',
          step: 'review',
          endedAt: '2026-10-16T09:59:30.000Z',
          activities: [{ id: 'step-1', state: 'done', kind: 'finished', summary: 'Added an Archive selected button.' }],
        }),
      ),
    );
    await renderApp({ route });
    const pane = await progress();
    expect(pane.getByText('Finished')).toBeVisible();
    expect(pane.getByText('Added an Archive selected button.')).toBeVisible();
    expect(pane.getByText('3 min 30 s')).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Session progress' }))
        .getByText('Review')
        .closest('li'),
    ).toHaveAttribute('aria-current', 'step');
  });

  it('AC-13 (Q10f): a session that couldn’t start says why at the top, with the command as code', async () => {
    server.use(
      sessionHandler(
        session({
          state: 'stopped',
          problem: { kind: 'login', stage: 'starting' },
          activities: [
            {
              id: 'step-1',
              state: 'done',
              kind: 'worktree',
              branch: 'feat/PROJ-1423',
              base: 'origin/main',
              fetched: true,
            },
          ],
        }),
      ),
    );
    await renderApp({ route });
    const pane = await progress();

    const alert = pane.getByRole('alert');
    expect(alert).toHaveTextContent("Claude couldn't start");
    expect(alert).toHaveTextContent(
      "Claude Code's login didn't work. Sign in with claude in a terminal, then start again.",
    );
    expect(within(alert).getByText('claude').tagName).toBe('CODE');
    expect(pane.getByText('Made a worktree')).toBeVisible();
  });

  it('AC-13: once Claude was working, it says Claude stopped with an error', async () => {
    server.use(sessionHandler(session({ state: 'stopped', problem: { kind: 'limit', stage: 'working' } })));
    await renderApp({ route });
    const alert = (await progress()).getByRole('alert');
    expect(alert).toHaveTextContent('Claude stopped with an error');
    expect(alert).toHaveTextContent("Claude's service is busy or your usage limit is reached. Try again later.");
  });

  it('AC-14: a session Orynx closed on says so', async () => {
    server.use(
      sessionHandler(
        session({
          state: 'stopped',
          endedAt: '2026-10-16T09:58:00.000Z',
          activities: [{ id: 'step-1', state: 'done', kind: 'interrupted' }],
        }),
      ),
    );
    await renderApp({ route });
    const pane = await progress();
    expect(pane.getByText('Orynx closed while Claude was working')).toBeVisible();
    expect(pane.getByText('The worktree keeps the changes.')).toBeVisible();
    expect(pane.queryByRole('alert')).toBeNull();
  });
});
