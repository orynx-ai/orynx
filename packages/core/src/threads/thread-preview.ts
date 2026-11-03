import { threadFromLink, type ThreadPreviewAnswer } from '@devhub/contracts';
import type { DiscordClient } from '../integrations/discord/client.ts';
import type { DiscordSyncCredentials } from '../integrations/discord/connection.ts';
import type { SlackClient } from '../integrations/slack/client.ts';
import type { SlackSyncCredentials } from '../integrations/slack/connection.ts';

export interface ThreadPreviewOptions {
  slack: SlackClient;
  slackConnection: { credentials(): Promise<SlackSyncCredentials | null> };
  discord: DiscordClient;
  discordConnection: { credentials(): Promise<DiscordSyncCredentials | null> };
}

/**
 * The thread a pasted link names, as its chip will read (spec 016, AC-26): who started it and where, read with the
 * tool's token. Nothing read here is kept or logged.
 */
export function createThreadPreview({ slack, slackConnection, discord, discordConnection }: ThreadPreviewOptions) {
  return async function preview(link: string): Promise<ThreadPreviewAnswer> {
    const chip = threadFromLink(link);
    if (chip === null) return { result: 'not_found' };
    if (chip.kind === 'slack_thread') {
      const credentials = await slackConnection.credentials();
      if (credentials?.ok !== true) return { result: 'not_connected', tool: 'slack' };
      const answer = await slack.thread(credentials.token, chip);
      return answer.ok ? { result: 'found', chip, label: answer.thread.label } : { result: 'not_found' };
    }
    const credentials = await discordConnection.credentials();
    if (credentials?.ok !== true) return { result: 'not_connected', tool: 'discord' };
    const answer = await discord.thread(credentials.token, chip);
    return answer.ok ? { result: 'found', chip, label: answer.thread.label } : { result: 'not_found' };
  };
}
