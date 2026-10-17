import { z } from 'zod';

/** Settings tabs, in the product spec's order; each is part of the address (`/settings/coding-agent`). */
export const SettingsTabSchema = z.enum(['connections', 'coding-agent', 'repositories', 'inbox-rules', 'appearance']);
export type SettingsTab = z.infer<typeof SettingsTabSchema>;

export const settingsTabLabels: Record<SettingsTab, string> = {
  connections: 'Connections',
  'coding-agent': 'Coding agent',
  repositories: 'Repositories',
  'inbox-rules': 'Inbox rules',
  appearance: 'Appearance',
};
