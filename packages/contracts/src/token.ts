import { z } from 'zod';

/**
 * Spec 002's rule for every token: no spaces or line breaks inside, at most 4096 characters. Spaces
 * at the ends are trimmed first, because a pasted token often carries one. `missing` is what the
 * field says when it is empty, in the tool's words.
 */
export function tokenSchema(missing: string) {
  return z
    .string()
    .trim()
    .min(1, missing)
    .max(4096, 'A token has no spaces or line breaks and is at most 4096 characters.')
    .regex(/^\S*$/, 'Paste the token without spaces or line breaks.');
}

/** A token field that may be left empty: empty means keep the saved token, or use the `.env` one. */
export function tokenOrBlankSchema(token: ReturnType<typeof tokenSchema>) {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .pipe(token.optional());
}
