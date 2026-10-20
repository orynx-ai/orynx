import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { FakeIntersectionObserver } from '../../../test/fake-intersection-observer.ts';
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
    // Its first run, from the start (spec 013, Q3).
    runStartedAt: '2026-10-16T09:56:00.000Z',
    activities: [
      { id: 'step-1', state: 'done', kind: 'worktree', branch: 'feat/PROJ-1423', base: 'origin/main', fetched: true },
      {
        id: 'step-2',
        state: 'done',
        kind: 'brief',
        key: 'PROJ-1423',
        tickets: [],
        message: false,
        pullRequests: [],
        files: [],
        skills: [],
      },
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

  it('AC-11 (spec 031): a step Claude finished without reads as skipped', async () => {
    server.use(sessionHandler(session({ state: 'done', step: 'review', skipped: ['test'] })));
    await renderApp({ route });
    const stepper = await screen.findByRole('list', { name: 'Session progress' });
    expect(
      within(stepper)
        .getAllByRole('listitem')
        .map((step) => step.textContent),
    ).toEqual(['Plan, done', 'Build, done', 'Test, skipped', '4Review', '5Pull request']);
  });

  it('AC-14 (spec 031): a session on your pull request’s branch ends with Push, not Pull request', async () => {
    server.use(sessionHandler(session({ workOn: 'pull_request', step: 'pull_request', state: 'pr_open' })));
    await renderApp({ route });
    const stepper = await screen.findByRole('list', { name: 'Session progress' });
    expect(
      within(stepper)
        .getAllByRole('listitem')
        .map((step) => step.textContent),
    ).toEqual(['Plan, done', 'Build, done', 'Test, done', 'Review, done', '5Push']);
  });

  it('AC-8: a finished session shows Claude’s summary and how long it worked, the time stopped', async () => {
    server.use(
      sessionHandler(
        session({
          state: 'done',
          step: 'review',
          endedAt: '2026-10-16T09:59:30.000Z',
          workedMs: 210_000,
          runStartedAt: null,
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

  it('013 Q3: adds the run Claude is on now to the time it worked before, and counts no time between runs', async () => {
    server.use(
      sessionHandler(
        // Worked a minute before you followed up, then started again 12 seconds ago.
        session({ workedMs: 60_000, runStartedAt: '2026-10-16T10:00:00.000Z' }),
      ),
    );
    await renderApp({ route });
    const pane = await progress();
    expect(pane.getByText('1 min 12 s')).toBeVisible();
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

  it('follows new steps while its end is in view; scrolled up, it stays put and Jump to latest takes you back', async () => {
    // jsdom can't scroll; the browser's own scrollIntoView is watched to see where the page is asked to go.
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView');
    let shown = session();
    server.use(sessionHandler(shown));
    const { user } = await renderApp({ route });
    const pane = await progress();
    expect(pane.queryByRole('button', { name: 'Jump to latest' })).toBeNull();
    // Opening the session doesn't move the page.
    expect(scrolled).not.toHaveBeenCalled();

    const step = (n: number, at: string) => {
      shown = session({
        updatedAt: at,
        activities: [
          ...shown.activities,
          { id: `step-${String(n)}`, state: 'running', kind: 'explore', files: ['b.ts'] },
        ],
      });
      server.use(sessionHandler(shown));
      act(() => {
        FakeEventSource.latest().emit({ type: 'session.changed', sessionId: id });
      });
    };
    step(5, '2026-10-16T10:00:01.000Z');
    await waitFor(() => {
      expect(scrolled).toHaveBeenCalledWith({ block: 'end' });
    });

    act(() => {
      FakeIntersectionObserver.scrollOutOfView();
    });
    const jump = await pane.findByRole('button', { name: 'Jump to latest' });
    scrolled.mockClear();
    step(6, '2026-10-16T10:00:02.000Z');
    await waitFor(() => {
      expect(pane.getAllByRole('listitem')).toHaveLength(6);
    });
    expect(scrolled).not.toHaveBeenCalled();

    await user.click(jump);
    // The test window asks for reduced motion, so the jump is instant.
    expect(scrolled).toHaveBeenCalledWith({ block: 'end', behavior: 'auto' });
    act(() => {
      FakeIntersectionObserver.scrollIntoView();
    });
    await waitFor(() => {
      expect(pane.queryByRole('button', { name: 'Jump to latest' })).toBeNull();
    });
  });
});
