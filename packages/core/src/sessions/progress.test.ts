import { describe, expect, it } from 'vitest';
import {
  addPullRequestStep,
  addStep,
  addWaiting,
  addServerStep,
  addWork,
  changeSteps,
  emptyProgress,
  endProgress,
  removeWaiting,
  replaceStep,
  resumeProgress,
  type ClaudeWork,
  type Progress,
} from './progress.ts';
import type { SessionStep, SessionStepItem } from '@devhub/contracts';

const fold = (works: readonly ClaudeWork[], from: Progress = emptyProgress) => works.reduce(addWork, from);

describe('session progress', () => {
  it('AC-7: starts on Plan with no steps', () => {
    expect(emptyProgress).toEqual({ step: 'plan', activities: [] });
  });

  it('AC-4: groups reads and searches into one step, its files in the order Claude first touched them', () => {
    const progress = fold([
      { kind: 'explore', file: 'src/ContentList.tsx' },
      { kind: 'explore', file: null },
      { kind: 'explore', file: 'src/contentApi.ts' },
      { kind: 'explore', file: 'src/ContentList.tsx' },
    ]);
    expect(progress.activities).toEqual([
      { id: 'step-1', state: 'running', kind: 'explore', files: ['src/ContentList.tsx', 'src/contentApi.ts'] },
    ]);
  });

  it('AC-4: keeps the latest step running, and marks the one before done when another kind of work starts', () => {
    const progress = fold([
      { kind: 'explore', file: 'src/a.ts' },
      { kind: 'plan', items: ['Row selection', 'A toolbar button'] },
      { kind: 'edit', file: 'src/a.ts' },
      { kind: 'edit', file: 'src/b.ts' },
      { kind: 'edit', file: 'src/a.ts' },
    ]);
    expect(progress.activities).toEqual([
      { id: 'step-1', state: 'done', kind: 'explore', files: ['src/a.ts'] },
      { id: 'step-2', state: 'done', kind: 'plan', items: ['Row selection', 'A toolbar button'] },
      { id: 'step-3', state: 'running', kind: 'edit', files: ['src/a.ts', 'src/b.ts'] },
    ]);
  });

  it('AC-4: a later to-do update changes the plan’s items without a new step or ending the current one', () => {
    const progress = fold([
      { kind: 'plan', items: ['One', 'Two'] },
      { kind: 'edit', file: 'src/a.ts' },
      { kind: 'plan', items: ['One', 'Two', 'Three'] },
      { kind: 'edit', file: 'src/b.ts' },
    ]);
    expect(progress.activities).toEqual([
      { id: 'step-1', state: 'done', kind: 'plan', items: ['One', 'Two', 'Three'] },
      { id: 'step-2', state: 'running', kind: 'edit', files: ['src/a.ts', 'src/b.ts'] },
    ]);
  });

  it('AC-4: starts a new group when Claude goes back to reading after editing', () => {
    const progress = fold([
      { kind: 'edit', file: 'src/a.ts' },
      { kind: 'explore', file: 'src/a.test.ts' },
      { kind: 'edit', file: 'src/a.test.ts' },
    ]);
    expect(progress.activities.map((activity) => [activity.kind, activity.state])).toEqual([
      ['edit', 'done'],
      ['explore', 'done'],
      ['edit', 'running'],
    ]);
  });

  it('AC-5, AC-6: shows each refused call as its own finished step', () => {
    const progress = fold([
      { kind: 'explore', file: 'src/a.ts' },
      { kind: 'refused', refusal: { access: 'read', reason: 'outside_worktree', path: '/etc/hosts' } },
      { kind: 'explore', file: 'src/b.ts' },
    ]);
    expect(progress.activities).toEqual([
      { id: 'step-1', state: 'done', kind: 'explore', files: ['src/a.ts'] },
      { id: 'step-2', state: 'done', kind: 'refused', access: 'read', reason: 'outside_worktree', path: '/etc/hosts' },
      { id: 'step-3', state: 'running', kind: 'explore', files: ['src/b.ts'] },
    ]);
  });

  it('AC-8: Finished ends every step, with Claude’s summary', () => {
    const progress = fold([
      { kind: 'edit', file: 'src/a.ts' },
      { kind: 'finished', summary: 'Added a toolbar button.' },
    ]);
    expect(progress.activities).toEqual([
      { id: 'step-1', state: 'done', kind: 'edit', files: ['src/a.ts'] },
      { id: 'step-2', state: 'done', kind: 'finished', summary: 'Added a toolbar button.' },
    ]);
  });
});

describe('the stepper (Q9b)', () => {
  it('AC-7: stays on Plan while Claude reads and plans', () => {
    expect(
      fold([
        { kind: 'explore', file: 'src/a.ts' },
        { kind: 'plan', items: ['One'] },
        { kind: 'refused', refusal: { access: 'read', reason: 'outside_worktree', path: '/etc' } },
      ]).step,
    ).toBe('plan');
  });

  it('AC-7: moves to Build at the first edit', () => {
    expect(
      fold([
        { kind: 'explore', file: 'src/a.ts' },
        { kind: 'edit', file: 'src/a.ts' },
      ]).step,
    ).toBe('build');
  });

  it('AC-7: never moves back to Plan when Claude reads again', () => {
    expect(
      fold([
        { kind: 'edit', file: 'src/a.ts' },
        { kind: 'explore', file: 'src/b.ts' },
      ]).step,
    ).toBe('build');
  });

  it('AC-8: moves to Review when Claude finishes, even with no edit', () => {
    expect(fold([{ kind: 'finished', summary: 'Nothing to change.' }]).step).toBe('review');
    expect(
      fold([
        { kind: 'edit', file: 'a' },
        { kind: 'finished', summary: 'Done.' },
      ]).step,
    ).toBe('review');
  });

  it('AC-7: an edit after Review doesn’t move it back', () => {
    const reviewed = fold([{ kind: 'finished', summary: 'Done.' }]);
    expect(addWork(reviewed, { kind: 'edit', file: 'a' }).step).toBe('review');
  });
});

describe('Orynx’s own steps', () => {
  it('AC-2: shows the worktree running while git works, then done with what it found', () => {
    const making = addStep(
      emptyProgress,
      { kind: 'worktree', branch: 'feat/PROJ-1423', base: 'origin/main', fetched: false },
      'running',
    );
    expect(making.activities).toEqual([
      {
        id: 'step-1',
        state: 'running',
        kind: 'worktree',
        branch: 'feat/PROJ-1423',
        base: 'origin/main',
        fetched: false,
      },
    ]);
    const made = replaceStep(making, 'step-1', {
      kind: 'worktree',
      branch: 'feat/PROJ-1423',
      base: 'origin/main',
      fetched: true,
    });
    expect(made.activities).toEqual([
      { id: 'step-1', state: 'done', kind: 'worktree', branch: 'feat/PROJ-1423', base: 'origin/main', fetched: true },
    ]);
  });

  it('AC-3: a step of Orynx’s ends the running one, and Claude’s work follows it', () => {
    const progress = fold(
      [{ kind: 'explore', file: 'src/a.ts' }],
      addStep(emptyProgress, {
        kind: 'brief',
        key: 'PROJ-1423',
        tickets: [],
        message: false,
        pullRequests: [],
        files: [],
        skills: [],
      }),
    );
    expect(progress.activities).toEqual([
      {
        id: 'step-1',
        state: 'done',
        kind: 'brief',
        key: 'PROJ-1423',
        tickets: [],
        message: false,
        pullRequests: [],
        files: [],
        skills: [],
      },
      { id: 'step-2', state: 'running', kind: 'explore', files: ['src/a.ts'] },
    ]);
  });

  it('AC-9, AC-14: stopping or closing ends every step and keeps the stepper where it was', () => {
    const working = fold([{ kind: 'edit', file: 'src/a.ts' }]);
    for (const kind of ['stopped', 'interrupted'] as const) {
      const ended = endProgress(working, { kind });
      expect(ended.step).toBe('build');
      expect(ended.activities.map((activity) => [activity.kind, activity.state])).toEqual([
        ['edit', 'done'],
        [kind, 'done'],
      ]);
    }
  });

  it('AC-13: ends every step with no new one when the session fails', () => {
    const ended = endProgress(fold([{ kind: 'explore', file: 'a' }]), null);
    expect(ended.activities).toEqual([{ id: 'step-1', state: 'done', kind: 'explore', files: ['a'] }]);
  });
});

describe('commands and approvals (spec 012)', () => {
  const asking = { approvalId: 'ap-1', about: 'command', text: 'Run the content list tests' } as const;

  it('AC-2: groups commands into one step, running until another kind of work starts', () => {
    const progress = fold([
      { kind: 'command', id: 'toolu_1', command: 'npm test' },
      { kind: 'command', id: 'toolu_1', command: 'npm run lint' },
    ]);
    expect(progress.activities).toEqual([
      { id: 'step-1', state: 'running', kind: 'command', commands: ['npm test', 'npm run lint'] },
    ]);
    expect(fold([{ kind: 'explore', file: 'a' }], progress).activities[0]?.state).toBe('done');
  });

  it('AC-17: moves the stepper to Test at the first command after the first edit, and never back', () => {
    expect(fold([{ kind: 'command', id: 'toolu_1', command: 'git log' }]).step).toBe('plan');
    const testing = fold([
      { kind: 'command', id: 'toolu_1', command: 'git log' },
      { kind: 'edit', file: 'src/a.ts' },
      { kind: 'command', id: 'toolu_1', command: 'npm test' },
    ]);
    expect(testing.step).toBe('test');
    expect(fold([{ kind: 'edit', file: 'src/b.ts' }], testing).step).toBe('test');
    expect(fold([{ kind: 'finished', summary: 'Done.' }], testing).step).toBe('review');
  });

  it('AC-1: a call waiting for you is a running step with Claude’s line about it, after what was running', () => {
    const progress = addWaiting(fold([{ kind: 'edit', file: 'src/a.ts' }]), asking);
    expect(progress.activities).toEqual([
      { id: 'step-1', state: 'done', kind: 'edit', files: ['src/a.ts'] },
      { id: 'step-2', state: 'running', kind: 'waiting', ...asking },
    ]);
  });

  it('AC-10: a waiting step keeps running while other calls’ work comes, until its own call is answered', () => {
    const waiting = addWaiting(emptyProgress, asking);
    const second = addWaiting(waiting, { approvalId: 'ap-2', about: 'edit', text: 'src/a.ts' });
    const working = fold([{ kind: 'command', id: 'toolu_1', command: 'npm run lint' }], second);
    expect(working.activities.map((activity) => [activity.kind, activity.state])).toEqual([
      ['waiting', 'running'],
      ['waiting', 'running'],
      ['command', 'running'],
    ]);

    const answered = removeWaiting(working, 'ap-1');
    expect(answered.activities.map((activity) => activity.id)).toEqual(['step-2', 'step-3']);
    // A new step never takes the id of one still shown.
    const next = fold([{ kind: 'denied', about: 'command', text: 'npm test' }], answered);
    expect(next.activities.map((activity) => activity.id)).toEqual(['step-2', 'step-3', 'step-4']);
    expect(removeWaiting(next, 'no-such-call')).toEqual(next);
  });

  it('AC-3, AC-20: a denied call and commands being off are finished steps of their own', () => {
    expect(fold([{ kind: 'no_commands' }, { kind: 'denied', about: 'edit', text: 'src/a.ts' }]).activities).toEqual([
      { id: 'step-1', state: 'done', kind: 'no_commands', reason: 'no_sandbox' },
      { id: 'step-2', state: 'done', kind: 'denied', about: 'edit', text: 'src/a.ts' },
    ]);
  });

  it('AC-12, AC-21: stopping or closing takes away the steps still waiting', () => {
    const waiting = addWaiting(fold([{ kind: 'edit', file: 'src/a.ts' }]), asking);
    for (const last of [{ kind: 'stopped' } as const, { kind: 'interrupted' } as const, null]) {
      expect(endProgress(waiting, last).activities.map((activity) => activity.kind)).toEqual(
        last === null ? ['edit'] : ['edit', last.kind],
      );
    }
  });
});

describe('the pull request (spec 014)', () => {
  const url = 'https://github.com/acme/web-app/pull/2841';
  const finished = fold([
    { kind: 'edit', file: 'src/a.ts' },
    { kind: 'finished', summary: 'Done.' },
  ]);
  const reviewed = { ...finished, step: 'review' as const };

  it('AC-4: opening the pull request is a finished step, and moves the stepper to Pull request', () => {
    const opened = addPullRequestStep(reviewed, {
      kind: 'pull_request',
      number: 2841,
      url,
      files: 4,
      branch: 'feat/PROJ-1423',
      linked: false,
    });
    expect(opened.step).toBe('pull_request');
    expect(opened.activities.at(-1)).toEqual({
      id: 'step-3',
      state: 'done',
      kind: 'pull_request',
      number: 2841,
      url,
      files: 4,
      branch: 'feat/PROJ-1423',
      linked: false,
    });
  });

  it('AC-17: pushing changes after a follow-up moves the stepper back up to Pull request', () => {
    const building = { ...reviewed, step: 'build' as const };
    const pushed = addPullRequestStep(building, { kind: 'pushed', number: 2841, url, files: 2 });
    expect(pushed.step).toBe('pull_request');
    expect(pushed.activities.at(-1)).toMatchObject({ kind: 'pushed', state: 'done', files: 2 });
  });

  it('AC-19: a follow-up once the pull request is open moves the stepper back to Build, as after Review', () => {
    expect(resumeProgress({ ...reviewed, step: 'pull_request' }).step).toBe('build');
    expect(resumeProgress(reviewed).step).toBe('build');
    expect(resumeProgress({ ...reviewed, step: 'test' }).step).toBe('test');
  });
});

describe('steps passed over (spec 031, Q5)', () => {
  const edit: ClaudeWork = { kind: 'edit', file: 'src/a.ts' };
  const finished: ClaudeWork = { kind: 'finished', summary: 'Done.' };

  it('AC-11: finishing from Build skips Test', () => {
    expect(fold([edit, finished])).toMatchObject({ step: 'review', skipped: ['test'] });
  });

  it('finishing with no edit skips Build and Test', () => {
    expect(fold([{ kind: 'explore', file: 'src/a.ts' }, finished])).toMatchObject({
      step: 'review',
      skipped: ['build', 'test'],
    });
  });

  it('AC-10: finishing after a command, once Claude has edited, skips nothing', () => {
    expect(fold([edit, { kind: 'command', id: 'toolu_1', command: 'pnpm test' }, finished])).toMatchObject({
      step: 'review',
      skipped: [],
    });
  });

  it('AC-13: with commands off, Test is skipped', () => {
    expect(fold([{ kind: 'no_commands' }, edit, finished]).skipped).toEqual(['test']);
  });

  it('AC-12: a follow-up clears them, and a command after an edit then reaches Test', () => {
    const resumed = resumeProgress(fold([edit, finished]));
    expect(resumed).toMatchObject({ step: 'build', skipped: [] });
    const tested = fold([{ kind: 'command', id: 'toolu_1', command: 'pnpm test' }], resumed);
    expect(tested.step).toBe('test');
    expect(addWork(tested, finished)).toMatchObject({ step: 'review', skipped: [] });
  });

  it('AC-23: other steps keep what was skipped', () => {
    const reviewed = fold([edit, finished]);
    expect(addStep(reviewed, { kind: 'stopped' }).skipped).toEqual(['test']);
    expect(endProgress(reviewed, { kind: 'interrupted' }).skipped).toEqual(['test']);
  });
});

describe('Orynx ticket steps (spec 037)', () => {
  it('AC-28, AC-29: each ticket call is a done step of its own that ends the running one, and moves the stepper nowhere', () => {
    const progress = fold([
      { kind: 'explore', file: 'src/date.ts' },
      { kind: 'ticket', done: { action: 'listed' } },
      { kind: 'ticket', done: { action: 'created', key: 'ORX-7', title: 'Flaky date test' } },
      {
        kind: 'ticket',
        done: {
          action: 'updated',
          key: 'ORX-2',
          title: 'Fix the date test',
          fields: ['status', 'priority'],
          status: 'in_review',
        },
      },
    ]);

    expect(progress.step).toBe('plan');
    expect(progress.activities.map(({ id: _, ...step }) => step)).toEqual([
      { kind: 'explore', files: ['src/date.ts'], state: 'done' },
      { kind: 'ticket', action: 'listed', key: null, title: null, fields: [], status: null, state: 'done' },
      {
        kind: 'ticket',
        action: 'created',
        key: 'ORX-7',
        title: 'Flaky date test',
        fields: [],
        status: null,
        state: 'done',
      },
      {
        kind: 'ticket',
        action: 'updated',
        key: 'ORX-2',
        title: 'Fix the date test',
        fields: ['status', 'priority'],
        status: 'in_review',
        state: 'done',
      },
    ]);
  });
});

describe('a session’s own steps (spec 042)', () => {
  const steps = (...list: [SessionStep, string][]) => list.map(([kind, label]) => ({ kind, label }));
  const run = steps(['setup', 'Set up'], ['run', 'Start server']);
  const runThenFix = steps(
    ['setup', 'Set up'],
    ['run', 'Start server'],
    ['build', 'Fix env'],
    ['test', 'Test'],
    ['pull_request', 'Pull request'],
  );
  const own = (list: SessionStepItem[], step: SessionStep = list[0]?.kind ?? 'plan'): Progress => ({
    step,
    steps: list,
    activities: [],
  });

  it('AC-28: an edit moves the stepper to its Build only when the session has one', () => {
    expect(fold([{ kind: 'edit', file: 'a.ts' }], own(run)).step).toBe('setup');
    expect(fold([{ kind: 'edit', file: 'a.ts' }], own(runThenFix)).step).toBe('build');
  });

  it('AC-28: a command before any edit is setting up; after an edit, testing', () => {
    expect(fold([{ kind: 'command', id: 'toolu_1', command: 'pnpm install' }], own(runThenFix, 'setup')).step).toBe(
      'setup',
    );
    expect(
      fold(
        [{ kind: 'command', id: 'toolu_1', command: 'pnpm install' }],
        own(steps(['plan', 'Plan'], ['setup', 'Set up'])),
      ).step,
    ).toBe('setup');
    const after = fold(
      [
        { kind: 'edit', file: 'a.ts' },
        { kind: 'command', id: 'toolu_2', command: 'pnpm test' },
      ],
      own(runThenFix),
    );
    expect(after.step).toBe('test');
  });

  it('AC-2: a port opening moves the stepper to Run; a server ending moves it nowhere', () => {
    const server = { kind: 'server', command: 'next dev', port: 3005 } as const;
    const listening = addServerStep(own(run), { ...server, event: 'started' });
    expect(listening.step).toBe('run');
    expect(listening.activities.at(-1)).toMatchObject({ kind: 'server', event: 'started', state: 'done' });
    expect(addServerStep(own(run), { ...server, event: 'started', port: null }).step).toBe('setup');
    expect(addServerStep(own(run), { ...server, event: 'exited' }).step).toBe('setup');
  });

  it('AC-29: finishing moves to Review or Answer, else to the last step before a pull request, skipping what was passed', () => {
    const finish = (from: Progress) => fold([{ kind: 'finished', summary: 'Done.' }], from);
    expect(finish(own(steps(['answer', 'Answer'])))).toMatchObject({ step: 'answer', skipped: [] });
    expect(finish(own(run, 'run'))).toMatchObject({ step: 'run', skipped: [] });
    expect(finish(own(runThenFix, 'run'))).toMatchObject({ step: 'test', skipped: ['build'] });
  });

  it('AC-24: Claude adds steps after the current one and moves on, with its reason as a step', () => {
    const changed = changeSteps(own(run, 'run'), {
      steps: runThenFix,
      current: 'build',
      reason: 'The server fails on a missing env key.',
    });
    expect(changed.ok && changed.progress.step).toBe('build');
    expect(changed.ok && changed.progress.steps).toEqual(runThenFix);
    expect(changed.ok && changed.progress.activities.at(-1)).toEqual({
      id: 'step-1',
      state: 'done',
      kind: 'steps_changed',
      from: run,
      to: runThenFix,
      reason: 'The server fails on a missing env key.',
    });
  });

  it('AC-24, AC-31: an older session’s five steps can change too, and a follow-up goes back to its Build', () => {
    const changed = changeSteps(
      { step: 'review', activities: [] },
      {
        steps: steps(
          ['plan', 'Plan'],
          ['build', 'Build'],
          ['test', 'Test'],
          ['review', 'Review'],
          ['pull_request', 'x'],
        ),
        current: 'review',
        reason: 'r',
      },
    );
    expect(changed.ok).toBe(true);
    expect(resumeProgress(own(runThenFix, 'test')).step).toBe('test');
    expect(resumeProgress(own(steps(['answer', 'Answer']), 'answer')).step).toBe('answer');
    expect(resumeProgress({ ...own(runThenFix, 'pull_request') }).step).toBe('build');
  });

  it('AC-25, AC-26: refuses a list that breaks a rule, changes a step done or under way, or moves the stepper where Claude may not', () => {
    const from = own(runThenFix, 'build');
    const refusals: [Parameters<typeof changeSteps>[1], string][] = [
      [
        {
          steps: [...runThenFix.slice(0, 4), ...steps(['review', 'Review'], ['answer', 'Answer'])],
          current: 'build',
          reason: '',
        },
        'At most 5 steps, a pull request included.',
      ],
      [
        { steps: steps(['setup', 'Set up'], ['run', 'Serve'], ['build', 'Fix env']), current: 'build', reason: '' },
        'Steps done or under way stay as they are: Set up · Start server · Fix env.',
      ],
      [
        { steps: steps(['setup', 'Set up'], ['run', 'Start server']), current: 'run', reason: '' },
        'Steps done or under way stay as they are: Set up · Start server · Fix env.',
      ],
      [{ steps: runThenFix, current: 'run', reason: '' }, 'The current step can only move forward.'],
      [{ steps: runThenFix, current: 'pull_request', reason: '' }, 'Only you move a pull_request step.'],
      [{ steps: runThenFix, current: 'review', reason: '' }, 'The current step must be one of the steps.'],
    ];
    for (const [change, reason] of refusals) expect(changeSteps(from, change), reason).toEqual({ ok: false, reason });
    expect(changeSteps(own(run), { steps: run, current: 'run', reason: '' })).toEqual({
      ok: false,
      reason: 'Only Orynx moves a run step, once a port opens.',
    });
  });

  it('AC-31: opening a pull request adds its step when the session had none, if there’s room', () => {
    const pulled = {
      kind: 'pull_request',
      number: 7,
      url: 'https://github.com/o/r/pull/7',
      files: 1,
      branch: 'fix/x',
      linked: false,
    } as const;
    const opened = addPullRequestStep(own(steps(['build', 'Fix it'])), pulled);
    expect(opened.steps).toEqual(steps(['build', 'Fix it'], ['pull_request', 'Pull request']));
    expect(opened.step).toBe('pull_request');
  });
});
