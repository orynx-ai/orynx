import type { DiscordProblem } from './client.ts';

/** What went wrong, in the words Slack's and GitHub's problems use, and spec 016's Q8 for the intent. */
export function describeDiscordProblem(problem: DiscordProblem): string {
  switch (problem.kind) {
    case 'rejected':
      return "Discord didn't accept this token. Check it, or reset it in the Developer Portal.";
    case 'intent_off':
      return 'Turn on Message Content Intent for your bot, then connect again.';
    case 'user_id_needed':
      return 'A team owns this bot. Paste your Discord user ID too.';
    case 'rate_limited':
      return "Discord's rate limit is used up. Try again in a minute.";
    case 'unreachable':
      return "Can't reach discord.com. Check your network or VPN, then try again.";
    case 'timeout':
      return "discord.com didn't answer in 10 seconds. Try again.";
    case 'discord_error':
      return `Discord answered with an error (${String(problem.status)}). Try again in a minute.`;
    case 'dm_closed':
      return "Discord won't let the bot message you. Allow direct messages from a server you share with it.";
  }
}
