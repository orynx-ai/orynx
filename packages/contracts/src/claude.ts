import { z } from 'zod';

/**
 * How Claude Code is signed in on this computer (spec 010, Q5b). A way DevHub doesn't name is `other`,
 * which the card says as "Signed in".
 */
export const ClaudeLoginMethodSchema = z.enum(['claude_ai', 'api_key', 'bedrock', 'vertex', 'other']);
export type ClaudeLoginMethod = z.infer<typeof ClaudeLoginMethodSchema>;

/** Claude Code has a login on this computer. Whether Claude's servers still accept it shows when a session starts. */
export const ClaudeSignedInSchema = z.object({
  state: z.literal('signed_in'),
  method: ClaudeLoginMethodSchema,
  /** The claude.ai account; null when Claude Code signs in another way. */
  email: z.string().min(1).nullable(),
  organisation: z.string().min(1).nullable(),
});
export type ClaudeSignedIn = z.infer<typeof ClaudeSignedInSchema>;

/**
 * GET /api/claude/login, and the answer to POST /api/claude/login/check: Claude Code's own login, which
 * DevHub only checks (spec 010). Read fresh on each check and never saved. Signed out and error carry
 * nothing else: why a check failed goes to the terminal only (AC-6).
 */
export const ClaudeLoginSchema = z.discriminatedUnion('state', [
  ClaudeSignedInSchema,
  z.object({ state: z.literal('signed_out') }),
  /** The program is missing, crashed, ran too long or printed something DevHub can't read. */
  z.object({ state: z.literal('error') }),
]);
export type ClaudeLogin = z.infer<typeof ClaudeLoginSchema>;
