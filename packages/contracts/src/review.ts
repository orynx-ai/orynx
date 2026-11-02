import { z } from 'zod';
import { GitHubLinkSchema } from './github.ts';
import { ReplyProblemSchema } from './pull-requests.ts';
import { mostReviewTextCharacters, ReviewVerdictSchema } from './session.ts';

/** PATCH /api/sessions/:id/review/comments/:commentId: Keep, the text as you edited it, or both (spec 050, AC-12). */
export const ReviewCommentChangeSchema = z
  .object({
    keep: z.boolean().optional(),
    text: z.string().trim().min(1).max(mostReviewTextCharacters).optional(),
  })
  .refine((change) => change.keep !== undefined || change.text !== undefined, { message: 'Keep or text.' });
export type ReviewCommentChange = z.infer<typeof ReviewCommentChangeSchema>;

/** Why Orynx can't post a review (spec 050): the session isn't a review, or GitHub isn't connected. */
export const CannotReviewReasonSchema = z.enum(['not_review', 'not_connected']);
export type CannotReviewReason = z.infer<typeof CannotReviewReasonSchema>;

/** GET /api/sessions/:id/review/status: how many commits the author pushed since Claude read the pull request (AC-18). */
export const ReviewStatusSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('ready'), pushed: z.int().nonnegative() }),
  z.object({ result: z.literal('cannot'), reason: CannotReviewReasonSchema }),
  z.object({ result: z.literal('failed'), problem: ReplyProblemSchema }),
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/**
 * POST /api/sessions/:id/review: the summary and your verdict, only on your press (spec 050). GitHub wants a summary
 * to comment or request changes (AC-15).
 */
export const PostReviewRequestSchema = z
  .object({ summary: z.string().trim().max(mostReviewTextCharacters), verdict: ReviewVerdictSchema })
  .refine((review) => review.verdict === 'approve' || review.summary !== '', {
    message: 'Write a summary to comment or request changes.',
    path: ['summary'],
  });
export type PostReviewRequest = z.infer<typeof PostReviewRequestSchema>;

/** The answer to POST /api/sessions/:id/review: the review on GitHub with how many comments went, can't, or failed. */
export const PostReviewAnswerSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('posted'), url: GitHubLinkSchema, comments: z.int().nonnegative() }),
  z.object({ result: z.literal('cannot'), reason: CannotReviewReasonSchema }),
  z.object({ result: z.literal('failed'), problem: ReplyProblemSchema }),
]);
export type PostReviewAnswer = z.infer<typeof PostReviewAnswerSchema>;
