import { z } from 'zod';
import { mostMessageCharacters } from '@devhub/contracts';
import { composerWords } from './composer-words.ts';

/** The search box in Home's toolbar (spec 007, Q10a, Q10b): free text, matched word by word. */
export const SearchFormSchema = z.object({ q: z.string() });
export type SearchFormValues = z.infer<typeof SearchFormSchema>;

/**
 * The composer's box (spec 015): the contract's rule for the message, with its own words for too long. It may be
 * empty, because a ticket chip can be the whole brief (AC-8); Send says when there's nothing to send.
 */
export const composerFormSchema = z.object({
  message: z.string().trim().max(mostMessageCharacters, composerWords.tooLong),
});
export type ComposerFormValues = z.input<typeof composerFormSchema>;
