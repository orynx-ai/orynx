import { z } from 'zod';

/** The search box in Home's toolbar (spec 007, Q10a, Q10b): free text, matched word by word. */
export const SearchFormSchema = z.object({ q: z.string() });
export type SearchFormValues = z.infer<typeof SearchFormSchema>;
