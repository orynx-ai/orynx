import { z } from 'zod';
import { tokenOrBlankSchema, tokenSchema } from './token.ts';

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

export const JiraApiTokenSchema = tokenSchema('Paste your Jira API token.');

/** A token field that may be left empty: empty means keep the saved token, or use the `.env` one. */
export const JiraApiTokenOrBlankSchema = tokenOrBlankSchema(JiraApiTokenSchema);

/** PUT /api/jira/connection: check these with Jira, then save them. */
export const JiraConnectionRequestSchema = z.object({
  site: JiraSiteSchema,
  email: JiraEmailSchema,
  /** Empty or left out: keep the saved token, or use DEVHUB_JIRA_API_TOKEN from `.env`. */
  apiToken: JiraApiTokenOrBlankSchema.optional(),
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

/** A Jira project key as Jira makes them: a capital letter, then capitals, digits or underscores. */
export const JiraProjectKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/, 'Pick a Jira project.');

/** A project the saved Jira connection can see, for Settings › Repositories (spec 005). */
export const JiraProjectSchema = z.object({ key: JiraProjectKeySchema, name: z.string() });
export type JiraProject = z.infer<typeof JiraProjectSchema>;

/** GET /api/jira/projects: every project the connection can see, by key, at most 1000. */
export const JiraProjectListSchema = z.object({ projects: z.array(JiraProjectSchema) });
export type JiraProjectList = z.infer<typeof JiraProjectListSchema>;
