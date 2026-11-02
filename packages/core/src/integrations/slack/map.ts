import { z } from 'zod';
import { SlackLinkSchema } from '@devhub/contracts';
import { tsTime, type SlackMessage } from './rules.ts';

/**
 * Slack's shapes as Orynx's (spec 016, B), pure. A record is one row of the inbox: who, where, the first line, when
 * and the link. Never the thread (AC-24).
 */
export const SlackMessageRecordSchema = z.object({
  /** `channel/ts`: stable across syncs. */
  id: z.string().min(1),
  title: z.string().min(1),
  from: z.string().min(1),
  /** The channel's name without its #; null in a DM. */
  channel: z.string().min(1).nullable(),
  waitingSince: z.iso.datetime(),
  url: SlackLinkSchema,
});
export type SlackMessageRecord = z.infer<typeof SlackMessageRecordSchema>;

const titleLength = 120;

/** Slack's markup as it reads in Slack: `<@U…>` as @name, `<#C…|name>` as #name, a link as its words. */
export function plainText(text: string, names: ReadonlyMap<string, string>): string {
  return text
    .replace(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id: string) => `@${names.get(id) ?? 'someone'}`)
    .replace(/<#[CG][A-Z0-9]+\|([^>]*)>/g, '#$1')
    .replace(/<!(here|channel|everyone)(?:\|[^>]*)?>/g, '@$1')
    .replace(/<!subteam\^[A-Z0-9]+(?:\|([^>]*))?>/g, (_, name?: string) => name ?? '@group')
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<([^>]+)>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
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

/** A ts as an ISO time. */
export function slackTime(ts: string): string {
  return new Date(tsTime(ts)).toISOString();
}

/** A message's link as Slack writes it; a reply's names its thread, so it opens there. */
export function messageLink(workspace: string, channel: string, ts: string, threadTs: string | null): string {
  const link = `${workspace.replace(/\/$/, '')}/archives/${channel}/p${ts.replace('.', '')}`;
  return threadTs === null || threadTs === ts ? link : `${link}?thread_ts=${threadTs}&cid=${channel}`;
}

/** The row for a message waiting on you. */
export function slackRecord(
  message: SlackMessage,
  where: { from: string; channel: string | null },
  workspace: string,
  names: ReadonlyMap<string, string>,
): SlackMessageRecord {
  return {
    id: `${message.channel}/${message.ts}`,
    title: titleOf(message.text, message.files, names),
    from: where.from,
    channel: where.channel,
    waitingSince: slackTime(message.ts),
    url: messageLink(workspace, message.channel, message.ts, message.threadTs),
  };
}
