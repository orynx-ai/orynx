import { passwordMaxLength, passwordMinLength } from '@devhub/contracts';
import { z } from 'zod';

/**
 * Set up Orynx (spec 043): the contract's SetupRequest laid flat, with the words each field shows, and the password
 * typed twice.
 */
export const setupFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(80, 'Keep the name to 80 characters.'),
    bio: z.string().trim().max(160, 'Keep the bio to 160 characters.'),
    picture: z.string().nullable(),
    password: z
      .string()
      .min(passwordMinLength, `Use at least ${String(passwordMinLength)} characters.`)
      .max(passwordMaxLength, `Keep the password to ${String(passwordMaxLength)} characters.`),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'The passwords don’t match.',
  });
export type SetupFormValues = z.infer<typeof setupFormSchema>;
