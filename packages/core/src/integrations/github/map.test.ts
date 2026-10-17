import { describe, expect, it } from 'vitest';
import { githubLogin, pullNode, type FakePull } from '../../test/fake-github.ts';
import { githubPulls } from './client.ts';
import { PullRequestRecordSchema, githubRecords } from './map.ts';

/** The records for pull requests as GitHub sends them, read the way the client reads them. */
function records({ reviews = [], mine = [] }: { reviews?: readonly FakePull[]; mine?: readonly FakePull[] }) {
  return githubRecords({
    login: githubLogin,
    reviews: githubPulls(reviews.map(pullNode)),
    mine: githubPulls(mine.map(pullNode)),
  });
}

describe('GitHub map', () => {
  it('AC-6: a review request keeps what a row shows, with the time your review was last asked for', () => {
    const [record] = records({
      reviews: [
        {
          number: 2841,
          title: 'Lazy-load the people directory',
          author: { login: 'priya-s', name: 'Priya Sharma' },
          requests: [
            { login: githubLogin, at: '2026-10-14T09:00:00Z' },
            { login: 'someone-else', at: '2026-10-15T09:00:00Z' },
            { login: null, at: '2026-10-15T10:00:00Z' },
            { login: githubLogin, at: '2026-10-15T11:00:00Z' },
          ],
        },
      ],
    });

    expect(record).toEqual({
      id: 'acme/web-app#2841',
      repository: 'web-app',
      number: 2841,
      title: 'Lazy-load the people directory',
      url: 'https://github.com/acme/web-app/pull/2841',
      author: 'Priya Sharma',
      mine: false,
      reviewRequestedAt: '2026-10-15T11:00:00.000Z',
      checksFailedAt: null,
      unresolved: null,
    });
    expect(PullRequestRecordSchema.parse(record)).toEqual(record);
  });

  it('AC-6: counts from when the pull request was opened when its timeline doesn’t say', () => {
    const [record] = records({ reviews: [{ number: 1, createdAt: '2026-10-12T08:00:00Z' }] });

    expect(record?.reviewRequestedAt).toBe('2026-10-12T08:00:00.000Z');
  });

  it('AC-6: names the author by their GitHub name, else their login, else nobody', () => {
    const kept = records({
      reviews: [
        { number: 1, author: { login: 'arjun-m', name: 'Arjun Mehta' } },
        { number: 2, author: { login: 'dependabot', name: null } },
        { number: 3, author: null },
      ],
    });

    expect(kept.map((record) => record.author)).toEqual(['Arjun Mehta', 'dependabot', null]);
  });

  it('AC-9: your pull request with failing checks, failing since the first failing check finished', () => {
    const [record] = records({
      mine: [
        {
          number: 2836,
          author: { login: githubLogin, name: 'The Octocat' },
          checks: 'FAILURE',
          contexts: [
            { type: 'CheckRun', conclusion: 'SUCCESS', completedAt: '2026-10-16T07:00:00Z' },
            { type: 'CheckRun', conclusion: 'FAILURE', completedAt: '2026-10-16T09:30:00Z' },
            { type: 'StatusContext', state: 'ERROR', createdAt: '2026-10-16T09:10:00Z' },
            { type: 'CheckRun', conclusion: 'TIMED_OUT', completedAt: '2026-10-16T09:40:00Z' },
          ],
        },
      ],
    });

    expect(record).toMatchObject({ mine: true, checksFailedAt: '2026-10-16T09:10:00.000Z', unresolved: null });
  });

  it('AC-9: checks that pass, are still running or don’t exist aren’t failing', () => {
    expect(
      records({
        mine: [
          { number: 1, checks: 'SUCCESS' },
          { number: 2, checks: 'PENDING' },
          { number: 3, checks: null },
        ],
      }),
    ).toEqual([]);
  });

  it('AC-9: failing checks with no time of their own count from the latest commit, else from when the pull request opened', () => {
    const [fromCommit] = records({
      mine: [{ number: 1, checks: 'ERROR', createdAt: '2026-09-20T08:00:00Z', committedAt: '2026-10-16T08:00:00Z' }],
    });
    const [fromOpening] = records({ mine: [{ number: 2, checks: 'ERROR', createdAt: '2026-10-11T08:00:00Z' }] });

    expect(fromCommit?.checksFailedAt).toBe('2026-10-16T08:00:00.000Z');
    expect(fromOpening?.checksFailedAt).toBe('2026-10-11T08:00:00.000Z');
  });

  it('AC-10: counts unresolved threads whose last comment isn’t yours, since the oldest of those comments', () => {
    const [record] = records({
      mine: [
        {
          number: 2836,
          threads: [
            { resolved: false, lastBy: 'priya-s', at: '2026-10-16T10:00:00Z' },
            { resolved: false, lastBy: 'arjun-m', at: '2026-10-15T10:00:00Z' },
            { resolved: false, lastBy: githubLogin, at: '2026-10-14T10:00:00Z' },
            { resolved: false, lastBy: 'OctoCat', at: '2026-10-13T10:00:00Z' },
            { resolved: true, lastBy: 'priya-s', at: '2026-10-12T10:00:00Z' },
            { resolved: false, lastBy: null, at: '2026-10-16T12:00:00Z' },
          ],
        },
      ],
    });

    expect(record?.unresolved).toEqual({ count: 3, since: '2026-10-15T10:00:00.000Z' });
  });

  it('keeps nothing about your pull requests that need nothing from you', () => {
    expect(
      records({
        mine: [
          { number: 1, checks: 'SUCCESS', threads: [{ resolved: true, lastBy: 'a', at: '2026-10-12T10:00:00Z' }] },
        ],
      }),
    ).toEqual([]);
  });

  it('keeps no pull request whose link points anywhere but github.com', () => {
    const pull = pullNode({ number: 9, requests: [{ login: githubLogin, at: '2026-10-14T09:00:00Z' }] });

    expect(
      githubRecords({
        login: githubLogin,
        reviews: githubPulls([{ ...pull, url: 'https://github.com@evil.example/acme/web-app/pull/9' }]),
        mine: [],
      }),
    ).toEqual([]);
  });
});
