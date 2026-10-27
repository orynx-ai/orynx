import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { FakeIntersectionObserver } from '../../../test/fake-intersection-observer.ts';
import { server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { followUpBox } from '../follow-up-words.ts';

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
  return within(await screen.findByRole('region', { name: 'What agent did' }));
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

  it('lays out Claude’s summary as Markdown: headings, bold and code, not the raw marks', async () => {
    server.use(
      sessionHandler(
        session({
          state: 'done',
          runStartedAt: null,
          activities: [
            {
              id: 'step-1',
              state: 'done',
              kind: 'finished',
              summary:
                'I’d pick MAI-7091 first.\n\n## Pick: clear cause\n\n**MAI-7091: role button.** See `member-role-menu.tsx:137`.',
            },
          ],
        }),
      ),
    );
    await renderApp({ route });
    const pane = await progress();
    expect(pane.getByRole('heading', { name: 'Pick: clear cause' })).toBeVisible();
    expect(pane.getByText('MAI-7091: role button.').tagName).toBe('STRONG');
    expect(pane.getByText('member-role-menu.tsx:137').tagName).toBe('CODE');
    expect(pane.queryByText(/##|\*\*/)).toBeNull();
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

  it('047 AC-22: once a turn ends, shows its turns and their cost beside the time, and says by keyboard what the cost is', async () => {
    server.use(
      sessionHandler(
        session({ state: 'done', workedMs: 252_000, runStartedAt: null, turns: 38, costUsd: 1.42, activities: [] }),
      ),
    );
    await renderApp({ route });
    const pane = await progress();
    const line = pane.getByText('4 min 12 s · 38 turns · ≈ $1.42');
    expect(line).toBeVisible();

    act(() => {
      line.focus();
    });
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      "Claude's working time, its turns with the model, and what they'd cost at API prices. Your company's Claude plan may bill differently.",
    );
  });

  it('047 AC-22: says 1 turn, and less than a cent as < $0.01', async () => {
    server.use(sessionHandler(session({ workedMs: 42_000, runStartedAt: null, turns: 1, costUsd: 0.004 })));
    await renderApp({ route });
    expect((await progress()).getByText('42 s · 1 turn · < $0.01')).toBeVisible();
  });

  it('047 AC-24: a session from before, or in its first turn, shows the time only and nothing to focus', async () => {
    server.use(sessionHandler(session({ workedMs: 60_000, runStartedAt: null })));
    await renderApp({ route });
    const time = (await progress()).getByText('1 min 0 s');
    expect(time).toHaveTextContent(/^1 min 0 s$/);
    expect(time).not.toHaveAttribute('tabindex');
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

  it('Full screen shows the steps and the follow-up box in a dialog that fills the window (the user’s call, 27 Oct 2026)', async () => {
    server.use(sessionHandler(session({ state: 'done', runStartedAt: null })));
    const { user } = await renderApp({ route });
    const pane = await progress();
    const button = pane.getByRole('button', { name: 'Full screen' });

    await user.click(button);
    const full = await screen.findByRole('dialog', { name: 'What agent did' });
    expect(within(full).getAllByRole('listitem')).toHaveLength(4);
    expect(within(full).getByRole('textbox', { name: followUpBox.label })).toBeVisible();
    // The steps show in one place at a time.
    expect(pane.queryAllByRole('listitem', { hidden: true })).toHaveLength(0);
    await expectNoAxeViolations(full);

    await user.click(within(full).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'What agent did' })).toBeNull();
    });
    expect(button).toHaveFocus();
    expect(pane.getAllByRole('listitem')).toHaveLength(4);
  });
});

describe('What agent did, by step (spec 048)', () => {
  const longCommand =
    'cd packages/agent-builder/src; grep -n "uploading" components/avatar-picker.tsx | head -40; cat hooks/use-avatar-upload.tsx';
  /** Stamped with its step and the minute it started, from 09:56 (spec 048). */
  const at = (step: 'plan' | 'build' | 'test', minute: number) =>
    ({ step, at: `2026-10-16T09:${String(minute).padStart(2, '0')}:00.000Z` }) as const;
  const grouped = (overrides: Partial<Session> = {}) =>
    session({
      step: 'test',
      steps: [
        { kind: 'plan', label: 'Read comments' },
        { kind: 'build', label: 'Apply fixes' },
        { kind: 'test', label: 'Run tests' },
        { kind: 'pull_request', label: 'Push' },
      ],
      activities: [
        {
          id: 'step-1',
          state: 'done',
          kind: 'worktree',
          branch: null,
          base: 'origin/main',
          fetched: true,
          ...at('plan', 56),
        },
        { id: 'step-2', state: 'done', kind: 'explore', files: ['src/ContentList.tsx'], ...at('plan', 56) },
        { id: 'step-3', state: 'done', kind: 'edit', files: ['src/ContentList.tsx'], ...at('build', 57) },
        { id: 'step-4', state: 'running', kind: 'command', commands: ['npm test', longCommand], ...at('test', 59) },
      ],
      ...overrides,
    });

  it('AC-10, AC-11: shows each started step as a row with its time, the current one open, and opens the others in place', async () => {
    server.use(sessionHandler(grouped()));
    const { user } = await renderApp({ route });
    const pane = await progress();

    const read = pane.getByRole('button', { name: /^Read comments, done/ });
    const fixes = pane.getByRole('button', { name: /^Apply fixes, done/ });
    const tests = pane.getByRole('button', { name: /^Run tests/ });
    expect(read).toHaveTextContent('1 min');
    expect(fixes).toHaveTextContent('2 min');
    // The step Claude is on has no time yet (Q8), and starts open.
    expect(tests).not.toHaveTextContent(/min/);
    expect([read, fixes, tests].map((row) => row.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'true']);
    // A closed step's rows aren't there; its latest is its summary.
    expect(pane.queryByText('ContentList.tsx')).toBeNull();

    expect(fixes).toHaveTextContent('Edited 1 file');
    await user.click(fixes);
    expect(fixes).toHaveAttribute('aria-expanded', 'true');
    expect(pane.getByText('ContentList.tsx')).toBeVisible();
    // Open, its latest row is right under it, so the row's own summary goes.
    expect(fixes).not.toHaveTextContent('Edited 1 file');
    await user.keyboard('{Enter}');
    expect(fixes).toHaveAttribute('aria-expanded', 'false');
    expect(fixes).toHaveFocus();
  });

  it('AC-12: Expand all opens every step, then reads Collapse all', async () => {
    server.use(sessionHandler(grouped()));
    const { user } = await renderApp({ route });
    const pane = await progress();
    const steps = () => pane.getAllByRole('button', { name: /^(Read comments|Apply fixes|Run tests)/ });
    await user.click(pane.getByRole('button', { name: 'Expand all' }));
    expect(steps().map((row) => row.getAttribute('aria-expanded'))).toEqual(['true', 'true', 'true']);
    await user.click(pane.getByRole('button', { name: 'Collapse all' }));
    expect(steps().map((row) => row.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'false']);
    expect(pane.getByRole('button', { name: 'Expand all' })).toBeVisible();
  });

  it('AC-13: shows each command on one line, and in full on a press', async () => {
    server.use(sessionHandler(grouped()));
    const { user } = await renderApp({ route });
    const pane = await progress();
    const command = pane.getByRole('button', { name: longCommand });
    expect(command).toHaveAttribute('aria-expanded', 'false');
    await user.click(command);
    expect(command).toHaveAttribute('aria-expanded', 'true');
  });

  it('AC-14: a step you opened stays open as Claude goes on', async () => {
    let shown = grouped();
    server.use(sessionHandler(shown));
    const { user } = await renderApp({ route });
    const pane = await progress();
    await user.click(pane.getByRole('button', { name: /^Apply fixes/ }));
    shown = grouped({
      updatedAt: '2026-10-16T10:00:05.000Z',
      activities: [
        ...shown.activities,
        { id: 'step-5', state: 'running', kind: 'explore', files: ['b.ts'], ...at('test', 59) },
      ],
    });
    server.use(sessionHandler(shown));
    act(() => {
      FakeEventSource.latest().emit({ type: 'session.changed', sessionId: id });
    });
    await waitFor(() => {
      expect(pane.getByText('b.ts')).toBeVisible();
    });
    expect(pane.getByRole('button', { name: /^Apply fixes/ })).toHaveAttribute('aria-expanded', 'true');
    expect(pane.getByRole('button', { name: /^Run tests/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('AC-10: after a follow-up, the step Claude is back in is the one open, and the one it works in', async () => {
    const base = grouped();
    server.use(
      sessionHandler(
        grouped({
          step: 'build',
          activities: [
            ...base.activities.map((activity) => ({ ...activity, state: 'done' as const })),
            { id: 'step-5', state: 'done', kind: 'finished', summary: 'Done.', ...at('test', 59) },
            { id: 'step-6', state: 'running', kind: 'message', text: 'Rename it', ...at('build', 59) },
          ],
        }),
      ),
    );
    await renderApp({ route });
    const pane = await progress();
    const fixes = pane.getByRole('button', { name: /^Apply fixes/ });
    expect(fixes).toHaveAttribute('aria-expanded', 'true');
    // Claude works in it, so it isn't done.
    expect(fixes).not.toHaveTextContent(', done');
    expect(pane.getByText('Rename it')).toBeVisible();
    expect(pane.getByRole('button', { name: /^Run tests, done/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('AC-15: a session from before spec 048 keeps the flat list, with no Expand all', async () => {
    server.use(sessionHandler(session()));
    await renderApp({ route });
    const pane = await progress();
    expect(pane.getByText('Editing files')).toBeVisible();
    expect(pane.queryByRole('button', { name: 'Expand all' })).toBeNull();
  });

  it('AC-16: Claude’s summary shows after the steps, in full', async () => {
    const base = grouped();
    server.use(
      sessionHandler(
        grouped({
          state: 'done',
          step: 'test',
          runStartedAt: null,
          endedAt: '2026-10-16T10:00:00.000Z',
          activities: [
            ...base.activities.map((activity) => ({ ...activity, state: 'done' as const })),
            {
              id: 'step-5',
              state: 'done',
              kind: 'finished',
              summary: 'Fixed the **three** comments.',
              ...at('test', 59),
            },
          ],
        }),
      ),
    );
    await renderApp({ route });
    const pane = await progress();
    const summary = pane.getByText('three');
    expect(summary).toBeVisible();
    // After the steps, not inside one.
    expect(summary.closest('[data-slot="activity-group"]')).toBeNull();
  });
});
