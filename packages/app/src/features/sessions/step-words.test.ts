import { describe, expect, it } from 'vitest';
import type { SessionActivity } from '@devhub/contracts';
import { makeSession } from '@devhub/contracts/testing';
import { problemWords, stepWords } from './step-words.ts';

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
const step = (activity: WithoutId<SessionActivity>) => stepWords({ id: 'step-1', ...activity });

describe('stepWords (Q10a)', () => {
  it('AC-2: the worktree, while git works and once made', () => {
    const worktree = { kind: 'worktree', branch: 'feat/PROJ-1423', base: 'origin/main', fetched: true } as const;
    expect(step({ ...worktree, state: 'running', fetched: false })).toEqual({
      title: 'Making a worktree',
      detail: 'feat/PROJ-1423 from origin/main',
    });
    expect(step({ ...worktree, state: 'done' })).toEqual({
      title: 'Made a worktree',
      detail: 'feat/PROJ-1423 from origin/main',
    });
  });

  it('AC-2 (Q1a): says the base was the last fetched one when origin couldn’t be reached', () => {
    expect(
      step({ kind: 'worktree', state: 'done', branch: 'feat/PROJ-1423', base: 'origin/main', fetched: false }).detail,
    ).toBe('feat/PROJ-1423 from origin/main (last fetched, offline)');
    // A local branch is never fetched, so it says nothing about it.
    expect(
      step({ kind: 'worktree', state: 'done', branch: 'feat/PROJ-1423', base: 'main', fetched: false }).detail,
    ).toBe('feat/PROJ-1423 from main');
  });

  it('AC-3: the brief', () => {
    expect(step({ kind: 'brief', state: 'done', key: 'PROJ-1423' })).toEqual({
      title: 'Sent Claude the brief',
      detail: 'PROJ-1423 and its description',
    });
  });

  it('AC-4: explore, in the present tense while running, with the files’ own names', () => {
    const files = ['src/content/ContentList.tsx', 'src/api/contentApi.ts', 'src/hooks/useSelection.ts'];
    expect(step({ kind: 'explore', state: 'running', files })).toEqual({
      title: 'Exploring the code',
      detail: 'ContentList.tsx, contentApi.ts and useSelection.ts',
    });
    const nine = [...files, 'a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'];
    expect(step({ kind: 'explore', state: 'done', files: nine })).toEqual({
      title: 'Explored the code',
      detail: 'ContentList.tsx, contentApi.ts, useSelection.ts and 6 more',
    });
    expect(step({ kind: 'explore', state: 'done', files: [] }).detail).toBeNull();
  });

  it('AC-4: the plan, with its first items', () => {
    expect(step({ kind: 'plan', state: 'running', items: ['Row selection', 'A bulkArchive API call'] })).toEqual({
      title: 'Making a plan',
      detail: 'Row selection and A bulkArchive API call',
    });
    expect(step({ kind: 'plan', state: 'done', items: ['One', 'Two', 'Three', 'Four'] })).toEqual({
      title: 'Made a plan',
      detail: 'One, Two, Three and 1 more',
    });
  });

  it('AC-4: edits, counted', () => {
    expect(step({ kind: 'edit', state: 'running', files: ['src/a.ts'] })).toEqual({
      title: 'Editing files',
      detail: 'a.ts',
    });
    expect(step({ kind: 'edit', state: 'done', files: ['src/a.ts'] }).title).toBe('Edited 1 file');
    expect(step({ kind: 'edit', state: 'done', files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] })).toEqual({
      title: 'Edited 4 files',
      detail: 'a.ts, b.ts, c.ts and 1 more',
    });
  });

  it('AC-5, AC-6: a refused call, with its path', () => {
    expect(
      step({ kind: 'refused', state: 'done', access: 'edit', reason: 'outside_worktree', path: '/etc/hosts' }),
    ).toEqual({
      title: "Couldn't edit outside the worktree",
      detail: '/etc/hosts',
    });
    expect(
      step({ kind: 'refused', state: 'done', access: 'read', reason: 'outside_worktree', path: '/etc/hosts' }).title,
    ).toBe("Couldn't read outside the worktree");
    expect(
      step({ kind: 'refused', state: 'done', access: 'edit', reason: 'ask_everything', path: 'src/a.ts' }),
    ).toEqual({
      title: "Couldn't edit files: Ask before everything is on",
      detail: 'src/a.ts',
    });
  });

  it('AC-8, AC-9, AC-10, AC-14: how a session ended', () => {
    expect(step({ kind: 'finished', state: 'done', summary: 'Added a toolbar button.' })).toEqual({
      title: 'Finished',
      detail: 'Added a toolbar button.',
    });
    expect(step({ kind: 'stopped', state: 'done' })).toEqual({
      title: 'You stopped Claude',
      detail: 'The worktree keeps the changes.',
    });
    expect(step({ kind: 'interrupted', state: 'done' })).toEqual({
      title: 'Orynx closed while Claude was working',
      detail: 'The worktree keeps the changes.',
    });
    expect(step({ kind: 'discarded', state: 'done', branch: 'feat/PROJ-1423' })).toEqual({
      title: 'Discarded the changes',
      detail: 'The worktree and feat/PROJ-1423 are deleted.',
    });
  });
});

describe('problemWords (Q10f)', () => {
  const session = makeSession({ folder: { name: 'web-app', displayPath: '~/code/web-app' } });

  it("AC-13: says Claude couldn't start before it worked, and stopped with an error after", () => {
    expect(problemWords({ kind: 'login', stage: 'starting' }, session).title).toBe("Claude couldn't start");
    expect(problemWords({ kind: 'limit', stage: 'working' }, session).title).toBe('Claude stopped with an error');
  });

  it.each([
    ['jira', "Orynx couldn't read PROJ-1423 from Jira. Check Settings › Connections, then start again."],
    ['folder', "~/code/web-app isn't a git repository any more. Check Settings › Repositories."],
    ['git', "git couldn't make the worktree. See the terminal for details."],
    ['login', "Claude Code's login didn't work. Sign in with `claude` in a terminal, then start again."],
    ['limit', "Claude's service is busy or your usage limit is reached. Try again later."],
    ['other', 'See the terminal for details.'],
  ] as const)('AC-13: says what to do about %s', (kind, line) => {
    expect(problemWords({ kind, stage: 'starting' }, session).line).toBe(line);
  });
});
