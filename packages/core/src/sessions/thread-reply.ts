import type { ThreadChip, ThreadReplyAnswer } from '@devhub/contracts';
import type { DiscordClient } from '../integrations/discord/client.ts';
import type { DiscordSyncCredentials } from '../integrations/discord/connection.ts';
import type { SlackClient } from '../integrations/slack/client.ts';
import type { SlackSyncCredentials } from '../integrations/slack/connection.ts';
import type { SessionRecords, StoredSession } from './session-store.ts';

/**
 * The one reply Orynx writes to Slack or Discord (spec 016, E): the pull request's link in the session's first thread,
 * posted only when the person presses Post reply (rule 11). Nothing else is ever written to either tool.
 */

export interface ThreadRepliesOptions {
  records: Pick<SessionRecords, 'get'>;
  save: (id: string, change: (record: StoredSession) => StoredSession) => Promise<StoredSession | null>;
  slack?: {
    client: Pick<SlackClient, 'postReply'>;
    connection: { credentials(): Promise<SlackSyncCredentials | null> };
  };
  discord?: {
    client: Pick<DiscordClient, 'postReply'>;
    connection: { credentials(): Promise<DiscordSyncCredentials | null> };
  };
}

/** Posted or failed; or why there's nothing to post: no thread, no pull request yet, or posted already. */
export type ThreadReplyOutcome = ThreadReplyAnswer | { cannot: 'no_thread' | 'no_pull_request' | 'posted' };

export interface ThreadReplies {
  /** Posts `text` in the session's first thread; null for no such session. */
  post(id: string, text: string): Promise<ThreadReplyOutcome | null>;
  /** Not now: the callout stays put off for this session (AC-43); false for no such session. */
  dismiss(id: string): Promise<boolean>;
}

function firstThread(context: readonly { kind: string }[]): ThreadChip | null {
  return (
    (context.find((chip) => chip.kind === 'slack_thread' || chip.kind === 'discord_thread') as
      ThreadChip | undefined) ?? null
  );
}

export function createThreadReplies({ records, save, slack, discord }: ThreadRepliesOptions): ThreadReplies {
  async function send(chip: ThreadChip, text: string): Promise<ThreadReplyAnswer> {
    if (chip.kind === 'slack_thread') {
      const credentials = await slack?.connection.credentials();
      if (credentials?.ok !== true || slack === undefined) {
        return { result: 'failed', reason: "Slack isn't connected. Connect it in Settings." };
      }
      const posted = await slack.client.postReply(credentials.token, credentials.saved.url, chip, text);
      return posted.ok ? { result: 'posted', url: posted.url } : { result: 'failed', reason: posted.reason };
    }
    const credentials = await discord?.connection.credentials();
    if (credentials?.ok !== true || discord === undefined) {
      return { result: 'failed', reason: "Discord isn't connected. Connect it in Settings." };
    }
    const posted = await discord.client.postReply(credentials.token, chip, text);
    return posted.ok ? { result: 'posted', url: posted.url } : { result: 'failed', reason: posted.reason };
  }

  return {
    async post(id, text) {
      const record = await records.get(id);
      if (record === null) return null;
      const { session } = record;
      const chip = firstThread(session.context);
      if (chip === null) return { cannot: 'no_thread' };
      if (session.pullRequest === null) return { cannot: 'no_pull_request' };
      if (session.threadReply?.state === 'posted') return { cannot: 'posted' };
      const answer = await send(chip, text);
      if (answer.result === 'posted') {
        const reply = { state: 'posted' as const, url: answer.url, channel: chip.label?.channel ?? null };
        await save(id, (current) => ({ ...current, session: { ...current.session, threadReply: reply } }));
      }
      return answer;
    },

    async dismiss(id) {
      const saved = await save(id, (current) =>
        current.session.threadReply?.state === 'posted'
          ? current
          : { ...current, session: { ...current.session, threadReply: { state: 'dismissed' } } },
      );
      return saved !== null;
    },
  };
}
