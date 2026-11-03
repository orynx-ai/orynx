import { z } from 'zod';
import {
  AllowedCommandSchema,
  DiscordTokenOrBlankSchema,
  DiscordTokenSchema,
  DiscordUserIdSchema,
  GitHubTokenOrBlankSchema,
  GitHubTokenSchema,
  JiraApiTokenOrBlankSchema,
  JiraApiTokenSchema,
  JiraConnectionRequestSchema,
  JiraProjectKeySchema,
  RepositoryPathSchema,
  SlackTokenOrBlankSchema,
  SlackTokenSchema,
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

/** Slack's and Discord's Reconnect field (spec 016): empty tries the saved token again. */
export const slackReconnectSchema = z.object({ token: SlackTokenOrBlankSchema });
export const discordReconnectSchema = z.object({ token: DiscordTokenOrBlankSchema });

/** What Slack's or Discord's connect form holds while a person types (spec 016). */
export interface ChatFormValues {
  token: string;
  userId: string;
}

/**
 * Slack's or Discord's connect form (spec 016): the token, which may stay empty only when Orynx has one already, and
 * Discord's user ID, asked only once a team's bot needs it (AC-8).
 */
export function chatFormSchema(
  tool: 'slack' | 'discord',
  { tokenKept, askUserId }: { tokenKept: boolean; askUserId: boolean },
): z.ZodType<{ token?: string | undefined; userId?: string | undefined }, ChatFormValues> {
  const token =
    tool === 'slack'
      ? tokenKept
        ? SlackTokenOrBlankSchema
        : SlackTokenSchema
      : tokenKept
        ? DiscordTokenOrBlankSchema
        : DiscordTokenSchema;
  return z.object({ token, userId: askUserId ? DiscordUserIdSchema : z.string().transform(() => undefined) });
}
