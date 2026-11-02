import { z } from 'zod';
import { tokenOrBlankSchema, tokenSchema } from './token.ts';

/**
 * The user scopes Orynx's Slack app asks for, and every token is checked against (spec 016, A and Q3): your
 * mentions, DMs and group DMs, a thread's messages and whether you replied, channels' and people's names, and the
 * one reply with a pull request's link.
 */
export const slackScopes = [
  'search:read',
  'im:history',
  'im:read',
  'mpim:history',
  'mpim:read',
  'channels:history',
  'channels:read',
  'groups:history',
  'groups:read',
  'users:read',
  'chat:write',
] as const;

/** A Slack workspace's address, the only kind of Slack link Orynx opens: https on `<workspace>.slack.com`. */
export const slackWorkspaceHost = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.slack\.com$/;

export const SlackTokenSchema = tokenSchema('Paste your Slack token.');

/** PUT /api/slack/connection: check the token with Slack, then save it. */
export const SlackConnectionRequestSchema = z.object({
  /** Empty or left out: keep the saved token, or use DEVHUB_SLACK_USER_TOKEN from `.env`. */
  token: tokenOrBlankSchema(SlackTokenSchema).optional(),
});
export type SlackConnectionRequest = z.input<typeof SlackConnectionRequestSchema>;

/** Who the token belongs to, as Slack said when it was checked. Never the token. */
export const SlackSavedConnectionSchema = z.object({
  /** The workspace's name, such as "Acme". */
  workspace: z.string().min(1),
  url: z.url({ protocol: /^https$/, hostname: slackWorkspaceHost }),
  /** Your Slack user ID: whose mentions and DMs count. */
  userId: z.string().regex(/^[UW][A-Z0-9]{2,}$/),
  /** Your name in that workspace. */
  name: z.string().min(1),
});
export type SlackSavedConnection = z.infer<typeof SlackSavedConnectionSchema>;

/** GET /api/slack/connection, and the answer to PUT. Never holds a token. */
export const SlackConnectionSchema = z.object({
  saved: SlackSavedConnectionSchema.nullable(),
  /** DEVHUB_TOKENS_FROM_ENV is on and `.env` has DEVHUB_SLACK_USER_TOKEN, so the token may be left empty. */
  envToken: z.boolean(),
});
export type SlackConnection = z.infer<typeof SlackConnectionSchema>;
