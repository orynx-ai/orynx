import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
  'forbidden_host',
  'unauthorized',
  'bad_request',
  'not_found',
  /** The OS keychain is locked, refused access or does not exist, so a token can't be read or saved (spec 002). */
  'keychain_unavailable',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** The body of every non-2xx response from the local server. */
export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
