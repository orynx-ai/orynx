import { z } from 'zod';
import { mostMessageCharacters } from '@devhub/contracts';
import { tooLongLine } from './follow-up-words.ts';

/** The follow-up box (spec 013): the contract's rule, with its own words for too long (Q10d). */
export const followUpFormSchema = z.object({
  text: z.string().trim().min(1).max(mostMessageCharacters, tooLongLine),
});
export type FollowUpFormValues = z.input<typeof followUpFormSchema>;
