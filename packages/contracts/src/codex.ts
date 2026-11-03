import { z } from 'zod';

/** How Codex is signed in on this computer (spec 052). A way Orynx doesn't name is `other`, said as "Signed in". */
export const CodexLoginMethodSchema = z.enum(['chatgpt', 'api_key', 'other']);
export type CodexLoginMethod = z.infer<typeof CodexLoginMethodSchema>;

/**
 * GET /api/codex/login, and the answer to POST /api/codex/login/check: Codex's own login, which Orynx only reads
 * through `codex app-server`'s `account/read` (spec 052). `not_installed` is no `codex`, or one older than 0.166.
 * Signed out, not installed and error carry nothing else: why a check failed goes to the terminal only.
 */
export const CodexLoginSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('signed_in'),
    method: CodexLoginMethodSchema,
    /** The ChatGPT account; null for an API key or another way. */
    email: z.string().min(1).nullable(),
  }),
  z.object({ state: z.literal('signed_out') }),
  z.object({ state: z.literal('not_installed') }),
  z.object({ state: z.literal('error') }),
]);
export type CodexLogin = z.infer<typeof CodexLoginSchema>;
