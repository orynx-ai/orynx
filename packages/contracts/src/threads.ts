import { z } from 'zod';
import { DiscordIdSchema } from './discord.ts';

/**
 * Slack and Discord threads as Claude's context (spec 016, C). A chip names the thread by its ids; the server reads
 * its messages at Send. `label` is how the chip reads, from the inbox row or the preview; the server keeps the names
 * it read instead.
 */

/** Who started a thread and where: a channel's name without its #, or null for a DM; Discord's server, else null. */
export const ThreadLabelSchema = z.object({
  from: z.string().min(1).max(200),
  channel: z.string().min(1).max(200).nullable(),
  server: z.string().min(1).max(200).nullable(),
});
export type ThreadLabel = z.infer<typeof ThreadLabelSchema>;

/** A Slack thread: its channel and its first message's `ts`, such as `1700000000.123456`. */
export const SlackThreadChipSchema = z.object({
  kind: z.literal('slack_thread'),
  channel: z.string().regex(/^[CDG][A-Z0-9]{2,}$/),
  ts: z.string().regex(/^\d{10}\.\d{6}$/),
  label: ThreadLabelSchema.optional(),
});

/** A Discord message in a server, and through it its thread (spec 016, C). */
export const DiscordThreadChipSchema = z.object({
  kind: z.literal('discord_thread'),
  guild: DiscordIdSchema,
  channel: DiscordIdSchema,
  message: DiscordIdSchema,
  label: ThreadLabelSchema.optional(),
});

export type ThreadChip = z.infer<typeof SlackThreadChipSchema> | z.infer<typeof DiscordThreadChipSchema>;

const slackLink =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.slack\.com\/archives\/([CDG][A-Z0-9]{2,})\/p(\d{10})(\d{6})(?:\?(.*))?$/;
const discordLink =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})\/?$/;

/**
 * A pasted Slack or Discord message link as its thread, or null. A reply's Slack link names its thread in
 * `thread_ts`. A Discord DM's link (`@me`) is null: a bot can't read DMs (spec 016, A).
 */
export function threadFromLink(pasted: string): ThreadChip | null {
  const link = pasted.trim();
  const fromSlack = slackLink.exec(link);
  if (fromSlack !== null) {
    const [, channel = '', seconds = '', micro = '', query = ''] = fromSlack;
    const threadTs = /(?:^|&)thread_ts=(\d{10}\.\d{6})(?:&|$)/.exec(query)?.[1];
    return { kind: 'slack_thread', channel, ts: threadTs ?? `${seconds}.${micro}` };
  }
  const fromDiscord = discordLink.exec(link);
  if (fromDiscord !== null) {
    const [, guild = '', channel = '', message = ''] = fromDiscord;
    return { kind: 'discord_thread', guild, channel, message };
  }
  return null;
}

/** GET /api/threads/preview: the thread a pasted link names, as the chip will read. */
export const ThreadPreviewQuerySchema = z.object({ link: z.string().min(1).max(2048) });
export type ThreadPreviewQuery = z.infer<typeof ThreadPreviewQuerySchema>;

export const ThreadPreviewAnswerSchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('found'),
    chip: z.union([SlackThreadChipSchema, DiscordThreadChipSchema]),
    label: ThreadLabelSchema,
  }),
  /** The link is Slack's or Discord's, and that tool isn't connected (AC-27). */
  z.object({ result: z.literal('not_connected'), tool: z.enum(['slack', 'discord']) }),
  /** Not a message link, deleted, or somewhere the token or bot can't read. */
  z.object({ result: z.literal('not_found') }),
]);
export type ThreadPreviewAnswer = z.infer<typeof ThreadPreviewAnswerSchema>;
