import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Session } from '@devhub/contracts';
import { makeReviewComment, makeSession, makeSessionReview } from '@devhub/contracts/testing';
import { createGitHubClient } from '../integrations/github/client.ts';
import {
  acceptingCompare,
  acceptingPullStates,
  acceptingReviews,
  githubToken,
  useFakeGitHub,
  type FakePostedReview,
} from '../test/fake-github.ts';
import { createReviews } from './review.ts';
import { createMemorySessionStore, StoredSessionSchema } from './session-store.ts';

const github = useFakeGitHub();
const read = '0123456789abcdef0123456789abcdef01234567';
const id = '0000000000000001';

/** A done review of acme/web-app #2841 read at `read`: c1 kept, c2 dropped, c3 posted already. */
async function setUp({
  connected = true,
  review = {},
}: { connected?: boolean; review?: Partial<Session['review']> } = {}) {
  const records = createMemorySessionStore();
  await records.create(
    StoredSessionSchema.parse({
      session: makeSession({
        id,
        state: 'done',
        mode: 'ask',
        review: makeSessionReview({
          commit: read,
          comments: [
            makeReviewComment({ id: 'c1', path: 'src/a.ts', line: 42, side: 'new', text: 'This drops the error.' }),
            makeReviewComment({ id: 'c2', path: 'src/b.ts', line: 7, text: 'A nit.', keep: false }),
            makeReviewComment({
              id: 'c3',
              path: 'src/c.ts',
              line: 3,
              side: 'old',
              postedAt: '2026-11-01T09:00:00.000Z',
            }),
          ],
          ...review,
        }),
      }),
      repository: null,
      worktree: null,
      startCommit: null,
      claudeSessionId: null,
    }),
  );
  const reviews = createReviews({
    records,
    save: (sessionId, change) => records.update(sessionId, change),
    github: {
      credentials: () =>
        Promise.resolve(
          connected
            ? { ok: true, connection: 'token', token: githubToken }
            : { ok: false, connection: 'token', problem: { kind: 'rejected' } },
        ),
    },
    client: createGitHubClient({ timeoutMs: 300 }),
    now: () => Date.parse('2026-11-02T10:00:00.000Z'),
  });
  const saved = async () => (await records.get(id))?.session.review;
  return { reviews, records, review: saved };
}

describe('changing a review comment (spec 050)', () => {
  it('AC-12: unticks Keep, or saves new text, on a comment not posted yet', async () => {
    const { reviews, review } = await setUp();
    expect(await reviews.changeComment(id, 'c1', { keep: false })).toBe('changed');
    expect(await reviews.changeComment(id, 'c2', { keep: true, text: 'Name it saveDraft.' })).toBe('changed');
    expect((await review())?.comments.slice(0, 2)).toMatchObject([
      { id: 'c1', keep: false, text: 'This drops the error.' },
      { id: 'c2', keep: true, text: 'Name it saveDraft.' },
    ]);
  });

  it('a posted comment stays as it went; a comment or session that isn’t there is not found', async () => {
    const { reviews } = await setUp();
    expect(await reviews.changeComment(id, 'c3', { text: 'Changed my mind.' })).toBe('posted');
    expect(await reviews.changeComment(id, 'c9', { keep: false })).toBe('not_found');
    expect(await reviews.changeComment('0000000000000009', 'c1', { keep: false })).toBe('not_found');
  });
});

describe('the review’s status (spec 050)', () => {
  it('AC-18: counts the commits the author pushed since Claude read the pull request', async () => {
    const { reviews } = await setUp();
    const later = ['c'.repeat(40), 'd'.repeat(40)];
    const states = [{ number: 2841, state: 'open' as const, head: read }];
    github.use(acceptingPullStates(states), acceptingCompare([read, ...later]));
    expect(await reviews.status(id)).toEqual({ result: 'ready', pushed: 0 });
    states[0] = { number: 2841, state: 'open', head: 'd'.repeat(40) };
    expect(await reviews.status(id)).toEqual({ result: 'ready', pushed: 2 });
  });

  it('AC-18: a review from the diff alone never knew its commit, so nothing reads as pushed since', async () => {
    const { reviews } = await setUp({ review: { commit: null } });
    expect(await reviews.status(id)).toEqual({ result: 'ready', pushed: 0 });
  });

  it("AC-20: GitHub's problem, GitHub not connected, or a session that isn't a review", async () => {
    github.use(http.get('https://api.github.com/repos/acme/web-app/pulls/2841', () => HttpResponse.error()));
    expect(await (await setUp()).reviews.status(id)).toEqual({
      result: 'failed',
      problem: { kind: 'github_unreachable' },
    });
    expect(await (await setUp({ connected: false })).reviews.status(id)).toEqual({
      result: 'cannot',
      reason: 'not_connected',
    });
    const { reviews, records } = await setUp();
    await records.update(id, (record) => ({ ...record, session: { ...record.session, review: null } }));
    expect(await reviews.status(id)).toEqual({ result: 'cannot', reason: 'not_review' });
    expect(await reviews.status('0000000000000009')).toBeNull();
  });
});

describe('posting a review (spec 050)', () => {
  it('AC-16: posts one review with the kept comments not posted yet, at the commit Claude read, then marks them posted', async () => {
    const { reviews, review } = await setUp();
    const posted: FakePostedReview[] = [];
    github.use(acceptingReviews({ posted }));

    expect(await reviews.post(id, { summary: 'One bug.', verdict: 'request_changes' })).toEqual({
      result: 'posted',
      url: 'https://github.com/acme/web-app/pull/2841#pullrequestreview-1',
      comments: 1,
    });
    expect(posted).toEqual([
      {
        owner: 'acme',
        repository: 'web-app',
        number: 2841,
        commit_id: read,
        body: 'One bug.',
        event: 'REQUEST_CHANGES',
        comments: [{ path: 'src/a.ts', line: 42, side: 'RIGHT', body: 'This drops the error.' }],
      },
    ]);
    const after = await review();
    expect(after?.comments.map((comment) => [comment.id, comment.postedAt])).toEqual([
      ['c1', '2026-11-02T10:00:00.000Z'],
      ['c2', null],
      ['c3', '2026-11-01T09:00:00.000Z'],
    ]);
    expect(after?.posted).toEqual([
      { url: 'https://github.com/acme/web-app/pull/2841#pullrequestreview-1', at: '2026-11-02T10:00:00.000Z' },
    ]);
  });

  it('AC-21: a second review holds only what the first didn’t; a review from the diff alone goes on the latest commit', async () => {
    const { reviews } = await setUp({ review: { commit: null } });
    const posted: FakePostedReview[] = [];
    github.use(acceptingReviews({ posted }));
    await reviews.post(id, { summary: '', verdict: 'approve' });
    await reviews.post(id, { summary: 'Nothing more.', verdict: 'comment' });

    expect(posted.map((one) => [one.event, one.comments.length, 'commit_id' in one])).toEqual([
      ['APPROVE', 1, false],
      ['COMMENT', 0, false],
    ]);
  });

  it("AC-19: GitHub's refusal comes back in its own words, and nothing is marked posted", async () => {
    const { reviews, review } = await setUp();
    github.use(acceptingReviews({ refuseLines: ['src/a.ts:42'] }));
    expect(await reviews.post(id, { summary: 'One bug.', verdict: 'comment' })).toEqual({
      result: 'failed',
      problem: { kind: 'github_said', message: 'Line could not be resolved' },
    });
    expect((await review())?.comments[0]?.postedAt).toBeNull();
    expect((await review())?.posted).toEqual([]);
  });

  it('AC-20: says why it can’t: GitHub not connected, or not a review', async () => {
    expect(await (await setUp({ connected: false })).reviews.post(id, { summary: 'x', verdict: 'comment' })).toEqual({
      result: 'cannot',
      reason: 'not_connected',
    });
    expect(await (await setUp()).reviews.post('0000000000000009', { summary: 'x', verdict: 'comment' })).toBeNull();
  });
});
