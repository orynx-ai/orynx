import { z } from 'zod';
import {
  GitHubTokenOrBlankSchema,
  GitHubTokenSchema,
  JiraApiTokenOrBlankSchema,
  JiraApiTokenSchema,
  JiraConnectionRequestSchema,
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
