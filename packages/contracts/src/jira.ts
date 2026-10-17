import { z } from 'zod';

/** A Jira Cloud address, the only kind DevHub sends a token to (spec 003, Q2). */
const cloudHost = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net$/;
const httpScheme = /^https?:\/\//;

/** `your-team`, `your-team.atlassian.net` or any link on it → `your-team.atlassian.net`. */
function hostOf(typed: string): string {
  const host = typed.replace(httpScheme, '').split(/[/?#]/, 1)[0] ?? '';
  return host.includes('.') ? host : `${host}.atlassian.net`;
}

/**
 * The Jira site as a person types or pastes it. Parses to the bare host, so a typo such as
 * `atlasian.net` is refused before DevHub sends anything anywhere.
 */
export const JiraSiteSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter the address you open Jira at.')
  .transform(hostOf)
  .pipe(z.string().regex(cloudHost, 'Use your Jira Cloud address, like your-team.atlassian.net.'));

const emailMessage = 'Enter the email you sign in to Jira with.';

export const JiraEmailSchema = z.string().trim().pipe(z.email(emailMessage).max(254, emailMessage));

/** Spec 002's rule for every token: no spaces or line breaks inside, at most 4096 characters. */
export const JiraApiTokenSchema = z
  .string()
  .trim()
  .min(1, 'Paste your Jira API token.')
  .max(4096, 'A token has no spaces or line breaks and is at most 4096 characters.')
  .regex(/^\S*$/, 'Paste the token without spaces or line breaks.');

/** PUT /api/jira/connection: check these with Jira, then save them. */
export const JiraConnectionRequestSchema = z.object({
  site: JiraSiteSchema,
  email: JiraEmailSchema,
  /** Empty or left out: keep the saved token, or use DEVHUB_JIRA_API_TOKEN from `.env`. */
  apiToken: z
    .string()
    .trim()
    .transform((token) => (token === '' ? undefined : token))
    .pipe(JiraApiTokenSchema.optional())
    .optional(),
});
/** What the page sends. */
export type JiraConnectionRequest = z.input<typeof JiraConnectionRequestSchema>;
/** What the server works with once the request is parsed: a bare host, trimmed values. */
export type JiraCredentials = z.output<typeof JiraConnectionRequestSchema>;

export const JiraSavedConnectionSchema = z.object({
  site: z.string().regex(cloudHost),
  email: z.email(),
});
export type JiraSavedConnection = z.infer<typeof JiraSavedConnectionSchema>;

/** GET /api/jira/connection, and the answer to PUT. Never holds a token. */
export const JiraConnectionSchema = z.object({
  /** The site and email Jira accepted; null until Jira is connected. */
  saved: JiraSavedConnectionSchema.nullable(),
  /** DEVHUB_TOKENS_FROM_ENV is on and `.env` has DEVHUB_JIRA_API_TOKEN, so the token may be left empty. */
  envToken: z.boolean(),
});
export type JiraConnection = z.infer<typeof JiraConnectionSchema>;
