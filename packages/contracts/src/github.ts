import { z } from 'zod';
import { tokenOrBlankSchema, tokenSchema } from './token.ts';

/** How DevHub gets a GitHub token: from the gh command-line login, or a personal access token (spec 004). */
export const GitHubMethodSchema = z.enum(['gh', 'token']);
export type GitHubMethod = z.infer<typeof GitHubMethodSchema>;

export const GitHubTokenSchema = tokenSchema('Paste your GitHub token.');

/** A token field that may be left empty: empty means keep the saved token, or use the `.env` one. */
export const GitHubTokenOrBlankSchema = tokenOrBlankSchema(GitHubTokenSchema);

/**
 * PUT /api/github/connection: check with GitHub, then save. The gh way carries no token: DevHub asks
 * gh for one each time (spec 004, Q2), and a stray `token` is dropped.
 */
export const GitHubConnectionRequestSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('gh') }),
  z.object({
    method: z.literal('token'),
    /** Empty or left out: keep the saved token, or use DEVHUB_GITHUB_TOKEN from `.env`. */
    token: GitHubTokenOrBlankSchema.optional(),
  }),
]);
/** What the page sends. */
export type GitHubConnectionRequest = z.input<typeof GitHubConnectionRequestSchema>;
/** What the server works with once the request is parsed: a trimmed token, or none. */
export type GitHubCredentials = z.output<typeof GitHubConnectionRequestSchema>;

/** The way GitHub accepted. The account isn't kept: the status check learns it each time. */
export const GitHubSavedConnectionSchema = z.object({ method: GitHubMethodSchema });
export type GitHubSavedConnection = z.infer<typeof GitHubSavedConnectionSchema>;

/** GET /api/github/connection, and the answer to PUT. Never holds a token. */
export const GitHubConnectionSchema = z.object({
  /** The way GitHub accepted; null until GitHub is connected. */
  saved: GitHubSavedConnectionSchema.nullable(),
  /** DEVHUB_TOKENS_FROM_ENV is on and `.env` has DEVHUB_GITHUB_TOKEN, so the token may be left empty. */
  envToken: z.boolean(),
  /** A `gh` program is on the server's PATH. Found by looking, without running it. */
  ghFound: z.boolean(),
});
export type GitHubConnection = z.infer<typeof GitHubConnectionSchema>;
