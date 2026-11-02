import type {
  PostReviewAnswer,
  PostReviewRequest,
  ReviewCommentChange,
  ReviewStatus,
  ReviewVerdict,
} from '@devhub/contracts';
import type { GitHubClient, GitHubReview } from '../integrations/github/client.ts';
import type { GitHubSyncCredentials } from '../integrations/github/connection.ts';
import { replyProblem, threadsProblem } from './pull-requests.ts';
import type { SessionRecords, StoredSession } from './session-store.ts';

/**
 * A review session's comments and posting (spec 050): you keep, drop or edit Claude's comments, see whether the
 * author pushed since Claude read the pull request, and post one review. Only Post review writes to GitHub.
 */

export interface ReviewsOptions {
  records: Pick<SessionRecords, 'get'>;
  save: (id: string, change: (record: StoredSession) => StoredSession) => Promise<StoredSession | null>;
  /** 004's connection: the token, or why there's none. */
  github: { credentials(): Promise<GitHubSyncCredentials | null> };
  client: Pick<GitHubClient, 'postReview' | 'pullState' | 'commitsBetween'>;
  now: () => number;
}

export interface Reviews {
  /** Keep, drop or edit one comment (AC-12); a posted one stays as it went. */
  changeComment(
    id: string,
    commentId: string,
    change: ReviewCommentChange,
  ): Promise<'changed' | 'posted' | 'not_found'>;
  /** How many commits were pushed since Claude read the pull request (AC-18); null for no such session. */
  status(id: string): Promise<ReviewStatus | null>;
  /** Posts one review with the kept comments not posted yet, on your press only; null for no such session. */
  post(id: string, request: PostReviewRequest): Promise<PostReviewAnswer | null>;
}

const events: Record<ReviewVerdict, GitHubReview['event']> = {
  comment: 'COMMENT',
  approve: 'APPROVE',
  request_changes: 'REQUEST_CHANGES',
};

export function createReviews({ records, save, github, client, now }: ReviewsOptions): Reviews {
  /** Each session's post under way: a second press waits, then posts only what the first didn't (AC-21). */
  const turns = new Map<string, Promise<unknown>>();
  function oneAtATime<T>(id: string, work: () => Promise<T>): Promise<T> {
    const turn = (turns.get(id) ?? Promise.resolve()).then(work);
    turns.set(
      id,
      turn.catch(() => undefined),
    );
    return turn;
  }

  /** The token, or why Orynx can't ask GitHub; null for no such session. */
  async function ready(id: string) {
    const record = await records.get(id);
    if (record === null) return null;
    const { review } = record.session;
    if (review === null) return { cannot: 'not_review' } as const;
    const credentials = await github.credentials();
    if (credentials?.ok !== true) return { cannot: 'not_connected' } as const;
    return { review, token: credentials.token };
  }

  return {
    async changeComment(id, commentId, { keep, text }) {
      const outcome = { found: 'not_found' as 'changed' | 'posted' | 'not_found' };
      await save(id, (current) => {
        const { review } = current.session;
        const comment = review?.comments.find((one) => one.id === commentId);
        if (review == null || comment === undefined) return current;
        outcome.found = comment.postedAt === null ? 'changed' : 'posted';
        if (comment.postedAt !== null) return current;
        const changed = { ...comment, keep: keep ?? comment.keep, text: text ?? comment.text };
        const comments = review.comments.map((one) => (one === comment ? changed : one));
        return { ...current, session: { ...current.session, review: { ...review, comments } } };
      });
      return outcome.found;
    },

    async status(id) {
      const found = await ready(id);
      if (found === null) return null;
      if ('cannot' in found) return { result: 'cannot', reason: found.cannot };
      const { review, token } = found;
      // A review from the diff alone never knew its commit (Task 8): nothing to count from.
      if (review.commit === null) return { result: 'ready', pushed: 0 };
      const pull = await client.pullState(token, review);
      if (!pull.ok) return { result: 'failed', problem: threadsProblem(pull.problem) };
      if (pull.head === review.commit) return { result: 'ready', pushed: 0 };
      const between = await client.commitsBetween(token, {
        repository: review.repository,
        base: review.commit,
        head: pull.head,
      });
      if (!between.ok) return { result: 'failed', problem: threadsProblem(between.problem) };
      // A force push can leave the new head no commits past the old one: it still moved.
      return { result: 'ready', pushed: Math.max(between.ahead, 1) };
    },

    post(id, { summary, verdict }) {
      return oneAtATime(id, async () => {
        const found = await ready(id);
        if (found === null) return null;
        if ('cannot' in found) return { result: 'cannot', reason: found.cannot } as const;
        const { review, token } = found;
        const going = review.comments.filter((comment) => comment.keep && comment.postedAt === null);
        const posted = await client.postReview(token, {
          repository: review.repository,
          number: review.number,
          commit: review.commit,
          body: summary,
          event: events[verdict],
          comments: going.map(({ path, line, side, text }) => ({
            path,
            line,
            side: side === 'new' ? 'RIGHT' : 'LEFT',
            body: text,
          })),
        });
        if (!posted.ok) return { result: 'failed', problem: replyProblem(posted.problem) } as const;
        const at = new Date(now()).toISOString();
        const ids = new Set(going.map((comment) => comment.id));
        await save(id, (current) => {
          const now = current.session.review;
          if (now === null) return current;
          const comments = now.comments.map((one) => (ids.has(one.id) ? { ...one, postedAt: at } : one));
          const reviewed = { ...now, comments, posted: [...now.posted, { url: posted.url, at }] };
          return { ...current, session: { ...current.session, review: reviewed } };
        });
        return { result: 'posted', url: posted.url, comments: going.length } as const;
      });
    },
  };
}
