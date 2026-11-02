import type { ReplyProblem, ReviewVerdict } from '@devhub/contracts';
import { clockText } from '../../words/calendar.ts';

const plural = (count: number, one: string) => `${String(count)} ${one}${count === 1 ? '' : 's'}`;

/** What a review session says (spec 050, Q5). */
export const reviewWords = {
  author: 'Claude',
  /** A comment's note, by its file and line: "Claude on src/a.ts:42". */
  note: (path: string, line: number) => `Claude on ${path}:${String(line)}`,
  keep: 'Keep',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  comment: 'Comment',
  posted: 'Posted',
  empty: 'Write a comment.',
  tooLong: 'Keep the comment under 65,536 characters.',
  unsaved: 'Couldn’t save the comment. Try again.',
  // The next move (AC-11, AC-13, AC-21).
  left: (count: number) => `Claude left ${plural(count, 'comment')}`,
  nothing: 'Claude found nothing to comment on.',
  postedTitle: 'Review posted',
  openOnGitHub: 'Open on GitHub',
  // Post review (AC-14 to AC-20).
  button: 'Post review',
  posting: 'Posting…',
  title: (number: number) => `Post your review on #${String(number)}`,
  summary: 'Summary',
  verdict: 'Your verdict',
  verdicts: { comment: 'Comment', approve: 'Approve', request_changes: 'Request changes' } satisfies Record<
    ReviewVerdict,
    string
  >,
  claudeWould: {
    comment: 'Claude would comment.',
    approve: 'Claude would approve.',
    request_changes: 'Claude would request changes.',
  } satisfies Record<ReviewVerdict, string>,
  going: (kept: number, of: number) => `${String(kept)} of ${plural(of, 'comment')} will be posted.`,
  pushed: (count: number) =>
    `The author pushed ${plural(count, 'commit')} since Claude read it. The comments go on the commit Claude read.`,
  notConnected: 'Connect GitHub to post the review.',
  notSent: 'Couldn’t post the review. Try again.',
};

/** Why GitHub didn't take the review (AC-19, AC-20), in Reply to reviewers' words (spec 049). */
export function reviewProblemLine(problem: ReplyProblem, repository: string): string {
  switch (problem.kind) {
    case 'github_said':
      return `GitHub refused it: ${problem.message}`;
    case 'github_forbidden':
      return `Your GitHub account can't review in ${repository}.`;
    case 'github_sso':
      return `Authorize your GitHub token for ${repository.split('/')[0] ?? repository}'s single sign-on, then try again.`;
    case 'rate_limited':
      return problem.resetAt === null
        ? "GitHub's rate limit is used up."
        : `GitHub's rate limit is used up until ${clockText(problem.resetAt)}.`;
    case 'github_unreachable':
      return "Couldn't reach GitHub. Try again.";
    case 'no_commits':
    case 'github_refused':
      return 'GitHub refused it. Try again.';
  }
}
