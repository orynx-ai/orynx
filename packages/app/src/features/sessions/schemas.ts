import { z } from 'zod';
import {
  sessionTitleLimit,
  mostCommitMessageCharacters,
  mostMessageCharacters,
  mostPullRequestBodyCharacters,
  mostPullRequestTitleCharacters,
} from '@devhub/contracts';
import { tooLongLine } from './follow-up-words.ts';

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

/** Rename session (spec 039): the contract's limits, in Q5's words. */
export const renameSessionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Give the session a name')
    .max(sessionTitleLimit, `Keep the name to ${String(sessionTitleLimit)} characters`),
});
export type RenameSessionValues = z.input<typeof renameSessionSchema>;
