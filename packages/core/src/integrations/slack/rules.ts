/**
 * Slack's "waiting on your reply" rules (spec 016, B), pure. The wait itself (2 h by default) is the inbox's to
 * apply, from Settings, so changing it needs no sync.
 */

/** A Slack message as Orynx reads it: in a channel or DM, maybe in a thread, from a person or a bot. */
export interface SlackMessage {
  channel: string;
  ts: string;
  /** The thread's first message's ts when it's in a thread, else null. */
  threadTs: string | null;
  /** Who wrote it; null for a message with no person, such as a bot's. */
  user: string | null;
  bot: boolean;
  text: string;
  files: { name: string }[];
}

/** A Slack ts, `1793613600.000100`, in milliseconds. */
export function tsTime(ts: string): number {
  return Number(ts) * 1000;
}

/** A message from someone else, a person, inside the 7 days. */
function fromSomeoneElse(message: SlackMessage, me: string, since: number): boolean {
  return !message.bot && message.user !== null && message.user !== me && tsTime(message.ts) >= since;
}

/**
 * Whether a mention still waits on you: it names you (never @here, @channel, @everyone or a group), it's someone
 * else's, it's inside the 7 days, and nothing you wrote in its thread came after it.
 */
export function mentionWaits(
  mention: SlackMessage,
  thread: readonly SlackMessage[],
  me: string,
  since: number,
): boolean {
  if (!mention.text.includes(`<@${me}>`) || !fromSomeoneElse(mention, me, since)) return false;
  return !thread.some((reply) => reply.user === me && tsTime(reply.ts) > tsTime(mention.ts));
}

/** A DM's oldest message after your last one, from someone else inside the 7 days; null when you answered. */
export function firstUnanswered(history: readonly SlackMessage[], me: string, since: number): SlackMessage | null {
  const oldestFirst = [...history].sort((a, b) => tsTime(a.ts) - tsTime(b.ts));
  const lastMine = oldestFirst.findLastIndex((message) => message.user === me);
  return oldestFirst.slice(lastMine + 1).find((message) => fromSomeoneElse(message, me, since)) ?? null;
}
