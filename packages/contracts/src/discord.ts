import { z } from 'zod';
import { tokenOrBlankSchema, tokenSchema } from './token.ts';

/** A Discord id (a snowflake): 17 to 20 digits. */
export const DiscordIdSchema = z.string().regex(/^\d{17,20}$/);

export const DiscordTokenSchema = tokenSchema("Paste your bot's token.");

/** Your Discord user ID, which Orynx asks for only when a team owns the bot's application (spec 016, AC-8). */
export const DiscordUserIdSchema = z
  .string()
  .trim()
  .regex(/^\d{17,20}$/, 'Paste your Discord user ID: 17 to 20 digits.');

/** PUT /api/discord/connection: check the bot's token with Discord, then save it. */
export const DiscordConnectionRequestSchema = z.object({
  /** Empty or left out: keep the saved token, or use DEVHUB_DISCORD_BOT_TOKEN from `.env`. */
  token: tokenOrBlankSchema(DiscordTokenSchema).optional(),
  /** Left out when you own the application: then you are its owner. */
  userId: DiscordUserIdSchema.optional(),
});
export type DiscordConnectionRequest = z.input<typeof DiscordConnectionRequestSchema>;

/** The bot and whose mentions it reads, as Discord said when it was checked. Never the token. */
export const DiscordSavedConnectionSchema = z.object({
  /** The bot's name, such as "Orynx". */
  bot: z.string().min(1),
  /** Your Discord user ID: whose mentions count. */
  userId: DiscordIdSchema,
});
export type DiscordSavedConnection = z.infer<typeof DiscordSavedConnectionSchema>;

/** GET /api/discord/connection, and the answer to PUT. Never holds a token. */
export const DiscordConnectionSchema = z.object({
  saved: DiscordSavedConnectionSchema.nullable(),
  /** DEVHUB_TOKENS_FROM_ENV is on and `.env` has DEVHUB_DISCORD_BOT_TOKEN, so the token may be left empty. */
  envToken: z.boolean(),
});
export type DiscordConnection = z.infer<typeof DiscordConnectionSchema>;
