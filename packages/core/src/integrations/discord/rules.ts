/**
 * Discord's "waiting on your reply" rules (spec 016, B), pure. The wait itself is the inbox's to apply.
 */

/** A Discord message as Orynx reads it. `mentions` are the people it names, never @everyone or a role. */
export interface DiscordMessage {
  id: string;
  channel: string;
  author: { id: string; name: string; bot: boolean };
  content: string;
  mentions: string[];
  /** When it was sent, as an ISO time. */
  at: string;
  files: { name: string }[];
}

/** Discord's ids count milliseconds from 2015 in their top bits. */
const discordEpoch = 1_420_070_400_000n;

/** The smallest Discord id from `time` on, for searches and reads "after" it. */
export function snowflakeAt(time: number): string {
  const since = BigInt(Math.max(0, Math.floor(time))) - discordEpoch;
  return since <= 0n ? '0' : String(since << 22n);
}

/**
 * Whether a mention still waits on you: it names you, it's from a person who isn't you, it's inside the 7 days, and
 * nothing you wrote in its channel or thread came after it.
 */
export function mentionWaits(
  mention: DiscordMessage,
  after: readonly DiscordMessage[],
  me: string,
  since: number,
): boolean {
  if (!mention.mentions.includes(me) || mention.author.bot || mention.author.id === me) return false;
  if (Date.parse(mention.at) < since) return false;
  return !after.some((message) => message.author.id === me && BigInt(message.id) > BigInt(mention.id));
}
