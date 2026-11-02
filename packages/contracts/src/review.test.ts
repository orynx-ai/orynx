import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  mostReviewTextCharacters,
  PostReviewAnswerSchema,
  PostReviewRequestSchema,
  ReviewCommentChangeSchema,
  ReviewStatusSchema,
} from './index.ts';

describe('changing a review comment (spec 050)', () => {
  it('AC-12: takes Keep, new text, or both', () => {
    expect(ReviewCommentChangeSchema.parse({ keep: false })).toEqual({ keep: false });
    expect(ReviewCommentChangeSchema.parse({ text: '  Handle the error.  ' })).toEqual({ text: 'Handle the error.' });
    expect(ReviewCommentChangeSchema.parse({ keep: true, text: 'Handle it.' })).toEqual({
      keep: true,
      text: 'Handle it.',
    });
  });

  it('AC-12: refuses nothing to change, empty text, and text past GitHub’s limit', () => {
    for (const change of [{}, { text: '   ' }, { text: 'x'.repeat(mostReviewTextCharacters + 1) }]) {
      expect(ReviewCommentChangeSchema.safeParse(change).success).toBe(false);
    }
  });
});

describe('the review’s status (spec 050)', () => {
  it('AC-18: says how many commits the author pushed since Claude read the pull request', () => {
    expect(ReviewStatusSchema.parse({ result: 'ready', pushed: 2 })).toEqual({ result: 'ready', pushed: 2 });
    expect(ReviewStatusSchema.safeParse({ result: 'ready', pushed: -1 }).success).toBe(false);
    expect(ReviewStatusSchema.parse({ result: 'failed', problem: { kind: 'github_unreachable' } })).toMatchObject({
      result: 'failed',
    });
  });
});

describe('posting a review (spec 050)', () => {
  it('AC-16: takes the summary and your verdict', () => {
    expect(PostReviewRequestSchema.parse({ summary: ' Two bugs. ', verdict: 'request_changes' })).toEqual({
      summary: 'Two bugs.',
      verdict: 'request_changes',
    });
    expect(PostReviewRequestSchema.parse({ summary: '', verdict: 'approve' })).toEqual({
      summary: '',
      verdict: 'approve',
    });
  });

  it('AC-15: Comment and Request changes need a summary, as GitHub says', () => {
    for (const verdict of ['comment', 'request_changes'] as const) {
      const parsed = PostReviewRequestSchema.safeParse({ summary: '  ', verdict });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]).toMatchObject({
        path: ['summary'],
        message: 'Write a summary to comment or request changes.',
      });
    }
    expect(PostReviewRequestSchema.safeParse({ summary: 'ok', verdict: 'merge' }).success).toBe(false);
  });

  it('AC-16, AC-19, AC-20: answers with the posted review’s link, why it can’t, or GitHub’s problem', () => {
    const url = 'https://github.com/acme/web-app/pull/2841#pullrequestreview-1';
    expect(PostReviewAnswerSchema.parse({ result: 'posted', url, comments: 7 })).toEqual({
      result: 'posted',
      url,
      comments: 7,
    });
    for (const reason of ['not_review', 'not_connected'] as const) {
      expect(PostReviewAnswerSchema.parse({ result: 'cannot', reason })).toEqual({ result: 'cannot', reason });
    }
    for (const problem of [
      { kind: 'github_forbidden' },
      { kind: 'github_sso', url: 'https://github.com/orgs/acme/sso' },
      { kind: 'rate_limited', resetAt: '2026-11-02T14:05:00.000Z' },
      { kind: 'github_unreachable' },
      { kind: 'github_said', message: 'Line could not be resolved' },
    ]) {
      expect(PostReviewAnswerSchema.parse({ result: 'failed', problem })).toEqual({ result: 'failed', problem });
    }
    expect(
      PostReviewAnswerSchema.safeParse({ result: 'posted', url: 'https://evil.example/review', comments: 1 }).success,
    ).toBe(false);
  });

  it('has its paths under the session', () => {
    expect(apiRoutes.sessionReview).toBe('/api/sessions/:id/review');
    expect(apiRoutes.sessionReviewStatus).toBe('/api/sessions/:id/review/status');
    expect(apiRoutes.sessionReviewComment).toBe('/api/sessions/:id/review/comments/:commentId');
  });
});
