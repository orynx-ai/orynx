import { describe, expect, it } from 'vitest';
import {
  addPullRequestStep,
  addStep,
  addWaiting,
  addWork,
  emptyProgress,
  endProgress,
  removeWaiting,
  replaceStep,
  resumeProgress,
  type ClaudeWork,
  type Progress,
} from './progress.ts';

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
      { kind: 'command', command: 'npm test' },
      { kind: 'command', command: 'npm run lint' },
    ]);
    expect(progress.activities).toEqual([
      { id: 'step-1', state: 'running', kind: 'command', commands: ['npm test', 'npm run lint'] },
    ]);
    expect(fold([{ kind: 'explore', file: 'a' }], progress).activities[0]?.state).toBe('done');
  });

  it('AC-17: moves the stepper to Test at the first command after the first edit, and never back', () => {
    expect(fold([{ kind: 'command', command: 'git log' }]).step).toBe('plan');
    const testing = fold([
      { kind: 'command', command: 'git log' },
      { kind: 'edit', file: 'src/a.ts' },
      { kind: 'command', command: 'npm test' },
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
    const working = fold([{ kind: 'command', command: 'npm run lint' }], second);
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
