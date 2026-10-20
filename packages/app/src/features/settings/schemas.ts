import { z } from 'zod';
import {
  AllowedCommandSchema,
  GitHubTokenOrBlankSchema,
  GitHubTokenSchema,
  JiraApiTokenOrBlankSchema,
  JiraApiTokenSchema,
  JiraConnectionRequestSchema,
  JiraProjectKeySchema,
  RepositoryPathSchema,
  type AddRepositoryRequestSchema,
  type GitHubCredentials,
  type GitHubMethod,
  type JiraCredentials,
} from '@devhub/contracts';

/** What the Connect Jira form holds while a person types. */
export interface JiraFormValues {
  site: string;
  email: string;
  apiToken: string;
}

/**
 * The contract's request, so the form and the server refuse the same values. The token may be left
 * empty only when DevHub already has one: saved in the keychain, or in `.env`.
 */
export function jiraFormSchema(tokenRequired: boolean): z.ZodType<JiraCredentials, JiraFormValues> {
  return JiraConnectionRequestSchema.extend({
    apiToken: tokenRequired ? JiraApiTokenSchema : JiraApiTokenOrBlankSchema,
  });
}

/** What the Connect GitHub form holds while a person types. */
export interface GitHubFormValues {
  method: GitHubMethod;
  token: string;
}

/**
 * The contract's request, so the form and the server refuse the same values: the gh way sends no
 * token, whatever the hidden field holds. The token may be left empty only when DevHub already has
 * one: saved in the keychain, or in `.env`.
 */
export function githubFormSchema(tokenRequired: boolean): z.ZodType<GitHubCredentials, GitHubFormValues> {
  return z.discriminatedUnion('method', [
    z.object({ method: z.literal('gh'), token: z.string().transform(() => undefined) }),
    z.object({ method: z.literal('token'), token: tokenRequired ? GitHubTokenSchema : GitHubTokenOrBlankSchema }),
  ]);
}

/** What Reconnect's one token field holds (spec 030, Q3). */
export interface ReconnectTokenValues {
  token: string;
}

/** Empty means try the saved token again; anything else is checked like Connect's token. */
export const jiraReconnectSchema = z.object({ token: JiraApiTokenOrBlankSchema });
export const githubReconnectSchema = z.object({ token: GitHubTokenOrBlankSchema });

/** What the folder dialog holds while a person types (spec 020); "" for the Jira project means none. */
export interface AddFolderFormValues {
  path: string;
  jiraProject: string;
}

/** The contract's request, so the form and the server refuse the same paths (spec 005, Q8e). */
export const addFolderFormSchema: z.ZodType<
  z.output<typeof AddRepositoryRequestSchema>,
  AddFolderFormValues
> = z.object({
  path: RepositoryPathSchema,
  jiraProject: z
    .string()
    .transform((key) => (key === '' ? null : key))
    .pipe(JiraProjectKeySchema.nullable()),
});

/** What the allow list's Add field holds while a person types (spec 012). */
export interface AllowedCommandFormValues {
  command: string;
}

/**
 * The contract's own reading, so the form and the server refuse the same commands with the same words
 * (Q8f), and an entry already on the list, as the list reads it.
 */
export function allowedCommandFormSchema(
  saved: readonly string[],
): z.ZodType<{ command: string }, AllowedCommandFormValues> {
  return z.object({
    command: AllowedCommandSchema.superRefine((entry, ctx) => {
      if (saved.includes(entry)) ctx.addIssue({ code: 'custom', message: `${entry} is already on the list.` });
    }),
  });
}
