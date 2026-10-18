import { describe, expect, it } from 'vitest';
import {
  addStep,
  addWork,
  emptyProgress,
  endProgress,
  replaceStep,
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
      addStep(emptyProgress, { kind: 'brief', key: 'PROJ-1423' }),
    );
    expect(progress.activities).toEqual([
      { id: 'step-1', state: 'done', kind: 'brief', key: 'PROJ-1423' },
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
