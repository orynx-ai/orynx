import { describe, expect, it } from 'vitest';
import { pullsWithNewThreads } from './pull-changes.ts';

const pull = {
  id: 'acme/web-app#2841',
  repository: 'web-app',
  number: 2841,
  title: 'Add bulk archive',
  url: 'https://github.com/acme/web-app/pull/2841',
  author: 'Neha',
  mine: true,
  openedAt: '2026-11-09T10:00:00.000Z',
  reviewRequestedAt: null,
  checksFailedAt: null,
  unresolved: { count: 1, since: '2026-11-09T15:00:00.000Z' },
};

describe('pull requests whose review threads changed between syncs (spec 057, AC-24)', () => {
  it('names one whose open threads changed, came or went', () => {
    const more = { ...pull, unresolved: { count: 2, since: '2026-11-09T15:00:00.000Z' } };
    expect(pullsWithNewThreads([pull], [more])).toEqual(['acme/web-app#2841']);
    expect(pullsWithNewThreads([pull], [{ ...pull, unresolved: null }])).toEqual(['acme/web-app#2841']);
    expect(pullsWithNewThreads([{ ...pull, unresolved: null }], [pull])).toEqual(['acme/web-app#2841']);
  });

  it('names none on the first sync, when nothing changed, or for a record that isn’t a pull request', () => {
    expect(pullsWithNewThreads(null, [pull])).toEqual([]);
    expect(pullsWithNewThreads([pull], [{ ...pull, title: 'Renamed' }])).toEqual([]);
    expect(pullsWithNewThreads([{ key: 'PROJ-1' }], [{ key: 'PROJ-1' }])).toEqual([]);
  });
});
