import { z } from 'zod';
import { FilePathSchema, mostMessageCharacters } from '@devhub/contracts';
import { addFileWords, composerWords } from './composer-words.ts';

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

/** Add a file's Path (spec 022, AC-12): from `/` or `~/`, as the contract takes it; the server finds the file. */
export const addFileFormSchema = z.object({
  path: z
    .string()
    .trim()
    .refine((path) => FilePathSchema.safeParse(path).success, addFileWords.notAPath),
});
export type AddFileFormValues = z.input<typeof addFileFormSchema>;
