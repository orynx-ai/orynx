import { z } from 'zod';
import {
  questionOtherLimit,
  sessionTitleLimit,
  mostCommitMessageCharacters,
  mostMessageCharacters,
  mostPullRequestBodyCharacters,
  mostPullRequestTitleCharacters,
  mostReplyCharacters,
  mostReviewTextCharacters,
} from '@devhub/contracts';
import type { QuestionAnswer, SessionQuestion } from '@devhub/contracts';
import { questionWords } from './approval-words.ts';
import { tooLongLine } from './follow-up-words.ts';
import { reviewWords } from './review-words.ts';

/** The follow-up box (spec 013): the contract's rule, with its own words for too long (Q10d). */
export const followUpFormSchema = z.object({
  text: z.string().trim().min(1).max(mostMessageCharacters, tooLongLine),
});
export type FollowUpFormValues = z.input<typeof followUpFormSchema>;

/** The pull request dialog (spec 014): the contract's limits, in Q11d's words. */
export const pullRequestFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Give the pull request a title.')
    .max(mostPullRequestTitleCharacters, 'Keep the title under 256 characters.'),
  body: z.string().max(mostPullRequestBodyCharacters, 'Keep the description under 65,536 characters.'),
});
export type PullRequestFormValues = z.input<typeof pullRequestFormSchema>;

/** Push changes' commit message (spec 014, Q7): one line, as the contract takes it. */
export const pushFormSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Write a commit message.')
    .max(mostCommitMessageCharacters, 'Keep the message under 256 characters.'),
});
export type PushFormValues = z.input<typeof pushFormSchema>;

/** Reply to reviewers (spec 049): each thread's reply and Resolve, the reply at most GitHub's comment limit. */
export const repliesFormSchema = z.object({
  threads: z.array(
    z.object({
      threadId: z.string().min(1),
      reply: z.string().max(mostReplyCharacters, 'Keep the reply under 65,536 characters.'),
      resolve: z.boolean(),
    }),
  ),
});
export type RepliesFormValues = z.input<typeof repliesFormSchema>;

/** Rename session (spec 039): the contract's limits, in Q5's words. */
export const renameSessionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Give the session a name')
    .max(sessionTitleLimit, `Keep the name to ${String(sessionTitleLimit)} characters`),
});
export type RenameSessionValues = z.input<typeof renameSessionSchema>;

/** Edit on one of Claude's review comments (spec 050): GitHub's limit, in 049's words. */
export const reviewCommentFormSchema = z.object({
  text: z.string().trim().min(1, reviewWords.empty).max(mostReviewTextCharacters, reviewWords.tooLong),
});
export type ReviewCommentFormValues = z.input<typeof reviewCommentFormSchema>;

/** Other's value among a question's choices; the options are their places, "0" to "3", so a label can't match it. */
export const otherChoice = 'other';

/** One question as the form holds it (spec 051): a radio's value or none, or the checked boxes; and Other's text. */
export interface QuestionFormValues {
  answers: { picked: string | string[] | null; other: string }[];
}

/**
 * Claude's questions (spec 051): each needs a pick, and Other its text, at most 2,000 characters (AC-6). Gives the
 * answers as the contract sends them: the labels picked, and Other's text or null.
 */
export function questionFormSchema(questions: readonly SessionQuestion[]) {
  const chosen = (picked: string | string[] | null) => (picked === null ? [] : [picked].flat());
  return z
    .object({
      answers: z.array(z.object({ picked: z.union([z.string(), z.array(z.string())]).nullable(), other: z.string() })),
    })
    .superRefine(({ answers }, context) => {
      answers.forEach(({ picked, other }, index) => {
        const picks = chosen(picked);
        const typed = other.trim();
        if (picks.length === 0) {
          context.addIssue({ code: 'custom', path: ['answers', index, 'picked'], message: questionWords.pick });
        } else if (picks.includes(otherChoice) && typed === '') {
          context.addIssue({ code: 'custom', path: ['answers', index, 'other'], message: questionWords.type });
        } else if (picks.includes(otherChoice) && typed.length > questionOtherLimit) {
          context.addIssue({ code: 'custom', path: ['answers', index, 'other'], message: questionWords.tooLong });
        }
      });
    })
    .transform(({ answers }): QuestionAnswer[] =>
      answers.map(({ picked, other }, index) => {
        const picks = chosen(picked);
        const options = questions[index]?.options ?? [];
        return {
          picked: picks.flatMap((pick) => options[Number(pick)]?.label ?? []),
          other: picks.includes(otherChoice) ? other.trim() : null,
        };
      }),
    );
}
