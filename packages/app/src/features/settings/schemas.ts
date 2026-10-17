import type { z } from 'zod';
import {
  JiraApiTokenOrBlankSchema,
  JiraApiTokenSchema,
  JiraConnectionRequestSchema,
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
