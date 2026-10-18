import { z } from 'zod';
import type { ClaudeLogin } from '@devhub/contracts';

/**
 * What `claude auth status --json` prints, as far as DevHub reads it. It isn't part of the SDK's typed
 * API (spec 010, Q2), so the SDK is pinned and every field is checked; the others are ignored.
 */
const AuthStatusSchema = z.discriminatedUnion('loggedIn', [
  // Signed in must say how; signed out needs nothing else, so it reads even if a build leaves the rest out.
  z.object({
    loggedIn: z.literal(true),
    authMethod: z.string(),
    apiProvider: z.string(),
    email: z.string().nullish(),
    orgName: z.string().nullish(),
  }),
  z.object({ loggedIn: z.literal(false) }),
]);

function present(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === '' ? null : value;
}

/**
 * Claude Code's answer as the card shows it (Q5b). Bedrock and Vertex are named by the provider, a
 * claude.ai login by its account, and an API key by the way only. Null when the output isn't the
 * expected JSON, or its exit code disagrees with it: Claude Code exits 0 signed in and 1 signed out.
 */
export function readAuthStatus(stdout: string, exitCode: number): Exclude<ClaudeLogin, { state: 'error' }> | null {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return null;
  }
  const parsed = AuthStatusSchema.safeParse(json);
  if (!parsed.success) return null;
  const status = parsed.data;
  if (exitCode !== (status.loggedIn ? 0 : 1)) return null;
  if (!status.loggedIn) return { state: 'signed_out' };

  const none = { email: null, organisation: null };
  if (status.apiProvider === 'bedrock') return { state: 'signed_in', method: 'bedrock', ...none };
  if (status.apiProvider === 'vertex') return { state: 'signed_in', method: 'vertex', ...none };
  if (status.apiProvider !== 'firstParty') return { state: 'signed_in', method: 'other', ...none };
  switch (status.authMethod) {
    case 'claude.ai':
      return {
        state: 'signed_in',
        method: 'claude_ai',
        email: present(status.email),
        organisation: present(status.orgName),
      };
    case 'api_key':
    case 'api_key_helper':
      return { state: 'signed_in', method: 'api_key', ...none };
    default:
      return { state: 'signed_in', method: 'other', ...none };
  }
}
