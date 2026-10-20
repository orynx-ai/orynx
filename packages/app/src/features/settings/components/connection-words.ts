import type { IntegrationId, IntegrationStatus } from '@devhub/contracts';
import type { PillTone, StatusButtonState } from '@devhub/ui';
import { agoText } from '../../../words/ago.ts';

/** The three states Settings › Connections shows (spec 030): `error` needs reconnecting, anything unset is not connected. */
export function lookOf(status: IntegrationStatus): StatusButtonState {
  if (status.state === 'connected') return 'connected';
  if (status.state === 'error') return 'needs_reconnecting';
  return 'not_connected';
}

export const lookWords: Record<StatusButtonState, { label: string; tip: string; tone: PillTone }> = {
  connected: { label: 'Connected', tip: 'Connected · select to manage', tone: 'success' },
  needs_reconnecting: { label: 'Needs reconnecting', tip: 'Needs reconnecting · select to fix', tone: 'warning' },
  not_connected: { label: 'Not connected', tip: 'Not connected · select to connect', tone: 'neutral' },
};

export const toolNames: Record<IntegrationId, string> = { jira: 'Jira', github: 'GitHub', slack: 'Slack' };

/** Under a tool's name until the server has a line for it (specs 003 and 004). */
export const howToConnect: Record<IntegrationId, string> = {
  jira: 'Connect with your site address, email and a personal API token.',
  github: 'Reuses your gh command-line login, or a personal access token.',
  slack: 'Reading your mentions needs a Slack app your admin approves.',
};

/** What leaves the inbox when a tool stops working. */
const items: Record<IntegrationId, string> = { jira: 'tickets', github: 'pull requests', slack: 'mentions' };

/** The dialog's first line, by state (spec 030, 10a). */
export function leadLine(tool: IntegrationId, look: StatusButtonState): string {
  const name = toolNames[tool];
  if (look === 'connected') return `Orynx is using your ${name} login. Nothing here changes ${name} itself.`;
  if (look === 'needs_reconnecting') {
    return `Orynx can no longer reach ${name}, so your ${items[tool]} have stopped updating. Reconnect to pick up where you left off.`;
  }
  if (tool === 'slack') return 'Two steps. Until then, Slack items are left out of your inbox.';
  return `Connect ${name} to see your ${items[tool]} in Orynx.`;
}

/** "Orynx reads" and "Orynx writes" in a tool's details. */
export const reads: Record<IntegrationId, string> = {
  jira: 'Issues assigned to you, your sprint, comments',
  github: 'Pull requests, checks, review comments',
  slack: 'Mentions, DMs, threads you add',
};
export const githubWrites = 'Pushes session branches and opens pull requests on your click';

/** "Just now", then "2 min ago": when the server last asked the tool. */
export function lastCheckedText(checkedAt: string, now: Date): string {
  const text = agoText(Math.max(0, now.getTime() - Date.parse(checkedAt)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}
