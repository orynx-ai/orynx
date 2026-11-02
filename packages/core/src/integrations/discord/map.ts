import { z } from 'zod';
import { DiscordLinkSchema } from '@devhub/contracts';
import type { DiscordMessage } from './rules.ts';

/** Discord's shapes as Orynx's (spec 016, B), pure. A record is one row of the inbox, never the thread (AC-24). */
export const DiscordMessageRecordSchema = z.object({
  /** `channel/message`: stable across syncs. */
  id: z.string().min(1),
  title: z.string().min(1),
  from: z.string().min(1),
  channel: z.string().min(1),
  server: z.string().min(1),
  waitingSince: z.iso.datetime(),
  url: DiscordLinkSchema,
});
export type DiscordMessageRecord = z.infer<typeof DiscordMessageRecordSchema>;

const titleLength = 120;

/** Discord's markup as it reads in Discord: a person as @name, a role as @role, a channel as #channel. */
export function plainText(text: string, names: ReadonlyMap<string, string>): string {
  return text
    .replace(/<@!?(\d+)>/g, (_, id: string) => `@${names.get(id) ?? 'someone'}`)
    .replace(/<@&\d+>/g, '@role')
    .replace(/<#\d+>/g, '#channel')
    .replace(/<a?(:\w+:)\d+>/g, '$1');
}

/** A row's title: the first line with words, up to 120 characters, else a file's name. */
export function titleOf(text: string, files: readonly { name: string }[], names: ReadonlyMap<string, string>): string {
  const line = plainText(text, names)
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part !== '');
  if (line === undefined) return files[0]?.name ?? 'A message with no text';
  return line.length > titleLength ? `${line.slice(0, titleLength - 1)}…` : line;
}

/** The row for a mention waiting on you. */
export function discordRecord(
  message: DiscordMessage,
  where: { guild: string; server: string; channel: string },
  names: ReadonlyMap<string, string>,
): DiscordMessageRecord {
  return {
    id: `${message.channel}/${message.id}`,
    title: titleOf(message.content, message.files, names),
    from: message.author.name,
    channel: where.channel,
    server: where.server,
    waitingSince: new Date(message.at).toISOString(),
    url: `https://discord.com/channels/${where.guild}/${message.channel}/${message.id}`,
  };
}
