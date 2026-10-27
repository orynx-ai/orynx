import { describe, expect, it } from 'vitest';
import type { SessionActivity, SessionStep } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { groupsOf, stepTimeText } from './activity-groups.ts';

const steps = [
  { kind: 'plan', label: 'Read comments' },
  { kind: 'build', label: 'Apply fixes' },
  { kind: 'test', label: 'Run tests' },
  { kind: 'pull_request', label: 'Push' },
] as const;

/** An activity stamped with its step and the minute (and second) it started on 27 Oct 2026, from 10:00. */
function at(step: SessionStep, minute: number, second = 0) {
  const time = new Date(Date.UTC(2026, 9, 27, 10, minute, second)).toISOString();
  return { step, at: time };
}

const reviewSession = makeSession({
  state: 'done',
  step: 'pull_request',
  steps: [...steps],
  endedAt: new Date(Date.UTC(2026, 9, 27, 10, 25)).toISOString(),
  activities: [
    { id: 'a1', state: 'done', kind: 'worktree', branch: null, base: 'origin/main', fetched: true, ...at('plan', 0) },
    { id: 'a2', state: 'done', kind: 'explore', files: ['src/a.ts'], ...at('plan', 0, 30) },
    { id: 'a3', state: 'done', kind: 'edit', files: ['src/a.ts'], ...at('build', 1) },
    { id: 'a4', state: 'done', kind: 'command', commands: ['npm test'], ...at('test', 19) },
    { id: 'a5', state: 'done', kind: 'finished', summary: 'Fixed the 3 comments.', ...at('test', 25) },
  ],
});

const ids = (activities: readonly SessionActivity[]) => activities.map((activity) => activity.id);

describe('What Claude did, by step (spec 048)', () => {
  it('AC-10: groups the activities under the steps that started, in the stepper’s order, each with how long it took', () => {
    const groups = groupsOf(reviewSession);
    expect(groups?.map((group) => [group.step.label, ids(group.activities), group.ms])).toEqual([
      ['Read comments', ['a1', 'a2'], 60_000],
      ['Apply fixes', ['a3'], 18 * 60_000],
      ['Run tests', ['a4'], 6 * 60_000],
    ]);
  });

  it('AC-16: leaves Claude’s finish out of the groups, so its summary shows after them', () => {
    expect(groupsOf(reviewSession)?.flatMap((group) => ids(group.activities))).not.toContain('a5');
  });

  it('Q8: a step that goes on has no time yet', () => {
    const working = makeSession({
      ...reviewSession,
      state: 'working',
      step: 'test',
      endedAt: null,
      activities: reviewSession.activities.slice(0, 4),
    });
    expect(groupsOf(working)?.map((group) => group.ms)).toEqual([60_000, 18 * 60_000, null]);
  });

  it('counts a follow-up’s work in its step, but not the wait for it after Claude finished', () => {
    const followed = makeSession({
      ...reviewSession,
      endedAt: new Date(Date.UTC(2026, 9, 27, 11, 15)).toISOString(),
      activities: [
        ...reviewSession.activities,
        { id: 'a6', state: 'done', kind: 'message', text: 'Rename it', ...at('build', 70) },
        { id: 'a7', state: 'done', kind: 'edit', files: ['src/b.ts'], ...at('build', 71) },
        { id: 'a8', state: 'done', kind: 'finished', summary: 'Renamed it.', ...at('test', 75) },
      ],
    });
    const build = groupsOf(followed)?.find((group) => group.step.kind === 'build');
    expect(build && ids(build.activities)).toEqual(['a3', 'a6', 'a7']);
    expect(build?.ms).toBe(18 * 60_000 + 60_000 + 4 * 60_000);
  });

  it('puts an activity whose step the session doesn’t have with the step before it', () => {
    const changed = makeSession({
      ...reviewSession,
      steps: [steps[1], steps[2]],
      activities: reviewSession.activities.slice(0, 4),
    });
    expect(groupsOf(changed)?.map((group) => [group.step.label, ids(group.activities)])).toEqual([
      ['Apply fixes', ['a1', 'a2', 'a3']],
      ['Run tests', ['a4']],
    ]);
  });

  it('AC-15: is the flat list (null) for a session with a step saved before spec 048, and for an Ask', () => {
    const [first, ...rest] = reviewSession.activities;
    if (first === undefined) throw new Error('the session has activities');
    const { step: _step, at: _at, ...old } = first;
    expect(groupsOf(makeSession({ ...reviewSession, activities: [old, ...rest] }))).toBeNull();
    expect(groupsOf(makeSession({ ...reviewSession, mode: 'ask', steps: [] }))).toBeNull();
    expect(groupsOf(makeSession({ ...reviewSession, activities: [] }))).toBeNull();
  });

  it('Q8: says a step’s time as "< 1 min", whole minutes, then hours and minutes', () => {
    expect(stepTimeText(0)).toBe('< 1 min');
    expect(stepTimeText(59_999)).toBe('< 1 min');
    expect(stepTimeText(60_000)).toBe('1 min');
    expect(stepTimeText(18 * 60_000 + 20_000)).toBe('18 min');
    expect(stepTimeText(65 * 60_000)).toBe('1 h 5 min');
    expect(stepTimeText(120 * 60_000)).toBe('2 h');
  });
});
